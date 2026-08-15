import type { AppConfig, GeocoderBounds } from '$lib/types';

const NOMINATIM_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OVERPASS_RETRY_DELAYS_MS = [1200, 2800, 5000];

type OsmReference = {
	type: 'N' | 'W' | 'R';
	id: string;
};

type OsmTypeName = 'node' | 'way' | 'relation';

type OverpassElement = {
	type: OsmTypeName | string;
	id: number | string;
	tags?: Record<string, string>;
};

type OverpassResponse = {
	elements?: OverpassElement[];
	remark?: string;
};

type OsmGeoJsonRelation = {
	role?: string;
	rel?: number | string;
	reltags?: Record<string, string>;
};

type OsmGeoJsonProperties = {
	type?: string;
	id?: number | string;
	tags?: Record<string, string>;
	relations?: OsmGeoJsonRelation[];
};

type OsmGeoJsonFeature = GeoJSON.Feature<GeoJSON.Geometry, OsmGeoJsonProperties> & {
	id?: number | string;
};

type OsmToGeoJson = (
	data: unknown,
	options?: { flatProperties?: boolean }
) => GeoJSON.FeatureCollection<GeoJSON.Geometry, OsmGeoJsonProperties>;

type NumericBounds = {
	west: number;
	south: number;
	east: number;
	north: number;
};

export type GeocoderResult = {
	place_id: number | string;
	display_name: string;
	name?: string;
	lat: string;
	lon: string;
	osm_type?: string;
	osm_id?: number | string;
	boundingbox?: string[];
	geojson?: GeoJSON.Geometry;
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
	private site: Pick<AppConfig['site'], 'name' | 'url'> | undefined;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private requestId = 0;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Static request cache, not Svelte UI state.
	private static cache = new Map<string, GeocoderResult[]>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Static request cache, not Svelte UI state.
	private static geometryCache = new Map<string, GeoJSON.Geometry | null>();
	private static nextRequestAt = 0;
	private static requestQueue = Promise.resolve();

	constructor(config: AppConfig['search'], site?: Pick<AppConfig['site'], 'name' | 'url'>) {
		this.config = config;
		this.site = site;
	}

	setConfig(config: AppConfig['search'], site?: Pick<AppConfig['site'], 'name' | 'url'>) {
		this.config = config;
		this.site = site;
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

		const osmId = this.parseOsmReference(normalizedTerm);

		if (!osmId && normalizedTerm.length < this.config.minLength) {
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

		if (osmId) {
			await this.lookupSearch(osmId);
			return;
		}

		const searchQuery = this.searchQuery(normalizedTerm);
		const cacheKey = this.cacheKey(searchQuery);
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
			q: searchQuery,
			limit: String(this.config.limit),
			countrycodes: this.config.countryCodes,
			viewbox: this.viewboxParam(this.bounds),
			bounded: '1'
		});

		try {
			await GeocoderService.waitForRequestSlot(this.config.minRequestIntervalMs);

			if (currentRequest !== this.requestId) return;

			const response = await fetch(`${NOMINATIM_SEARCH_ENDPOINT}?${searchParams.toString()}`, {
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

		const normalizedTerm = this.searchTerm.trim();
		this.loading =
			(normalizedTerm.length >= this.config.minLength ||
				!!this.parseOsmReference(normalizedTerm)) &&
			!!this.bounds;
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

	getOsmId(result: GeocoderResult) {
		return this.lookupOsmId(result);
	}

	private async lookupSearch(osmId: string) {
		const cacheKey = `overpass-geom|${osmId}|${this.boundsCacheKey()}`;
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

		try {
			const result = await this.fetchOverpassResult(osmId);
			const boundedResults =
				result && this.lookupResultIsInsideBounds(result, this.bounds) ? [result] : [];

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

	async lookupGeometry(result: GeocoderResult) {
		const osmId = this.lookupOsmId(result);
		if (!osmId) return undefined;

		if (isGeoJsonGeometry(result.geojson)) {
			const cacheKey = `overpass-geom|${osmId}`;
			GeocoderService.geometryCache.set(cacheKey, result.geojson);
			return result.geojson;
		}

		return this.lookupGeometryByOsmId(osmId);
	}

	async lookupGeometryByOsmId(osmId: string) {
		const cacheKey = `overpass-geom|${osmId}`;
		const cachedGeometry = GeocoderService.geometryCache.get(cacheKey);
		if (cachedGeometry !== undefined) return cachedGeometry ?? undefined;

		try {
			const overpassResult = await this.fetchOverpassResult(osmId);
			if (!overpassResult) {
				GeocoderService.geometryCache.set(cacheKey, null);
				return undefined;
			}

			const geometry = isGeoJsonGeometry(overpassResult?.geojson)
				? overpassResult.geojson
				: undefined;

			GeocoderService.geometryCache.set(cacheKey, geometry ?? null);
			return geometry;
		} catch (error) {
			console.warn('Could not fetch OpenStreetMap geometry from Overpass:', error);
			return undefined;
		}
	}

	private searchQuery(normalizedTerm: string) {
		const placeName = this.config.appendPlaceName?.trim();
		return placeName ? `${normalizedTerm}, ${placeName}` : normalizedTerm;
	}

	private async fetchOverpassResult(osmId: string) {
		const osmReference = this.parseOsmId(osmId);
		if (!osmReference) return undefined;

		let lastError: unknown;

		for (let attempt = 0; attempt <= OVERPASS_RETRY_DELAYS_MS.length; attempt += 1) {
			try {
				const response = await this.fetchOverpassJson(this.overpassQuery(osmReference));
				return await this.overpassResponseToResult(response, osmReference);
			} catch (error) {
				lastError = error;

				if (attempt === OVERPASS_RETRY_DELAYS_MS.length) break;

				await sleep(OVERPASS_RETRY_DELAYS_MS[attempt]);
			}
		}

		console.warn('Could not fetch OpenStreetMap object from Overpass:', lastError);
		throw lastError;
	}

	private async fetchOverpassJson(query: string) {
		await GeocoderService.waitForRequestSlot(this.config.minRequestIntervalMs);

		// Browsers cannot set User-Agent; keep the app origin available as Referer for Overpass identification.
		const response = await fetch(OVERPASS_ENDPOINT, {
			method: 'POST',
			headers: {
				Accept: 'application/json'
			},
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Local request body for one Overpass lookup.
			body: new URLSearchParams({ data: query }),
			referrerPolicy: 'strict-origin-when-cross-origin'
		});

		if (!response.ok) {
			throw new Error(`Overpass object lookup failed with status ${response.status}`);
		}

		const overpassResponse = (await response.json()) as OverpassResponse;
		if (typeof overpassResponse.remark === 'string' && overpassResponse.remark.trim()) {
			throw new Error(`Overpass object lookup returned remark: ${overpassResponse.remark}`);
		}

		return overpassResponse;
	}

	private overpassQuery(osmReference: OsmReference) {
		const type = this.osmTypeName(osmReference.type);
		const selector = `${type}(${osmReference.id});`;
		const output = `${selector}\n${osmReference.type === 'N' ? 'out body;' : 'out geom;'}`;

		return `${this.overpassAppComment()}
[out:json][timeout:25];
${output}`;
	}

	private overpassAppComment() {
		const name = this.site?.name?.trim() || 'Rotterdam Time Machine';
		const url = this.site?.url?.trim() || getBrowserOrigin();
		const identification = [name, url].filter(Boolean).join(' ');

		return `/* ${identification.replaceAll('*/', '* /')} */`;
	}

	private async overpassResponseToResult(response: OverpassResponse, osmReference: OsmReference) {
		const feature = await this.findOsmFeature(response, osmReference);
		if (!feature || !isGeoJsonGeometry(feature.geometry)) return undefined;

		const bounds = this.geometryBounds(feature.geometry);
		if (!bounds) return undefined;

		const [lon, lat] = this.boundsCenter(bounds);
		const osmType = this.osmTypeName(osmReference.type);
		const tags =
			this.osmFeatureTags(feature, osmReference) ??
			this.overpassElementTags(response, osmReference) ??
			{};
		const label = this.osmLabel(osmType, osmReference.id, tags);

		return {
			place_id: `overpass:${osmReference.type}${osmReference.id}`,
			display_name: label,
			name: label,
			lat: String(lat),
			lon: String(lon),
			osm_type: osmType,
			osm_id: osmReference.id,
			boundingbox: this.geocoderBoundingBox(bounds),
			geojson: feature.geometry
		} satisfies GeocoderResult;
	}

	private async findOsmFeature(response: OverpassResponse, osmReference: OsmReference) {
		const convertOsmToGeoJson = await loadOsmToGeoJson();
		const featureCollection = convertOsmToGeoJson(response, {
			flatProperties: false
		});
		const features = featureCollection.features.filter((feature): feature is OsmGeoJsonFeature =>
			isGeoJsonGeometry(feature.geometry)
		);
		const exactFeature = features.find((feature) =>
			this.featureMatchesOsmReference(feature, osmReference)
		);
		if (exactFeature) return exactFeature;

		if (osmReference.type === 'R') {
			const relationFeature = features.find((feature) =>
				this.featureReferencesRelation(feature, osmReference.id)
			);
			if (relationFeature) return relationFeature;
		}

		return features.length === 1 ? features[0] : undefined;
	}

	private featureMatchesOsmReference(feature: OsmGeoJsonFeature, osmReference: OsmReference) {
		const featureId = this.osmFeatureId(osmReference);
		if (String(feature.id) === featureId) return true;

		const properties = feature.properties;
		return (
			properties?.type === this.osmTypeName(osmReference.type) &&
			String(properties.id) === osmReference.id
		);
	}

	private featureReferencesRelation(feature: OsmGeoJsonFeature, relationId: string) {
		return (
			feature.properties?.relations?.some((relation) => String(relation.rel) === relationId) ??
			false
		);
	}

	private osmFeatureTags(feature: OsmGeoJsonFeature, osmReference: OsmReference) {
		if (this.featureMatchesOsmReference(feature, osmReference)) return feature.properties?.tags;

		return feature.properties?.relations?.find(
			(relation) => String(relation.rel) === osmReference.id
		)?.reltags;
	}

	private overpassElementTags(response: OverpassResponse, osmReference: OsmReference) {
		return response.elements?.find(
			(element) =>
				element.type === this.osmTypeName(osmReference.type) &&
				String(element.id) === osmReference.id
		)?.tags;
	}

	private cacheKey(searchQuery: string) {
		return `${searchQuery.toLocaleLowerCase('nl-NL')}|${this.boundsCacheKey()}`;
	}

	private boundsCacheKey() {
		const bounds = this.bounds;
		return bounds
			? [bounds.west, bounds.south, bounds.east, bounds.north]
					.map((value) => value.toFixed(5))
					.join(',')
			: 'no-bounds';
	}

	private viewboxParam(bounds: GeocoderBounds) {
		return [bounds.west, bounds.north, bounds.east, bounds.south].join(',');
	}

	private parseOsmReference(value: string) {
		const normalizedValue = value.trim();
		const directMatch = normalizedValue.match(
			/^(?:osm:?)?\s*(node|way|relation|[nwr])\s*[:/#-]?\s*(\d+)$/i
		);
		if (directMatch) {
			const type = this.lookupOsmType(directMatch[1]);
			return type ? `${type}${directMatch[2]}` : undefined;
		}

		const pathMatch = normalizedValue.match(/(?:^|\/)(node|way|relation)\/(\d+)(?:[/?#].*)?$/i);
		if (!pathMatch) return undefined;

		const type = this.lookupOsmType(pathMatch[1]);
		return type ? `${type}${pathMatch[2]}` : undefined;
	}

	private lookupOsmId(result: GeocoderResult) {
		const osmType = this.lookupOsmType(result.osm_type);
		const osmId = result.osm_id;
		if (!osmType || osmId === undefined || osmId === null) return undefined;

		const normalizedId = String(osmId).trim();
		return normalizedId ? `${osmType}${normalizedId}` : undefined;
	}

	private parseOsmId(osmId: string): OsmReference | undefined {
		const match = osmId.match(/^([NWR])(\d+)$/);
		if (!match) return undefined;

		return {
			type: match[1] as OsmReference['type'],
			id: match[2]
		};
	}

	private lookupOsmType(osmType: string | undefined) {
		const normalizedType = osmType?.trim().toLowerCase();

		if (normalizedType === 'node' || normalizedType === 'n') return 'N';
		if (normalizedType === 'way' || normalizedType === 'w') return 'W';
		if (normalizedType === 'relation' || normalizedType === 'r') return 'R';

		return undefined;
	}

	private osmTypeName(osmType: OsmReference['type']): OsmTypeName {
		if (osmType === 'N') return 'node';
		if (osmType === 'W') return 'way';
		return 'relation';
	}

	private osmFeatureId(osmReference: OsmReference) {
		return `${this.osmTypeName(osmReference.type)}/${osmReference.id}`;
	}

	private resultIsInsideBounds(result: GeocoderResult, bounds: GeocoderBounds | undefined) {
		if (!bounds) return false;

		const lat = Number(result.lat);
		const lon = Number(result.lon);
		if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

		return lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north;
	}

	private lookupResultIsInsideBounds(result: GeocoderResult, bounds: GeocoderBounds | undefined) {
		return (
			this.resultIsInsideBounds(result, bounds) ||
			this.resultBoundingBoxIntersectsBounds(result, bounds)
		);
	}

	private resultBoundingBoxIntersectsBounds(
		result: GeocoderResult,
		bounds: GeocoderBounds | undefined
	) {
		if (!bounds || !Array.isArray(result.boundingbox) || result.boundingbox.length < 4) {
			return false;
		}

		const [south, north, west, east] = result.boundingbox.map(Number);
		if (![south, north, west, east].every(Number.isFinite)) return false;

		return (
			east >= bounds.west && west <= bounds.east && north >= bounds.south && south <= bounds.north
		);
	}

	private geometryBounds(geometry: GeoJSON.Geometry): NumericBounds | undefined {
		if (geometry.type === 'Point') return this.positionBounds(geometry.coordinates);
		if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
			return this.positionsBounds(geometry.coordinates);
		}
		if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') {
			return this.positionListsBounds(geometry.coordinates);
		}
		if (geometry.type === 'MultiPolygon')
			return this.positionNestedListsBounds(geometry.coordinates);
		if (geometry.type === 'GeometryCollection')
			return this.geometryCollectionBounds(geometry.geometries);

		return undefined;
	}

	private positionBounds(position: GeoJSON.Position): NumericBounds | undefined {
		const lon = Number(position[0]);
		const lat = Number(position[1]);
		if (!Number.isFinite(lon) || !Number.isFinite(lat)) return undefined;

		return {
			west: lon,
			south: lat,
			east: lon,
			north: lat
		};
	}

	private positionsBounds(positions: GeoJSON.Position[]) {
		return positions.reduce<NumericBounds | undefined>(
			(bounds, position) => this.extendBounds(bounds, this.positionBounds(position)),
			undefined
		);
	}

	private positionListsBounds(positionLists: GeoJSON.Position[][]) {
		return positionLists.reduce<NumericBounds | undefined>(
			(bounds, positions) => this.extendBounds(bounds, this.positionsBounds(positions)),
			undefined
		);
	}

	private positionNestedListsBounds(positionNestedLists: GeoJSON.Position[][][]) {
		return positionNestedLists.reduce<NumericBounds | undefined>(
			(bounds, positionLists) => this.extendBounds(bounds, this.positionListsBounds(positionLists)),
			undefined
		);
	}

	private geometryCollectionBounds(geometries: GeoJSON.Geometry[]) {
		return geometries.reduce<NumericBounds | undefined>(
			(bounds, geometry) => this.extendBounds(bounds, this.geometryBounds(geometry)),
			undefined
		);
	}

	private extendBounds(bounds: NumericBounds | undefined, nextBounds: NumericBounds | undefined) {
		if (!nextBounds) return bounds;
		if (!bounds) return { ...nextBounds };

		return {
			west: Math.min(bounds.west, nextBounds.west),
			south: Math.min(bounds.south, nextBounds.south),
			east: Math.max(bounds.east, nextBounds.east),
			north: Math.max(bounds.north, nextBounds.north)
		};
	}

	private boundsCenter(bounds: NumericBounds): [number, number] {
		return [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];
	}

	private geocoderBoundingBox(bounds: NumericBounds) {
		return [bounds.south, bounds.north, bounds.west, bounds.east].map(String);
	}

	private osmLabel(osmType: OsmTypeName, id: string, tags: Record<string, string> = {}) {
		return tags.name?.trim() || this.osmAddressLabel(tags) || `OSM ${osmType} ${id}`;
	}

	private osmAddressLabel(tags: Record<string, string>) {
		const street = tags['addr:street']?.trim();
		const houseNumber = tags['addr:housenumber']?.trim();
		const place = tags['addr:place']?.trim();

		if (street && houseNumber) return `${street} ${houseNumber}`;
		return street || place;
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

function isGeoJsonGeometry(value: unknown): value is GeoJSON.Geometry {
	if (!value || typeof value !== 'object') return false;

	const geometry = value as Partial<GeoJSON.Geometry>;
	return (
		typeof geometry.type === 'string' &&
		[
			'Point',
			'MultiPoint',
			'LineString',
			'MultiLineString',
			'Polygon',
			'MultiPolygon',
			'GeometryCollection'
		].includes(geometry.type)
	);
}

let osmtogeojsonPromise: Promise<OsmToGeoJson> | undefined;

async function loadOsmToGeoJson() {
	osmtogeojsonPromise ??= import('osmtogeojson').then((module) => {
		const converter = (module as unknown as { default?: OsmToGeoJson }).default ?? module;
		return converter as OsmToGeoJson;
	});

	return osmtogeojsonPromise;
}

function getBrowserOrigin() {
	return typeof window === 'undefined' ? '' : window.location.origin;
}

function sleep(durationMs: number) {
	return new Promise((resolve) => setTimeout(resolve, durationMs));
}
