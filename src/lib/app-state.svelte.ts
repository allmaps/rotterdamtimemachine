const FAVORITES_STORAGE_PREFIX = 'favorites';
const FAVORITES_STORAGE_VERSION = 1;

let favoritesStorageKey = getFavoritesStorageKey('default');
let allowedFavoriteAnnotations: string[] | undefined;
let favoritesConfigSignature = '';
let storageListenerReady = false;

function getLocalStorage() {
	return typeof localStorage === 'undefined' ? undefined : localStorage;
}

function readFavorites(key = favoritesStorageKey) {
	const storage = getLocalStorage();
	if (!storage) return [];

	return parseFavoritesValue(storage.getItem(key));
}

function parseFavoritesValue(value: string | null) {
	if (!value) return [];

	try {
		const parsed = JSON.parse(value);
		const items = parsed?.items;

		return Array.isArray(items) ? items.filter((item) => typeof item === 'string') : [];
	} catch {
		return [];
	}
}

function saveFavorites() {
	const storage = getLocalStorage();
	if (!storage) return;

	try {
		storage.setItem(
			favoritesStorageKey,
			JSON.stringify({
				version: FAVORITES_STORAGE_VERSION,
				items: [...favorites]
			})
		);
	} catch (error) {
		console.warn('Could not persist favorites:', error);
	}
}

export const favorites = $state<string[]>(readFavorites());

export function configureFavoritesStorage(scope: string, availableAnnotations: string[]) {
	const nextStorageKey = getFavoritesStorageKey(scope);
	const nextAllowedAnnotations = [...availableAnnotations];
	const nextSignature = `${nextStorageKey}\n${availableAnnotations.join('\n')}`;

	allowedFavoriteAnnotations = nextAllowedAnnotations;
	favoritesStorageKey = nextStorageKey;
	ensureStorageListener();

	if (nextSignature === favoritesConfigSignature) {
		pruneUnavailableFavorites();
		return;
	}

	favoritesConfigSignature = nextSignature;

	const nextFavorites = normalizeFavorites(readFavorites(nextStorageKey));

	replaceFavorites(nextFavorites);
	saveFavorites();
}

export function toggleFavorite(annotation: string) {
	if (allowedFavoriteAnnotations && !allowedFavoriteAnnotations.includes(annotation)) return;

	const index = favorites.indexOf(annotation);
	if (index === -1) {
		favorites.push(annotation);
	} else {
		favorites.splice(index, 1);
	}
	saveFavorites();
}

function getFavoritesStorageKey(scope: string) {
	const normalizedScope = scope.trim() || 'default';
	return `${FAVORITES_STORAGE_PREFIX}:${normalizedScope}`;
}

function normalizeFavorites(items: string[]) {
	const normalized: string[] = [];
	const seen: string[] = [];

	for (const item of items) {
		if (seen.includes(item)) continue;
		if (allowedFavoriteAnnotations && !allowedFavoriteAnnotations.includes(item)) continue;

		seen.push(item);
		normalized.push(item);
	}

	return normalized;
}

function pruneUnavailableFavorites() {
	const normalized = normalizeFavorites([...favorites]);
	if (!sameFavorites(normalized, favorites)) {
		replaceFavorites(normalized);
		saveFavorites();
	}
}

function replaceFavorites(items: string[]) {
	if (sameFavorites(items, favorites)) return;
	favorites.splice(0, favorites.length, ...items);
}

function sameFavorites(left: readonly string[], right: readonly string[]) {
	return left.length === right.length && left.every((item, index) => item === right[index]);
}

function ensureStorageListener() {
	if (storageListenerReady || typeof window === 'undefined') return;

	window.addEventListener('storage', (event) => {
		if (event.key !== favoritesStorageKey) return;
		replaceFavorites(normalizeFavorites(parseFavoritesValue(event.newValue)));
	});

	storageListenerReady = true;
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
	rightAnnotation: '',
	rightOpacity: 100
});
