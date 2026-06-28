function readFavorites() {
	if (typeof localStorage === 'undefined') return [];

	try {
		const parsed = JSON.parse(localStorage.getItem('favorites') ?? '[]');
		return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
	} catch {
		return [];
	}
}

function saveFavorites() {
	if (typeof localStorage !== 'undefined') {
		try {
			localStorage.setItem('favorites', JSON.stringify(favorites));
		} catch {
			// Favorites remain available in this session if storage fails.
		}
	}
}

export const favorites = $state<string[]>(readFavorites());

export function toggleFavorite(annotation: string) {
	const index = favorites.indexOf(annotation);
	if (index === -1) {
		favorites.push(annotation);
	} else {
		favorites.splice(index, 1);
	}
	saveFavorites();
}

export const viewState = $state({ annotation: '', opacity: 100 });

export const flyTo = $state<{ center: [number, number] | null }>({ center: null });

export const selectedLocation = $state<{ center: [number, number] | null }>({ center: null });

export const mapView = $state({
	center: [0, 0] as [number, number],
	zoom: 1,
	bearing: 0
});

export const comparison = $state({
	active: false,
	leftAnnotation: '',
	rightAnnotation: '',
	leftOpacity: 100,
	rightOpacity: 100
});
