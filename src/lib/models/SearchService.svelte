<script module lang="ts">
	export type SearchResult = {
		place_id: number | string;
		display_name: string;
		lat: string;
		lon: string;
		type?: string;
		class?: string;
	};

	export class SearchService {
		searchTerm = $state('');
		results: SearchResult[] = $state([]);
		loading = $state(false);
		error: string | null = $state(null);
		private timer: ReturnType<typeof setTimeout> | null = null;
		private requestId = 0;

		async search() {
			if (!this.searchTerm.trim()) {
				this.results = [];
				this.loading = false;
				this.error = null;
				return;
			}

			const currentRequest = ++this.requestId;
			this.loading = true;
			this.error = null;

			const searchParams = new URLSearchParams({
				format: 'json',
				q: `${this.searchTerm}, Rotterdam`,
				limit: '8',
				countrycodes: 'nl'
			});

			try {
				const response = await fetch(
					`https://nominatim.openstreetmap.org/search?${searchParams.toString()}`
				);

				if (!response.ok) {
					throw new Error(`Search failed with status ${response.status}`);
				}

				const results = (await response.json()) as SearchResult[];

				if (currentRequest === this.requestId) {
					this.results = results;
				}
			} catch (error) {
				if (currentRequest === this.requestId) {
					console.error(error);
					this.results = [];
					this.error = 'Zoeken is tijdelijk niet beschikbaar.';
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

			this.loading = true;
			this.error = null;
			this.timer = setTimeout(() => this.search(), 400);
		}

		reset() {
			if (this.timer) clearTimeout(this.timer);
			this.results = [];
			this.loading = false;
			this.error = null;
		}

		selectLocation(result: SearchResult): [number, number] {
			this.reset();
			this.searchTerm = result.display_name;
			return [parseFloat(result.lon), parseFloat(result.lat)];
		}
	}
</script>
