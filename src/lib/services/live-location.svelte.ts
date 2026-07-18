import {
	clearStoredUserLocations,
	liveUserLocation,
	liveUserLocationTracking,
	setLiveUserLocation,
	setLiveUserLocationTrackingStatus
} from '$lib/app-state.svelte.js';
import type { AppConfig } from '$lib/types';

type DeviceOrientationEventWithCompass = DeviceOrientationEvent & {
	webkitCompassHeading?: number;
};
type DeviceOrientationEventConstructorWithPermission = typeof DeviceOrientationEvent & {
	requestPermission?: () => Promise<PermissionState>;
};

let userLocationWatchId: number | undefined;
let firstLiveLocationFixReceived = false;
let latestUserPosition: GeolocationPosition | undefined;
let compassHeading: number | undefined;
let compassPermissionRequested = false;
let compassListenerActive = false;
let startRequestId = 0;
let positionSequence = 0;

export const liveLocationError = $state<{ message: string }>({ message: '' });

export async function toggleLiveUserLocationTracking(config: AppConfig['search']) {
	if (liveUserLocationTracking.status !== 'off') {
		stopLiveUserLocationTracking();
		return;
	}

	await startLiveUserLocationTracking(config);
}

export async function startLiveUserLocationTracking(config: AppConfig['search']) {
	const requestId = ++startRequestId;
	liveLocationError.message = '';

	if (typeof navigator === 'undefined' || !navigator.geolocation) {
		liveLocationError.message = config.locationUnsupported;
		return;
	}

	clearStoredUserLocations();
	stopLiveUserLocationWatch();
	setLiveUserLocation(undefined);
	setLiveUserLocationTrackingStatus('locating');

	firstLiveLocationFixReceived = false;
	latestUserPosition = undefined;
	positionSequence = 0;

	await startCompassTracking();
	if (requestId !== startRequestId || liveUserLocationTracking.status !== 'locating') return;

	userLocationWatchId = navigator.geolocation.watchPosition(
		handleLiveUserPosition,
		(error) => handleUserLocationError(error, config),
		{ enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
	);
}

export function stopLiveUserLocationTracking() {
	startRequestId += 1;
	liveLocationError.message = '';
	stopLiveUserLocationWatch();
	stopCompassTracking();
	setLiveUserLocation(undefined);
	setLiveUserLocationTrackingStatus('off');
	firstLiveLocationFixReceived = false;
	latestUserPosition = undefined;
	compassHeading = undefined;
	positionSequence = 0;
}

export function releaseLiveUserLocationFollow() {
	if (liveUserLocationTracking.status !== 'off') {
		setLiveUserLocationTrackingStatus('passive');
	}
}

export function resumeLiveUserLocationFollow() {
	if (liveUserLocation.current && liveUserLocationTracking.status !== 'off') {
		setLiveUserLocationTrackingStatus('active');
	}
}

function handleLiveUserPosition(position: GeolocationPosition) {
	if (liveUserLocationTracking.status === 'off') return;

	const center: [number, number] = [position.coords.longitude, position.coords.latitude];

	latestUserPosition = position;
	setLiveUserLocation({
		id: 'user:current',
		center,
		heading: getBestHeading(position.coords.heading),
		accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
		positionSequence: ++positionSequence,
		source: 'user',
		updatedAt: Date.now()
	});

	if (firstLiveLocationFixReceived) return;

	firstLiveLocationFixReceived = true;
	if (liveUserLocationTracking.status === 'locating') {
		setLiveUserLocationTrackingStatus('active');
	}
}

function handleUserLocationError(error: GeolocationPositionError, config: AppConfig['search']) {
	if (firstLiveLocationFixReceived) {
		liveLocationError.message = getLocationErrorMessage(error, config);
		return;
	}

	stopLiveUserLocationWatch();
	setLiveUserLocation(undefined);
	setLiveUserLocationTrackingStatus('off');
	liveLocationError.message = getLocationErrorMessage(error, config);
}

function getLocationErrorMessage(error: GeolocationPositionError, config: AppConfig['search']) {
	if (error.code === error.PERMISSION_DENIED) return config.locationDenied;
	if (error.code === error.TIMEOUT) return config.locationTimeout;
	return config.locationUnavailable;
}

async function startCompassTracking() {
	if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;

	const orientationEvent = window.DeviceOrientationEvent as
		| DeviceOrientationEventConstructorWithPermission
		| undefined;
	if (!orientationEvent) return;

	if (typeof orientationEvent.requestPermission === 'function' && !compassPermissionRequested) {
		compassPermissionRequested = true;

		try {
			const permission = await orientationEvent.requestPermission();
			if (permission !== 'granted') return;
		} catch {
			return;
		}
	}

	if (compassListenerActive) return;

	window.addEventListener('deviceorientation', handleDeviceOrientation, true);
	compassListenerActive = true;
}

function stopCompassTracking() {
	if (typeof window === 'undefined' || !compassListenerActive) return;

	window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
	compassListenerActive = false;
}

function handleDeviceOrientation(event: DeviceOrientationEvent) {
	const heading = getDeviceOrientationHeading(event);
	if (heading === undefined) return;

	compassHeading = heading;
	if (latestUserPosition) {
		updateLiveUserLocationHeading(latestUserPosition);
	}
}

function updateLiveUserLocationHeading(position: GeolocationPosition) {
	if (liveUserLocationTracking.status === 'off') return;

	const center: [number, number] = [position.coords.longitude, position.coords.latitude];

	setLiveUserLocation({
		id: 'user:current',
		center,
		heading: getBestHeading(position.coords.heading),
		accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
		positionSequence,
		source: 'user',
		updatedAt: Date.now()
	});
}

function getDeviceOrientationHeading(event: DeviceOrientationEvent) {
	const compassEvent = event as DeviceOrientationEventWithCompass;
	if (Number.isFinite(compassEvent.webkitCompassHeading)) {
		return normalizeHeading(compassEvent.webkitCompassHeading);
	}

	if (event.absolute && Number.isFinite(event.alpha)) {
		return normalizeHeading(360 - Number(event.alpha));
	}

	return undefined;
}

function getBestHeading(geolocationHeading: number | null) {
	if (compassHeading !== undefined) return compassHeading;
	return normalizeHeading(geolocationHeading);
}

function normalizeHeading(value: number | null | undefined) {
	if (!Number.isFinite(value)) return undefined;
	return ((Number(value) % 360) + 360) % 360;
}

function stopLiveUserLocationWatch() {
	if (typeof navigator === 'undefined' || userLocationWatchId === undefined) return;

	navigator.geolocation.clearWatch(userLocationWatchId);
	userLocationWatchId = undefined;
}
