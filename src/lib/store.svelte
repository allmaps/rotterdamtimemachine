<script module lang="ts">
	const savedFavorites =
		typeof localStorage !== 'undefined'
			? JSON.parse(localStorage.getItem('favorites') ?? '[]')
			: [];

	export const favorites = $state<string[]>(savedFavorites);

	export function toggleFavorite(annotation: string) {
		const index = favorites.indexOf(annotation);
		if (index === -1) {
			favorites.push(annotation);
		} else {
			favorites.splice(index, 1);
		}
		localStorage.setItem('favorites', JSON.stringify(favorites));
	}

	export const viewState = $state({ annotation: '', opacity: 100 });

	export const flyTo = $state<{ center: [number, number] | null }>({ center: null });

	export const selectedLocation = $state<{ center: [number, number] | null }>({ center: null });

	export const mapView = $state({ center: [4.4777, 51.9244] as [number, number], zoom: 12 });

	export const comparison = $state({
		active: false,
		leftAnnotation: '',
		rightAnnotation: '',
		leftOpacity: 100,
		rightOpacity: 100
	});
</script>
