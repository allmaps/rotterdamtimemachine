const FAVORITES_STORAGE_PREFIX = 'favorites';
const FAVORITES_STORAGE_VERSION = 1;
const STORED_LOCATIONS_STORAGE_PREFIX = 'locations';
const STORED_LOCATIONS_STORAGE_VERSION = 1;
const STORED_LOCATIONS_LIMIT = 25;

let favoritesStorageKey = getFavoritesStorageKey('default');
let allowedFavoriteAnnotations: string[] | undefined;
let favoritesConfigSignature = '';
let favoritesStorageListenerReady = false;
let storedLocationsStorageKey = getStoredLocationsStorageKey('default');
let storedLocationsConfigSignature = '';
let storedLocationsStorageListenerReady = false;

export type StoredLocation = {
	id: string;
	label: string;
	center: [number, number];
	source: 'search';
	createdAt: number;
};

export type LiveUserLocation = {
	id: string;
	center: [number, number];
	heading?: number;
	accuracy?: number;
	positionSequence: number;
	source: 'user';
	updatedAt: number;
};

export type LiveUserLocationTrackingStatus = 'off' | 'locating' | 'active' | 'passive';

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
	if (favoritesStorageListenerReady || typeof window === 'undefined') return;

	window.addEventListener('storage', (event) => {
		if (event.key !== favoritesStorageKey) return;
		replaceFavorites(normalizeFavorites(parseFavoritesValue(event.newValue)));
	});

	favoritesStorageListenerReady = true;
}

function readStoredLocations(key = storedLocationsStorageKey) {
	const storage = getLocalStorage();
	if (!storage) return [];

	return parseStoredLocationsValue(storage.getItem(key));
}

function parseStoredLocationsValue(value: string | null) {
	if (!value) return [];

	try {
		const parsed = JSON.parse(value);
		const items = parsed?.items;

		return Array.isArray(items)
			? items
					.map(normalizeStoredLocation)
					.filter((location): location is StoredLocation => !!location)
			: [];
	} catch {
		return [];
	}
}

function normalizeStoredLocation(value: unknown): StoredLocation | undefined {
	if (!value || typeof value !== 'object') return undefined;

	const location = value as Partial<StoredLocation>;
	const center = location.center;
	if (!Array.isArray(center) || center.length < 2) return undefined;

	const lng = Number(center[0]);
	const lat = Number(center[1]);
	if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;

	const id = typeof location.id === 'string' && location.id.trim() ? location.id : undefined;
	const label =
		typeof location.label === 'string' && location.label.trim() ? location.label.trim() : undefined;
	const source = typeof location.source === 'string' ? location.source : 'search';
	const createdAt = Number(location.createdAt);

	if (!id || !label || source !== 'search') return undefined;

	return {
		id,
		label,
		center: [lng, lat],
		source: 'search',
		createdAt: Number.isFinite(createdAt) ? createdAt : Date.now()
	};
}

function saveStoredLocations() {
	const storage = getLocalStorage();
	if (!storage) return;

	try {
		storage.setItem(
			storedLocationsStorageKey,
			JSON.stringify({
				version: STORED_LOCATIONS_STORAGE_VERSION,
				items: [...storedLocations]
			})
		);
	} catch (error) {
		console.warn('Could not persist stored locations:', error);
	}
}

export const storedLocations = $state<StoredLocation[]>(readStoredLocations());
export const liveUserLocation = $state<{ current?: LiveUserLocation }>({});
export const liveUserLocationTracking = $state<{ status: LiveUserLocationTrackingStatus }>({
	status: 'off'
});

export function configureStoredLocationsStorage(scope: string) {
	const nextStorageKey = getStoredLocationsStorageKey(scope);
	const nextSignature = nextStorageKey;

	storedLocationsStorageKey = nextStorageKey;
	ensureStoredLocationsStorageListener();

	if (nextSignature === storedLocationsConfigSignature) return;

	storedLocationsConfigSignature = nextSignature;
	replaceStoredLocations(readStoredLocations(nextStorageKey));
}

export function addStoredLocation(
	location: Omit<StoredLocation, 'createdAt'> & { createdAt?: number }
) {
	const normalized = normalizeStoredLocation({
		...location,
		createdAt: location.createdAt ?? Date.now()
	});
	if (!normalized) return;

	const nextLocations = [
		normalized,
		...storedLocations.filter((item) => item.id !== normalized.id)
	].slice(0, STORED_LOCATIONS_LIMIT);

	replaceStoredLocations(nextLocations);
	saveStoredLocations();
}

export function clearStoredLocations() {
	if (storedLocations.length === 0) return;

	replaceStoredLocations([]);
	saveStoredLocations();
}

export function removeStoredLocation(id: string) {
	const nextLocations = storedLocations.filter((location) => location.id !== id);
	if (nextLocations.length === storedLocations.length) return;

	replaceStoredLocations(nextLocations);
	saveStoredLocations();
}

export function clearStoredUserLocations() {
	saveStoredLocations();
}

export function setLiveUserLocation(location: LiveUserLocation | undefined) {
	liveUserLocation.current = location;
}

export function setLiveUserLocationTrackingStatus(status: LiveUserLocationTrackingStatus) {
	liveUserLocationTracking.status = status;
}

function getStoredLocationsStorageKey(scope: string) {
	const normalizedScope = scope.trim() || 'default';
	return `${STORED_LOCATIONS_STORAGE_PREFIX}:${normalizedScope}`;
}

function replaceStoredLocations(items: StoredLocation[]) {
	storedLocations.splice(0, storedLocations.length, ...items);
}

function ensureStoredLocationsStorageListener() {
	if (storedLocationsStorageListenerReady || typeof window === 'undefined') return;

	window.addEventListener('storage', (event) => {
		if (event.key !== storedLocationsStorageKey) return;
		replaceStoredLocations(parseStoredLocationsValue(event.newValue));
	});

	storedLocationsStorageListenerReady = true;
}

export const viewState = $state({ annotation: '', opacity: 100 });

export const flyTo = $state<{ center: [number, number] | null }>({ center: null });

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
