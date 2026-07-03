import type { AppConfig, GeocoderBounds } from '$lib/types';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export type GeocoderResult = {
	place_id: number | string;
	display_name: string;
	lat: string;
	lon: string;
	type?: string;
	class?: string;
};

export class GeocoderService {
	searchTerm = $state('');
	results: GeocoderResult[] = $state([]);
	loading = $state(false);
	error: string | null = $state(null);
	hasSearched = $state(false);
	bounds: GeocoderBounds | undefined = $state();
	private config: AppConfig['search'];
	private timer: ReturnType<typeof setTimeout> | null = null;
	private requestId = 0;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Static request cache, not Svelte UI state.
	private static cache = new Map<string, GeocoderResult[]>();
	private static nextRequestAt = 0;
	private static requestQueue = Promise.resolve();

	constructor(config: AppConfig['search']) {
		this.config = config;
	}

	setConfig(config: AppConfig['search']) {
		this.config = config;
	}

	async search() {
		const normalizedTerm = this.searchTerm.trim();

		if (!normalizedTerm) {
			this.results = [];
			this.loading = false;
			this.error = null;
			this.hasSearched = false;
			return;
		}

		if (normalizedTerm.length < this.config.minLength) {
			this.results = [];
			this.loading = false;
			this.error = this.config.minimumCharacters;
			this.hasSearched = true;
			return;
		}

		if (!this.bounds) {
			this.results = [];
			this.loading = false;
			this.error = this.config.notReady;
			this.hasSearched = true;
			return;
		}

		const cacheKey = this.cacheKey(normalizedTerm);
		const cachedResults = GeocoderService.cache.get(cacheKey);
		if (cachedResults) {
			this.results = cachedResults;
			this.loading = false;
			this.error = null;
			this.hasSearched = true;
			return;
		}

		const currentRequest = ++this.requestId;
		this.loading = true;
		this.error = null;

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Local URL builder for a single request.
		const searchParams = new URLSearchParams({
			format: 'jsonv2',
			q: normalizedTerm,
			limit: String(this.config.limit),
			countrycodes: this.config.countryCodes,
			viewbox: this.viewboxParam(this.bounds),
			bounded: '1'
		});

		try {
			await GeocoderService.waitForRequestSlot(this.config.minRequestIntervalMs);

			if (currentRequest !== this.requestId) return;

			const response = await fetch(`${NOMINATIM_ENDPOINT}?${searchParams.toString()}`, {
				headers: {
					Accept: 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`Search failed with status ${response.status}`);
			}

			const results = (await response.json()) as GeocoderResult[];
			const boundedResults = results.filter((result) =>
				this.resultIsInsideBounds(result, this.bounds)
			);

			if (currentRequest === this.requestId) {
				GeocoderService.setCachedResults(cacheKey, boundedResults, this.config.cacheLimit);
				this.results = boundedResults;
				this.hasSearched = true;
			}
		} catch (error) {
			if (currentRequest === this.requestId) {
				console.error(error);
				this.results = [];
				this.error = this.config.unavailable;
				this.hasSearched = true;
			}
		} finally {
			if (currentRequest === this.requestId) {
				this.loading = false;
			}
		}
	}

	searchWithDelay() {
		if (this.timer) clearTimeout(this.timer);

		if (!this.searchTerm.trim()) {
			this.reset();
			return;
		}

		this.loading = this.searchTerm.trim().length >= this.config.minLength && !!this.bounds;
		this.error = null;
		this.hasSearched = false;
		this.timer = setTimeout(() => this.search(), this.config.debounceMs);
	}

	reset() {
		if (this.timer) clearTimeout(this.timer);
		this.requestId += 1;
		this.results = [];
		this.loading = false;
		this.error = null;
		this.hasSearched = false;
	}

	selectLocation(result: GeocoderResult): [number, number] {
		this.reset();
		this.searchTerm = result.display_name;
		return [parseFloat(result.lon), parseFloat(result.lat)];
	}

	private cacheKey(normalizedTerm: string) {
		const bounds = this.bounds;
		const normalizedBounds = bounds
			? [bounds.west, bounds.south, bounds.east, bounds.north]
					.map((value) => value.toFixed(5))
					.join(',')
			: 'no-bounds';

		return `${normalizedTerm.toLocaleLowerCase('nl-NL')}|${normalizedBounds}`;
	}

	private viewboxParam(bounds: GeocoderBounds) {
		return [bounds.west, bounds.north, bounds.east, bounds.south].join(',');
	}

	private resultIsInsideBounds(result: GeocoderResult, bounds: GeocoderBounds | undefined) {
		if (!bounds) return false;

		const lat = Number(result.lat);
		const lon = Number(result.lon);
		if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

		return lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north;
	}

	private static setCachedResults(key: string, results: GeocoderResult[], cacheLimit: number) {
		GeocoderService.cache.set(key, results);

		if (GeocoderService.cache.size > cacheLimit) {
			const oldestKey = GeocoderService.cache.keys().next().value;
			if (oldestKey) GeocoderService.cache.delete(oldestKey);
		}
	}

	private static async waitForRequestSlot(minRequestIntervalMs: number) {
		const previousRequest = GeocoderService.requestQueue;
		let releaseRequest!: () => void;
		GeocoderService.requestQueue = new Promise<void>((resolve) => {
			releaseRequest = resolve;
		});

		await previousRequest;

		const wait = Math.max(0, GeocoderService.nextRequestAt - Date.now());
		if (wait > 0) {
			await new Promise((resolve) => setTimeout(resolve, wait));
		}

		GeocoderService.nextRequestAt = Date.now() + minRequestIntervalMs;
		releaseRequest();
	}
}
