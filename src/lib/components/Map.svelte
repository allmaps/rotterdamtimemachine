<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import maplibregl from 'maplibre-gl';
	import { WarpedMapLayer } from '@allmaps/maplibre';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import {
		viewState,
		flyTo,
		liveUserLocation,
		liveUserLocationTracking,
		setLiveUserLocationTrackingStatus,
		storedLocations
	} from '$lib/app-state.svelte.js';
	import { getProtomapsLayers, getProtomapsStyle } from '$lib/basemap';
	import { getThemeColor } from '$lib/theme';
	import { annotationsByMapId, getWarpedMapList, mapIdsByAnnotation } from '$lib/warped-map-list';
	import MapControls from '$lib/components/MapControls.svelte';
	import MapVisibilityWarning from '$lib/components/MapVisibilityWarning.svelte';
	import type { LiveUserLocation, StoredLocation } from '$lib/app-state.svelte.js';
	import type {
		AppConfig,
		GeocoderBounds,
		MapKeyboardCommand,
		MapLocation,
		MapLocationSyncCommand,
		MapToolbarCommand
	} from '$lib/types';

	type CameraPadding = {
		top: number;
		right: number;
		bottom: number;
		left: number;
	};
	type ScreenRect = {
		left: number;
		right: number;
		top: number;
		bottom: number;
	};
	type SelectedMapVisibility =
		| 'fully-visible'
		| 'partly-visible'
		| 'tiny-visible'
		| 'not-visible'
		| 'unknown';
	type MapTouchInteractionState = {
		dragPan: boolean;
		touchZoomRotate: boolean;
	};
	type LocationMarker = StoredLocation | LiveUserLocation;

	const CAMERA_BASE_PADDING = 40;
	const CAMERA_PANEL_GAP = 16;
	const DESKTOP_SLIDER_INSET = 96;
	const DEFAULT_LOCATION_FLY_TO_ZOOM = 16;
	const MAX_LOCATION_FLY_TO_ZOOM = 17;
	const MAPLIBRE_TILE_SIZE = 512;
	const WEB_MERCATOR_WORLD_WIDTH = 40075016.68557849;
	const ZOOM_EPSILON = 0.001;
	const DEFAULT_AUTO_ZOOM_OUT_THRESHOLD = 0.25;
	const DEFAULT_VISIBILITY_PADDING = 48;
	const DEFAULT_TINY_VISIBILITY_AREA_RATIO = 0.03;
	const ZOOM_LIMIT_MAX_ATTEMPTS = 8;
	const ZOOM_LIMIT_RETRY_DELAY_MS = 50;
	const DEFAULT_OVERVIEW_TILES_RESOLUTION = 2048 * 2048;
	const LOCATION_SOURCE_ID = 'selected-location-source';
	const LOCATION_LIVE_PULSE_LAYER_ID = 'selected-location-live-pulse';
	const LOCATION_HEADING_LAYER_ID = 'selected-location-heading';
	const LOCATION_CIRCLE_LAYER_ID = 'selected-location-circle';
	const LOCATION_LABEL_LAYER_ID = 'selected-location-label';
	const LIVE_LOCATION_CONE_IMAGE_ID = 'live-location-heading-cone';
	const LIVE_LOCATION_PULSE_DURATION_MS = 1800;
	const LIVE_LOCATION_MOVE_DURATION_MS = 650;
	const LIVE_LOCATION_MOVE_EPSILON = 0.0000001;
	const EMPTY_LOCATION_DATA: GeoJSON.FeatureCollection<GeoJSON.Point> = {
		type: 'FeatureCollection',
		features: []
	};

	let {
		config,
		annotation = $bindable(viewState.annotation),
		opacity = $bindable(viewState.opacity),
		rotateToMapOrientation = $bindable(false),
		focusActiveMap = $bindable(false),
		viewsLinked = $bindable(false),
		locationSyncCommand,
		inViewOnly = $bindable(false),
		currentLocation = $bindable({
			center: [...config.map.initialView.center] as [number, number],
			zoom: config.map.initialView.zoom,
			bearing: config.map.initialView.bearing
		}),
		annotationsInView = $bindable<string[]>([]),
		// eslint-disable-next-line no-useless-assignment -- This bindable prop is written back to the parent.
		annotationsAtCenter = $bindable<string[]>([]),
		// eslint-disable-next-line no-useless-assignment -- This bindable prop is written back to the parent.
		mapIdsAtCenter = $bindable<string[]>([]),
		// eslint-disable-next-line no-useless-assignment -- This bindable prop is written back to the parent.
		geocoderBounds = $bindable(),
		mapKeyboardCommand,
		mapToolbarCommand,
		enableFlyTo = false,
		enableLocationMarker = false,
		navPosition = 'left',
		controlsPosition = 'top-right',
		showZoomControls = true,
		showLinkControl = false,
		showInViewControl = false,
		onLocationChange,
		autoplayActive = false,
		autoplayNextAnnotation,
		loaded = $bindable(false)
	}: {
		config: AppConfig;
		annotation?: string;
		opacity?: number;
		rotateToMapOrientation?: boolean;
		focusActiveMap?: boolean;
		viewsLinked?: boolean;
		locationSyncCommand?: MapLocationSyncCommand;
		inViewOnly?: boolean;
		currentLocation?: MapLocation;
		annotationsInView?: string[];
		annotationsAtCenter?: string[];
		mapIdsAtCenter?: string[];
		geocoderBounds?: GeocoderBounds;
		mapKeyboardCommand?: MapKeyboardCommand;
		mapToolbarCommand?: MapToolbarCommand;
		enableFlyTo?: boolean;
		enableLocationMarker?: boolean;
		navPosition?: 'left' | 'right';
		controlsPosition?: 'top-left' | 'top-right';
		showZoomControls?: boolean;
		showLinkControl?: boolean;
		showInViewControl?: boolean;
		onLocationChange?: (location: MapLocation) => void;
		autoplayActive?: boolean;
		autoplayNextAnnotation?: string;
		loaded?: boolean;
	} = $props();

	let activeAnnotation = $derived(annotation);
	let activeOpacity = $derived((opacity ?? 100) / 100);

	let mapElement = $state<HTMLDivElement>();
	let map = $state<maplibregl.Map>();
	let mapReady: boolean = $state(false);
	let selectedMapVisibility = $state<SelectedMapVisibility>('unknown');
	let visibilityWarningOpen = $state(false);
	let dismissedVisibilityWarningAnnotation: string | undefined;
	let previousAnnotationForVisibility: string | undefined;
	let previousAnnotationForZoomLimit: string | undefined;
	let previousAnnotationForOrientation: string | undefined;
	let previousAnnotationForFocus: string | undefined;
	let previousRotateToMapOrientation = rotateToMapOrientation;
	let previousRotateToMapOrientationForFocus = rotateToMapOrientation;
	let previousFocusActiveMap = focusActiveMap;
	let previousKeyboardCommandId = 0;
	let previousToolbarCommandId = 0;
	let commandIdsInitialized = false;
	let mapTouchInteractionState: MapTouchInteractionState | undefined;
	let preferredSelectionZoom: number | undefined;
	let pendingZoomLimitAnnotation: string | undefined;
	let pendingZoomLimitAttempt = 0;
	let zoomLimitVisibilityCheckAnnotation: string | undefined;
	let deferredVisibilityWarningAnnotation: string | undefined;
	let zoomLimitFrame: number | undefined;
	let zoomLimitRetryTimer: ReturnType<typeof setTimeout> | undefined;
	let visibilityCheckFrame: number | undefined;
	let locationPulseFrame: number | undefined;
	let locationPulseStartedAt = 0;
	let liveLocationAnimationFrame: number | undefined;
	let liveLocationAnimationStartedAt = 0;
	let liveLocationAnimationFromCenter: [number, number] | undefined;
	let liveLocationAnimationTarget: LiveUserLocation | undefined;
	let liveLocationAnimationStoredLocations: StoredLocation[] = [];
	let renderedLiveUserLocation: LiveUserLocation | undefined;
	let liveLocationFollowInitialized = false;
	let liveLocationInitialFlyToActive = false;
	let liveLocationInitialFlyToPending = false;
	let previousLiveLocationFollowSequence = 0;
	let isSyncing = false;
	let previousLocationSyncCommandId = 0;
	let activeLocationSyncCommandId = 0;
	let warpedMapList = getWarpedMapList();
	let warpedMapLayer = new WarpedMapLayer({
		visible: false,
		overviewTilesMaxResolution: DEFAULT_OVERVIEW_TILES_RESOLUTION,
		overviewTilesSelection: 'lowest',
		warpedMapList
	});

	const basemapLayers = untrack(() =>
		getProtomapsLayers('light', undefined, { lang: config.site.locale })
	);
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Internal MapLibre image loading cache, not UI state.
	const loadedStyleImages = new Set<string>();
	let canZoomToActiveMap = $derived(
		loaded && !!activeAnnotation && (mapIdsByAnnotation.get(activeAnnotation)?.size ?? 0) > 0
	);
	let selectedMapCenter = $derived(
		loaded && activeAnnotation ? getSelectedMapCenter(activeAnnotation) : undefined
	);

	// Load the warped map layer when the selected annotation changes.
	$effect(() => {
		const annotationToShow = activeAnnotation;
		const annotationToAnticipate = autoplayActive ? autoplayNextAnnotation : undefined;

		if (loaded && mapIdsByAnnotation.size > 0) {
			const idsToShow = annotationToShow
				? (mapIdsByAnnotation.get(annotationToShow) ?? new Set<string>())
				: new Set<string>();
			const idsToAnticipate = annotationToAnticipate
				? (mapIdsByAnnotation.get(annotationToAnticipate) ?? new Set<string>())
				: new Set<string>();

			warpedMapLayer.setMapsOptions((id: string) => ({
				visible: idsToShow.has(id),
				anticipateVisibility: idsToAnticipate.has(id)
			}));
		}
	});

	// Apply warped map opacity.
	$effect(() => {
		if (loaded) {
			warpedMapLayer.setOpacity(activeOpacity);
		}
	});

	// Fly to the selected search location.
	$effect(() => {
		const center = flyTo.center;
		if (enableFlyTo && mapReady && map && center) {
			const cameraPadding = getCameraPadding();
			const zoom = untrack(getLocationFlyToZoom);
			clearPreferredSelectionZoom();
			map.flyTo({
				center,
				zoom,
				offset: getCameraOffset(cameraPadding)
			});
			flyTo.center = null;
		}
	});

	// Follow the live user location until the user moves the map.
	$effect(() => {
		const trackingStatus = liveUserLocationTracking.status;
		const userLocation = liveUserLocation.current ? { ...liveUserLocation.current } : undefined;
		const annotationForZoom = activeAnnotation;

		if (trackingStatus !== 'active') {
			liveLocationFollowInitialized = false;
			liveLocationInitialFlyToActive = false;
			liveLocationInitialFlyToPending = false;
			previousLiveLocationFollowSequence = 0;
		}

		if (!enableFlyTo || !mapReady || !map || trackingStatus !== 'active' || !userLocation) return;
		if (userLocation.positionSequence === previousLiveLocationFollowSequence) return;

		previousLiveLocationFollowSequence = userLocation.positionSequence;
		followLiveUserLocation(userLocation, annotationForZoom);
	});

	// Show saved search and locator points.
	$effect(() => {
		const searchLocations = storedLocations.map((location) => ({ ...location }));
		const userLocation = liveUserLocation.current ? { ...liveUserLocation.current } : undefined;

		if (enableLocationMarker && loaded && map) {
			updateStoredLocationLayer(searchLocations, userLocation);
		}
	});

	// Synchronize the map position with the bound location.
	$effect(() => {
		if (!mapReady || !map || !currentLocation) return;

		const pendingAnimatedSync =
			locationSyncCommand && locationSyncCommand.id !== previousLocationSyncCommandId
				? locationSyncCommand
				: undefined;

		if (
			!pendingAnimatedSync &&
			activeLocationSyncCommandId &&
			locationSyncCommand?.id === activeLocationSyncCommandId
		) {
			return;
		}

		const targetLocation = pendingAnimatedSync?.location ?? currentLocation;
		const center = targetLocation.center;
		const zoom = targetLocation.zoom;
		const bearing = targetLocation.bearing ?? 0;
		if (!mapMatchesLocation(center, zoom, bearing)) {
			clearPreferredSelectionZoom();

			if (pendingAnimatedSync) {
				previousLocationSyncCommandId = pendingAnimatedSync.id;
				activeLocationSyncCommandId = pendingAnimatedSync.id;
				isSyncing = true;
				map.stop();
				map.once('moveend', () => {
					if (activeLocationSyncCommandId === pendingAnimatedSync.id) {
						activeLocationSyncCommandId = 0;
					}
					isSyncing = false;
				});
				map.flyTo({ center, zoom, bearing, pitch: 0, essential: true });
			} else {
				isSyncing = true;
				map.jumpTo({ center, zoom, bearing });
				isSyncing = false;
			}
		} else if (pendingAnimatedSync) {
			previousLocationSyncCommandId = pendingAnimatedSync.id;
			activeLocationSyncCommandId = 0;
		}
	});

	// Warn only after selection or loading; ordinary map movements should not keep interrupting.
	$effect(() => {
		const annotationForCheck = activeAnnotation;
		if (annotationForCheck !== previousAnnotationForVisibility) {
			previousAnnotationForVisibility = annotationForCheck;
			dismissedVisibilityWarningAnnotation = undefined;
			visibilityWarningOpen = false;
		}

		if (loaded && mapReady && map && annotationForCheck) {
			queueSelectedMapVisibilityCheck(annotationForCheck, true);
		} else {
			selectedMapVisibility = 'unknown';
			visibilityWarningOpen = false;
		}
	});

	$effect(() => {
		if (autoplayActive || focusActiveMap) {
			visibilityWarningOpen = false;
		}
	});

	$effect(() => {
		const annotationForLimit = activeAnnotation;
		const zoomLimitEnabled = !focusActiveMap && liveUserLocationTracking.status !== 'active';

		if (!annotationForLimit) {
			previousAnnotationForZoomLimit = undefined;
			cancelPendingSelectedMapZoomLimit();
			clearPreferredSelectionZoom();
			return;
		}

		if (!loaded || !mapReady || !map) return;
		if (!zoomLimitEnabled) {
			previousAnnotationForZoomLimit = annotationForLimit;
			cancelPendingSelectedMapZoomLimit();
			return;
		}
		if (annotationForLimit === previousAnnotationForZoomLimit) return;

		previousAnnotationForZoomLimit = annotationForLimit;
		queueSelectedMapZoomLimit(annotationForLimit);
	});

	$effect(() => {
		const shouldRotate = rotateToMapOrientation;
		const annotationForOrientation = activeAnnotation;
		if (!loaded || !mapReady || !map) return;

		const orientationChanged = shouldRotate !== previousRotateToMapOrientation;
		const annotationChanged = annotationForOrientation !== previousAnnotationForOrientation;
		previousRotateToMapOrientation = shouldRotate;
		previousAnnotationForOrientation = annotationForOrientation;

		if (!orientationChanged && !annotationChanged) return;
		if (orientationChanged && !autoplayActive) clearPreferredSelectionZoom();

		if (shouldRotate && annotationForOrientation) {
			rotateToSelectedMapOrientation(annotationForOrientation);
		} else if (orientationChanged) {
			map.easeTo({ bearing: 0, pitch: 0, duration: 250 });
		}
	});

	$effect(() => {
		const shouldFocus = focusActiveMap;
		const shouldRotate = rotateToMapOrientation;
		const annotationForFocus = activeAnnotation;
		if (!loaded || !mapReady || !map) return;

		const focusChanged = shouldFocus !== previousFocusActiveMap;
		const orientationChanged = shouldRotate !== previousRotateToMapOrientationForFocus;
		const annotationChanged = annotationForFocus !== previousAnnotationForFocus;
		previousFocusActiveMap = shouldFocus;
		previousRotateToMapOrientationForFocus = shouldRotate;
		previousAnnotationForFocus = annotationForFocus;

		if (focusChanged && !autoplayActive) clearPreferredSelectionZoom();
		if (!shouldFocus || !annotationForFocus) return;
		if (focusChanged || orientationChanged || annotationChanged) {
			focusSelectedMap(annotationForFocus);
		}
	});

	$effect(() => {
		if (commandIdsInitialized) return;

		previousKeyboardCommandId = mapKeyboardCommand?.id ?? 0;
		previousToolbarCommandId = mapToolbarCommand?.id ?? 0;
		commandIdsInitialized = true;
	});

	$effect(() => {
		if (!mapReady || !map) return;

		setPresentationTouchMapInteractionsDisabled(autoplayActive && isTouchInteractionDevice());
	});

	$effect(() => {
		const command = mapKeyboardCommand;
		if (!mapReady || !map || !command || command.id === previousKeyboardCommandId) return;

		previousKeyboardCommandId = command.id;

		let zoom = command.zoomDelta === undefined ? map.getZoom() : map.getZoom() + command.zoomDelta;

		handleUserCameraAction();
		map.easeTo({
			duration: 300,
			easeId: 'keyboardHandler',
			center: map.getCenter(),
			zoom,
			pitch: 0,
			offset: command.offset ?? [0, 0]
		});
	});

	$effect(() => {
		const command = mapToolbarCommand;
		if (!command || command.id === previousToolbarCommandId) return;

		previousToolbarCommandId = command.id;

		if (command.action === 'toggle-in-view') {
			if (inViewOnly || annotationsInView.length > 0) {
				inViewOnly = !inViewOnly;
			}
			return;
		}

		if (!canZoomToActiveMap) return;

		if (command.action === 'toggle-rotation') {
			rotateToMapOrientation = !rotateToMapOrientation;
		} else if (command.action === 'toggle-focus') {
			focusActiveMap = !focusActiveMap;
		}
	});

	function mapMatchesLocation(center: [number, number], zoom: number, bearing: number) {
		if (!map) return false;
		const c = map.getCenter();
		return (
			Math.abs(c.lng - center[0]) < 0.000001 &&
			Math.abs(c.lat - center[1]) < 0.000001 &&
			Math.abs(map.getZoom() - zoom) < 0.000001 &&
			bearingDifference(map.getBearing(), bearing) < 0.000001
		);
	}

	function bearingDifference(a: number, b: number) {
		return Math.abs(((a - b + 540) % 360) - 180);
	}

	function isImageUrl(id: string) {
		return /^https?:\/\//.test(id) || id.startsWith('/') || id.startsWith('data:');
	}

	function followLiveUserLocation(
		userLocation: LiveUserLocation,
		annotationForZoom = activeAnnotation
	) {
		if (!map) return;

		const zoom = getLocationFlyToZoom(annotationForZoom);
		const bearing = map.getBearing();
		if (mapMatchesLocation(userLocation.center, zoom, bearing)) return;

		if (liveLocationInitialFlyToActive) {
			liveLocationInitialFlyToPending = true;
			return;
		}

		if (!liveLocationFollowInitialized || userLocation.positionSequence === 1) {
			liveLocationFollowInitialized = true;
			liveLocationInitialFlyToActive = true;
			liveLocationInitialFlyToPending = false;
			map.stop();
			map.once('moveend', handleLiveLocationInitialFlyToEnd);
			map.flyTo({
				center: userLocation.center,
				zoom,
				bearing,
				pitch: 0,
				offset: getCameraOffset(getCameraPadding()),
				essential: true
			});
			return;
		}

		map.easeTo({
			center: userLocation.center,
			zoom,
			bearing,
			pitch: 0,
			duration: LIVE_LOCATION_MOVE_DURATION_MS,
			essential: true
		});
	}

	function handleLiveLocationInitialFlyToEnd() {
		liveLocationInitialFlyToActive = false;
		if (!liveLocationInitialFlyToPending) return;

		liveLocationInitialFlyToPending = false;
		if (liveUserLocationTracking.status !== 'active' || !liveUserLocation.current) return;

		followLiveUserLocation({ ...liveUserLocation.current }, activeAnnotation);
	}

	function handleUserCameraAction() {
		clearPreferredSelectionZoom();
		if ((enableFlyTo || viewsLinked) && liveUserLocationTracking.status === 'active') {
			setLiveUserLocationTrackingStatus('passive');
		}
	}

	function createLocationData(
		locations: LocationMarker[]
	): GeoJSON.FeatureCollection<GeoJSON.Point> {
		return {
			type: 'FeatureCollection',
			features: locations.map((location) => {
				const heading = location.source === 'user' ? location.heading : undefined;

				return {
					type: 'Feature',
					geometry: {
						type: 'Point',
						coordinates: location.center
					},
					properties: {
						id: location.id,
						label: location.source === 'search' ? location.label : '',
						source: location.source,
						heading: heading ?? 0,
						hasHeading: heading !== undefined,
						isLive: location.source === 'user'
					}
				};
			})
		};
	}

	function updateStoredLocationLayer(
		searchLocations: StoredLocation[],
		userLocation: LiveUserLocation | undefined
	) {
		if (!map) return;

		ensureSelectedLocationLayer();
		map.setPaintProperty(LOCATION_CIRCLE_LAYER_ID, 'circle-color', getBrandMainColor());
		map.setPaintProperty(LOCATION_LIVE_PULSE_LAYER_ID, 'circle-color', getBrandMainColor());
		setLiveLocationPulseActive(!!userLocation);

		if (!userLocation) {
			cancelLiveLocationAnimation();
			renderedLiveUserLocation = undefined;
			setLocationSourceData(searchLocations);
			return;
		}

		updateLiveLocationMarker(searchLocations, userLocation);
	}

	function setLocationSourceData(
		searchLocations: StoredLocation[],
		userLocation: LiveUserLocation | undefined = renderedLiveUserLocation
	) {
		const source = map?.getSource(LOCATION_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
		source?.setData(
			createLocationData(userLocation ? [...searchLocations, userLocation] : searchLocations)
		);
	}

	function updateLiveLocationMarker(
		searchLocations: StoredLocation[],
		userLocation: LiveUserLocation
	) {
		liveLocationAnimationStoredLocations = searchLocations;

		if (
			liveLocationAnimationFrame !== undefined &&
			liveLocationAnimationTarget &&
			centersMatch(userLocation.center, liveLocationAnimationTarget.center)
		) {
			liveLocationAnimationTarget = { ...userLocation };
			return;
		}

		const fromCenter = renderedLiveUserLocation?.center;
		if (!fromCenter || centersMatch(fromCenter, userLocation.center)) {
			cancelLiveLocationAnimation();
			renderedLiveUserLocation = { ...userLocation };
			setLocationSourceData(searchLocations);
			return;
		}

		startLiveLocationAnimation(userLocation, fromCenter);
	}

	function startLiveLocationAnimation(
		userLocation: LiveUserLocation,
		fromCenter: [number, number]
	) {
		cancelLiveLocationAnimation();
		liveLocationAnimationStartedAt = performance.now();
		liveLocationAnimationFromCenter = [...fromCenter];
		liveLocationAnimationTarget = { ...userLocation };
		liveLocationAnimationFrame = requestAnimationFrame(animateLiveLocationMarker);
	}

	function animateLiveLocationMarker(timestamp: number) {
		if (!map || !liveLocationAnimationFromCenter || !liveLocationAnimationTarget) {
			cancelLiveLocationAnimation();
			return;
		}

		const elapsed = timestamp - liveLocationAnimationStartedAt;
		const progress = Math.min(elapsed / LIVE_LOCATION_MOVE_DURATION_MS, 1);
		const easedProgress = easeOutCubic(progress);
		const target = liveLocationAnimationTarget;

		renderedLiveUserLocation = {
			...target,
			center: interpolateCenter(liveLocationAnimationFromCenter, target.center, easedProgress)
		};
		setLocationSourceData(liveLocationAnimationStoredLocations);

		if (progress < 1) {
			liveLocationAnimationFrame = requestAnimationFrame(animateLiveLocationMarker);
			return;
		}

		renderedLiveUserLocation = { ...target };
		liveLocationAnimationFrame = undefined;
		liveLocationAnimationFromCenter = undefined;
		liveLocationAnimationTarget = undefined;
		setLocationSourceData(liveLocationAnimationStoredLocations);
	}

	function cancelLiveLocationAnimation() {
		if (liveLocationAnimationFrame !== undefined) {
			cancelAnimationFrame(liveLocationAnimationFrame);
		}

		liveLocationAnimationFrame = undefined;
		liveLocationAnimationFromCenter = undefined;
		liveLocationAnimationTarget = undefined;
	}

	function interpolateCenter(
		fromCenter: [number, number],
		toCenter: [number, number],
		progress: number
	): [number, number] {
		return [
			fromCenter[0] + (toCenter[0] - fromCenter[0]) * progress,
			fromCenter[1] + (toCenter[1] - fromCenter[1]) * progress
		];
	}

	function easeOutCubic(progress: number) {
		return 1 - Math.pow(1 - progress, 3);
	}

	function centersMatch(left: [number, number], right: [number, number]) {
		return (
			Math.abs(left[0] - right[0]) < LIVE_LOCATION_MOVE_EPSILON &&
			Math.abs(left[1] - right[1]) < LIVE_LOCATION_MOVE_EPSILON
		);
	}

	function ensureSelectedLocationLayer() {
		if (!map) return;

		if (!map.getSource(LOCATION_SOURCE_ID)) {
			map.addSource(LOCATION_SOURCE_ID, {
				type: 'geojson',
				data: EMPTY_LOCATION_DATA
			});
		}

		ensureLiveLocationConeImage();

		if (!map.getLayer(LOCATION_LIVE_PULSE_LAYER_ID)) {
			map.addLayer({
				id: LOCATION_LIVE_PULSE_LAYER_ID,
				type: 'circle',
				source: LOCATION_SOURCE_ID,
				filter: ['==', ['get', 'isLive'], true],
				paint: {
					'circle-radius': 10,
					'circle-radius-transition': { duration: 0 },
					'circle-color': getBrandMainColor(),
					'circle-opacity': 0.18,
					'circle-opacity-transition': { duration: 0 },
					'circle-stroke-width': 0
				}
			});
		}

		if (!map.getLayer(LOCATION_HEADING_LAYER_ID)) {
			map.addLayer({
				id: LOCATION_HEADING_LAYER_ID,
				type: 'symbol',
				source: LOCATION_SOURCE_ID,
				filter: ['==', ['get', 'hasHeading'], true],
				layout: {
					'icon-image': LIVE_LOCATION_CONE_IMAGE_ID,
					'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.48, 15, 0.72, 18, 0.9],
					'icon-anchor': 'center',
					'icon-rotate': ['get', 'heading'],
					'icon-rotation-alignment': 'map',
					'icon-allow-overlap': true,
					'icon-ignore-placement': true
				}
			});
		}

		if (!map.getLayer(LOCATION_CIRCLE_LAYER_ID)) {
			map.addLayer({
				id: LOCATION_CIRCLE_LAYER_ID,
				type: 'circle',
				source: LOCATION_SOURCE_ID,
				paint: {
					'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 15, 7, 18, 10],
					'circle-color': getBrandMainColor(),
					'circle-opacity': 0.82,
					'circle-stroke-color': '#ffffff',
					'circle-stroke-opacity': 0.95,
					'circle-stroke-width': 2
				}
			});
		}

		if (!map.getLayer(LOCATION_LABEL_LAYER_ID)) {
			map.addLayer({
				id: LOCATION_LABEL_LAYER_ID,
				type: 'symbol',
				source: LOCATION_SOURCE_ID,
				layout: {
					'text-field': ['get', 'label'],
					'text-font': ['Noto Sans Medium'],
					'text-size': 13,
					'text-anchor': 'top',
					'text-offset': [0, 1.3],
					'text-optional': true
				},
				paint: {
					'text-color': '#111827',
					'text-halo-color': '#ffffff',
					'text-halo-width': 1.6
				}
			});
		}
	}

	function clearSelectedLocationCircle() {
		const source = map?.getSource(LOCATION_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
		source?.setData(EMPTY_LOCATION_DATA);
		setLiveLocationPulseActive(false);
		cancelLiveLocationAnimation();
		renderedLiveUserLocation = undefined;
	}

	function ensureLiveLocationConeImage() {
		if (!map || typeof document === 'undefined' || map.hasImage(LIVE_LOCATION_CONE_IMAGE_ID))
			return;

		const image = createLiveLocationConeImage(getBrandMainColor());
		if (image) {
			map.addImage(LIVE_LOCATION_CONE_IMAGE_ID, image, { pixelRatio: 2 });
		}
	}

	function createLiveLocationConeImage(color: string) {
		const displaySize = 96;
		const pixelRatio = 2;
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');
		if (!context) return undefined;

		canvas.width = displaySize * pixelRatio;
		canvas.height = displaySize * pixelRatio;
		context.scale(pixelRatio, pixelRatio);

		const center = displaySize / 2;
		const gradient = context.createLinearGradient(center, center, center, 4);
		gradient.addColorStop(0, getColorWithAlpha(color, 0.34));
		gradient.addColorStop(0.7, getColorWithAlpha(color, 0.12));
		gradient.addColorStop(1, getColorWithAlpha(color, 0.02));

		context.beginPath();
		context.moveTo(center, center);
		context.lineTo(center - 25, 10);
		context.quadraticCurveTo(center, 0, center + 25, 10);
		context.closePath();
		context.fillStyle = gradient;
		context.fill();

		return context.getImageData(0, 0, canvas.width, canvas.height);
	}

	function getColorWithAlpha(color: string, alpha: number) {
		const [red, green, blue] = [1, 3, 5].map((start) =>
			Number.parseInt(color.slice(start, start + 2), 16)
		);

		return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
	}

	function setLiveLocationPulseActive(active: boolean) {
		if (!map) return;

		if (!active) {
			cancelLiveLocationPulse();
			if (map.getLayer(LOCATION_LIVE_PULSE_LAYER_ID)) {
				map.setPaintProperty(LOCATION_LIVE_PULSE_LAYER_ID, 'circle-opacity', 0);
			}
			return;
		}

		if (locationPulseFrame !== undefined) return;
		locationPulseStartedAt = performance.now();
		locationPulseFrame = requestAnimationFrame(animateLiveLocationPulse);
	}

	function animateLiveLocationPulse(timestamp: number) {
		if (!map || !map.getLayer(LOCATION_LIVE_PULSE_LAYER_ID)) {
			locationPulseFrame = undefined;
			return;
		}

		const elapsed = timestamp - locationPulseStartedAt;
		const phase = (elapsed % LIVE_LOCATION_PULSE_DURATION_MS) / LIVE_LOCATION_PULSE_DURATION_MS;
		map.setPaintProperty(LOCATION_LIVE_PULSE_LAYER_ID, 'circle-radius', 8 + phase * 18);
		map.setPaintProperty(LOCATION_LIVE_PULSE_LAYER_ID, 'circle-opacity', 0.24 * (1 - phase));
		locationPulseFrame = requestAnimationFrame(animateLiveLocationPulse);
	}

	function cancelLiveLocationPulse() {
		if (locationPulseFrame === undefined) return;

		cancelAnimationFrame(locationPulseFrame);
		locationPulseFrame = undefined;
	}

	function getBrandMainColor() {
		return getThemeColor(config.theme);
	}

	function isTouchInteractionDevice() {
		if (typeof window === 'undefined') return false;

		return window.matchMedia('(pointer: coarse), (hover: none)').matches;
	}

	function setPresentationTouchMapInteractionsDisabled(disabled: boolean) {
		if (!map) return;

		if (disabled) {
			if (mapTouchInteractionState) return;

			mapTouchInteractionState = {
				dragPan: map.dragPan.isEnabled(),
				touchZoomRotate: map.touchZoomRotate.isEnabled()
			};
			map.dragPan.disable();
			map.touchZoomRotate.disable();
			return;
		}

		if (!mapTouchInteractionState) return;

		if (mapTouchInteractionState.dragPan) map.dragPan.enable();
		if (mapTouchInteractionState.touchZoomRotate) map.touchZoomRotate.enable();
		mapTouchInteractionState = undefined;
	}

	function clearPreferredSelectionZoom() {
		preferredSelectionZoom = undefined;
	}

	function queueSelectedMapZoomLimit(annotationForLimit: string) {
		if (!map) return;

		preferredSelectionZoom ??= map.getZoom();
		pendingZoomLimitAnnotation = annotationForLimit;
		pendingZoomLimitAttempt = 0;
		requestSelectedMapZoomLimit();
	}

	function requestSelectedMapZoomLimit() {
		cancelPendingSelectedMapZoomLimitFrame();

		zoomLimitFrame = requestAnimationFrame(() => {
			zoomLimitFrame = undefined;
			applyPendingSelectedMapZoomLimit();
		});
	}

	function applyPendingSelectedMapZoomLimit() {
		if (!map || !pendingZoomLimitAnnotation) return;

		const annotationForLimit = pendingZoomLimitAnnotation;
		if (focusActiveMap) {
			pendingZoomLimitAnnotation = undefined;
			return;
		}

		if (annotationForLimit !== activeAnnotation) {
			pendingZoomLimitAnnotation = undefined;
			return;
		}

		const maxZoom = getSelectedMapNativeMaxZoom(annotationForLimit);
		if (maxZoom === undefined) {
			if (pendingZoomLimitAttempt < ZOOM_LIMIT_MAX_ATTEMPTS) {
				pendingZoomLimitAttempt += 1;
				zoomLimitRetryTimer = setTimeout(requestSelectedMapZoomLimit, ZOOM_LIMIT_RETRY_DELAY_MS);
			} else {
				pendingZoomLimitAnnotation = undefined;
				finishSelectedMapZoomLimit(annotationForLimit);
			}
			return;
		}

		preferredSelectionZoom ??= map.getZoom();
		const targetZoom = getSelectedMapLimitedZoom(maxZoom, preferredSelectionZoom);
		pendingZoomLimitAnnotation = undefined;

		if (Math.abs(map.getZoom() - targetZoom) <= ZOOM_EPSILON) {
			finishSelectedMapZoomLimit(annotationForLimit);
			return;
		}

		easeToSelectedMapZoomLimit(targetZoom, annotationForLimit);
	}

	function cancelPendingSelectedMapZoomLimit() {
		pendingZoomLimitAnnotation = undefined;
		zoomLimitVisibilityCheckAnnotation = undefined;
		deferredVisibilityWarningAnnotation = undefined;
		cancelPendingSelectedMapZoomLimitFrame();
	}

	function cancelPendingSelectedMapZoomLimitFrame() {
		if (zoomLimitFrame !== undefined) {
			cancelAnimationFrame(zoomLimitFrame);
			zoomLimitFrame = undefined;
		}

		if (zoomLimitRetryTimer) {
			clearTimeout(zoomLimitRetryTimer);
			zoomLimitRetryTimer = undefined;
		}
	}

	function getSelectedMapLimitedZoom(maxZoom: number, preferredZoom: number) {
		const preferred = clampZoomToMapLimits(preferredZoom);
		const limit = clampZoomToMapLimits(maxZoom);

		return preferred > limit + getAutoZoomOutThreshold() ? limit : preferred;
	}

	function getSelectedMapNativeMaxZoom(annotationForLimit: string) {
		const ids = getSelectedMapIds(annotationForLimit);
		if (!ids) return undefined;

		const nativeMaxZooms = ids
			.map((id) => warpedMapLayer.getWarpedMap(id)?.resourceToProjectedGeoScale)
			.filter(
				(scale): scale is number => typeof scale === 'number' && Number.isFinite(scale) && scale > 0
			)
			.map((scale) => Math.log2((scale * WEB_MERCATOR_WORLD_WIDTH) / MAPLIBRE_TILE_SIZE));

		return nativeMaxZooms.length > 0 ? Math.max(...nativeMaxZooms) : undefined;
	}

	function easeToSelectedMapZoomLimit(zoom: number, annotationForLimit: string) {
		if (!map) return;

		zoomLimitVisibilityCheckAnnotation = annotationForLimit;
		map.once('moveend', () => {
			if (zoomLimitVisibilityCheckAnnotation !== annotationForLimit) return;

			zoomLimitVisibilityCheckAnnotation = undefined;
			finishSelectedMapZoomLimit(annotationForLimit);
		});

		map.easeTo({
			center: map.getCenter(),
			zoom: clampZoomToMapLimits(zoom),
			bearing: map.getBearing(),
			pitch: 0,
			duration: config.autoplay?.flyToDurationMs ?? 100
		});
	}

	function finishSelectedMapZoomLimit(annotationForLimit: string) {
		if (annotationForLimit !== activeAnnotation) return;

		if (deferredVisibilityWarningAnnotation === annotationForLimit) {
			deferredVisibilityWarningAnnotation = undefined;
		}
		queueSelectedMapVisibilityCheck(annotationForLimit, true);
	}

	function clampZoomToMapLimits(zoom: number) {
		if (!map) return zoom;

		return Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), zoom));
	}

	function getLocationFlyToZoom(annotationForZoom = activeAnnotation) {
		const selectedMaxZoom = annotationForZoom
			? getSelectedMapNativeMaxZoom(annotationForZoom)
			: undefined;

		return clampZoomToMapLimits(
			Math.min(selectedMaxZoom ?? DEFAULT_LOCATION_FLY_TO_ZOOM, MAX_LOCATION_FLY_TO_ZOOM)
		);
	}

	function getAutoZoomOutThreshold() {
		const threshold = config.map.autoZoomOutThreshold ?? DEFAULT_AUTO_ZOOM_OUT_THRESHOLD;
		return Number.isFinite(threshold) ? Math.max(0, threshold) : DEFAULT_AUTO_ZOOM_OUT_THRESHOLD;
	}

	function focusSelectedMap(annotationForFocus = activeAnnotation) {
		if (!map || !annotationForFocus) return;

		const cameraPadding = getFocusCameraPadding();

		if (rotateToMapOrientation) {
			const camera = getSelectedMapCamera(annotationForFocus, cameraPadding);
			if (camera) {
				handleUserCameraAction();
				map.flyTo({
					...camera,
					...getFocusFlyToOptions(cameraPadding, true)
				});
				return;
			}
		}

		const bounds = getSelectedMapBounds(annotationForFocus);
		if (bounds) {
			const camera = map.cameraForBounds(bounds, { padding: cameraPadding });
			if (camera) {
				handleUserCameraAction();
				map.flyTo({ ...camera, ...getFocusFlyToOptions(cameraPadding, false) });
			}
		}
	}

	function rotateToSelectedMapOrientation(annotationForOrientation: string) {
		if (!map) return;

		const camera = getSelectedMapCamera(annotationForOrientation);
		if (camera?.bearing !== undefined) {
			map.easeTo({ bearing: camera.bearing, pitch: 0, duration: 250 });
		}
	}

	function queueSelectedMapVisibilityCheck(annotationForCheck: string, showWarning = false) {
		if (visibilityCheckFrame !== undefined) {
			cancelAnimationFrame(visibilityCheckFrame);
		}

		visibilityCheckFrame = requestAnimationFrame(() => {
			visibilityCheckFrame = undefined;
			if (showWarning && shouldDeferVisibilityWarning(annotationForCheck)) {
				deferredVisibilityWarningAnnotation = annotationForCheck;
				return;
			}
			checkSelectedMapVisibility(annotationForCheck, showWarning);
		});
	}

	function shouldDeferVisibilityWarning(annotationForCheck: string) {
		return (
			pendingZoomLimitAnnotation === annotationForCheck ||
			zoomLimitVisibilityCheckAnnotation === annotationForCheck
		);
	}

	function getSelectedMapBounds(annotationForCheck: string) {
		const ids = getSelectedMapIds(annotationForCheck);
		if (!ids) return undefined;

		return warpedMapLayer.getMapsBounds(ids);
	}

	function getSelectedMapCenter(annotationForCheck: string) {
		const ids = getSelectedMapIds(annotationForCheck);
		if (!ids) return undefined;

		return warpedMapLayer.getMapsCenter(ids);
	}

	function getSelectedMapIds(annotationForCheck: string) {
		const ids = mapIdsByAnnotation.get(annotationForCheck);
		if (!ids?.size) return undefined;

		return [...ids];
	}

	function getSelectedMapCamera(
		annotationForCheck: string,
		padding: number | CameraPadding = CAMERA_BASE_PADDING
	) {
		const ids = getSelectedMapIds(annotationForCheck);
		if (!ids) return undefined;

		try {
			return warpedMapLayer.getMapsCenterZoomBearing(ids, { padding });
		} catch (error) {
			console.warn('Could not determine map orientation:', error);
			return undefined;
		}
	}

	function getMapPaneElement() {
		return mapElement?.closest<HTMLElement>('.map-pane');
	}

	function getBottomPanelInset() {
		const pane = getMapPaneElement();
		const panel = pane?.querySelector<HTMLElement>('[data-map-layers-panel]');
		if (!panel || !mapElement) return 0;

		const mapRect = mapElement.getBoundingClientRect();
		const panelRect = panel.getBoundingClientRect();
		if (panelRect.width === 0 || panelRect.height === 0) return 0;

		return Math.max(0, Math.ceil(mapRect.bottom - panelRect.top));
	}

	function getSliderInset() {
		const pane = getMapPaneElement();
		const surface = pane?.querySelector<HTMLElement>('[data-time-slider-surface]');

		if (surface) {
			const surfaceStyle = getComputedStyle(surface);
			if (surfaceStyle.display !== 'none' && surfaceStyle.visibility !== 'hidden') {
				return Math.ceil(surface.getBoundingClientRect().width || DESKTOP_SLIDER_INSET);
			}
		}

		return 0;
	}
	function getCameraPadding(): CameraPadding {
		const bottomInset = getBottomPanelInset();
		const sliderInset = getSliderInset();

		return {
			top: CAMERA_BASE_PADDING,
			right: CAMERA_BASE_PADDING + (navPosition === 'right' ? sliderInset : 0),
			bottom: Math.max(CAMERA_BASE_PADDING, bottomInset + CAMERA_PANEL_GAP),
			left: CAMERA_BASE_PADDING + (navPosition === 'left' ? sliderInset : 0)
		};
	}

	function getBaseCameraPadding(): CameraPadding {
		return {
			top: CAMERA_BASE_PADDING,
			right: CAMERA_BASE_PADDING,
			bottom: CAMERA_BASE_PADDING,
			left: CAMERA_BASE_PADDING
		};
	}

	function getFocusCameraPadding(): CameraPadding {
		return autoplayActive ? getBaseCameraPadding() : getCameraPadding();
	}

	function getFocusFlyToOptions(padding: CameraPadding, includeOffset: boolean) {
		if (autoplayActive) {
			return {
				pitch: 0,
				duration: config.autoplay?.flyToDurationMs ?? 100
			};
		}

		return {
			pitch: 0,
			...(includeOffset ? { offset: getCameraOffset(padding) } : {})
		};
	}

	function getCameraOffset(padding: CameraPadding): [number, number] {
		return [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2];
	}

	function getSelectedMapVisibility(annotationForCheck: string) {
		if (!map) return 'unknown';

		const bounds = getSelectedMapBounds(annotationForCheck);
		if (!bounds) return 'unknown';

		const viewportBounds = getVisibilityBounds();
		const selectedBounds = maplibregl.LngLatBounds.convert(bounds);
		const selectedBoundsCorners = [
			selectedBounds.getSouthWest(),
			selectedBounds.getNorthWest(),
			selectedBounds.getNorthEast(),
			selectedBounds.getSouthEast()
		];
		const fullyVisible = selectedBoundsCorners.every((corner) => viewportBounds.contains(corner));
		const intersects = viewportBounds.intersects(selectedBounds);

		if (!intersects) return 'not-visible';
		if (isSelectedMapTiny(annotationForCheck)) return 'tiny-visible';
		if (fullyVisible) return 'fully-visible';

		return 'partly-visible';
	}

	function isSelectedMapTiny(annotationForCheck: string) {
		const selectedRect = getSelectedMapScreenRect(annotationForCheck);
		if (!selectedRect) return false;

		const selectedArea = getRectArea(selectedRect);
		const viewportArea = getRectArea(getVisibilityScreenRect());
		if (selectedArea <= 0 || viewportArea <= 0) return false;

		return selectedArea / viewportArea <= getTinyVisibilityAreaRatio();
	}

	function getSelectedMapScreenRect(annotationForCheck: string): ScreenRect | undefined {
		if (!map) return undefined;

		const bounds = getSelectedMapBounds(annotationForCheck);
		if (!bounds) return undefined;

		const mapInstance = map;
		if (!mapInstance) return undefined;

		const selectedBounds = maplibregl.LngLatBounds.convert(bounds);
		const points = [
			selectedBounds.getSouthWest(),
			selectedBounds.getNorthWest(),
			selectedBounds.getNorthEast(),
			selectedBounds.getSouthEast()
		].map((corner) => mapInstance.project(corner));
		const xs = points.map((point) => point.x);
		const ys = points.map((point) => point.y);

		return {
			left: Math.min(...xs),
			right: Math.max(...xs),
			top: Math.min(...ys),
			bottom: Math.max(...ys)
		};
	}

	function getVisibilityBounds() {
		const mapInstance = map;
		if (!mapInstance) return new maplibregl.LngLatBounds();

		const rect = getVisibilityScreenRect();
		const leftPadding = rect.left;
		const rightPadding = mapInstance.getCanvas().clientWidth - rect.right;
		const topPadding = rect.top;
		const bottomPadding = mapInstance.getCanvas().clientHeight - rect.bottom;

		if (leftPadding <= 0 && rightPadding <= 0 && topPadding <= 0 && bottomPadding <= 0) {
			return mapInstance.getBounds();
		}

		const corners: Array<[number, number]> = [
			[rect.left, rect.top],
			[rect.right, rect.top],
			[rect.right, rect.bottom],
			[rect.left, rect.bottom]
		];
		const bounds = new maplibregl.LngLatBounds();
		corners.forEach((point) => bounds.extend(mapInstance.unproject(point)));

		return bounds;
	}

	function getVisibilityScreenRect(): ScreenRect {
		const mapInstance = map;
		if (!mapInstance) return { left: 0, right: 0, top: 0, bottom: 0 };

		const canvas = mapInstance.getCanvas();
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		const padding = getVisibilityPadding();
		const left = Math.min(padding.left, Math.max(0, (width - 1) / 2));
		const rightPadding = Math.min(padding.right, Math.max(0, width - left - 1));
		const top = Math.min(padding.top, Math.max(0, (height - 1) / 2));
		const bottomPadding = Math.min(padding.bottom, Math.max(0, height - top - 1));

		return {
			left,
			right: width - rightPadding,
			top,
			bottom: height - bottomPadding
		};
	}

	function getRectArea(rect: ScreenRect) {
		return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
	}

	function getVisibilityPadding(): CameraPadding {
		const basePadding = getVisibilityBasePadding();
		const sliderInset = getSliderInset();
		const bottomPanelInset = getBottomPanelInset();

		return {
			top: basePadding,
			right: basePadding + (navPosition === 'right' ? sliderInset : 0),
			bottom: basePadding + bottomPanelInset,
			left: basePadding + (navPosition === 'left' ? sliderInset : 0)
		};
	}

	function getVisibilityBasePadding() {
		const padding = config.map.visibilityPaddingPixels ?? DEFAULT_VISIBILITY_PADDING;
		return Number.isFinite(padding) ? Math.max(0, padding) : DEFAULT_VISIBILITY_PADDING;
	}

	function getTinyVisibilityAreaRatio() {
		const ratio = config.map.tinyVisibilityAreaRatio ?? DEFAULT_TINY_VISIBILITY_AREA_RATIO;
		return Number.isFinite(ratio)
			? Math.min(1, Math.max(0, ratio))
			: DEFAULT_TINY_VISIBILITY_AREA_RATIO;
	}

	function checkSelectedMapVisibility(annotationForCheck = activeAnnotation, showWarning = false) {
		if (!annotationForCheck || annotationForCheck !== activeAnnotation) return;

		selectedMapVisibility = getSelectedMapVisibility(annotationForCheck);

		if (autoplayActive || focusActiveMap || !shouldShowVisibilityWarning(selectedMapVisibility)) {
			visibilityWarningOpen = false;
			return;
		}

		if (
			showWarning &&
			shouldShowVisibilityWarning(selectedMapVisibility) &&
			dismissedVisibilityWarningAnnotation !== annotationForCheck
		) {
			visibilityWarningOpen = true;
		}
	}

	function shouldShowVisibilityWarning(visibility: SelectedMapVisibility) {
		return visibility === 'not-visible' || visibility === 'tiny-visible';
	}

	function dismissVisibilityWarning() {
		dismissedVisibilityWarningAnnotation = activeAnnotation;
		visibilityWarningOpen = false;
	}

	function zoomToActiveMapFromWarning() {
		dismissVisibilityWarning();
		clearPreferredSelectionZoom();
		focusSelectedMap();
	}

	function updateAnnotationsInView() {
		if (!map || !loaded) {
			annotationsInView = [];
			annotationsAtCenter = [];
			mapIdsAtCenter = [];
			return;
		}

		const bounds = map.getBounds();
		const geoBbox: [number, number, number, number] = [
			bounds.getWest(),
			bounds.getSouth(),
			bounds.getEast(),
			bounds.getNorth()
		];
		const mapIds = warpedMapLayer.getWarpedMapList().getMapIds({
			geoBbox,
			onlyVisible: false
		});
		const center = map.getCenter();
		const centerMapIds = warpedMapLayer.getWarpedMapList().getMapIds({
			geoPoint: [center.lng, center.lat],
			onlyVisible: false
		});

		annotationsInView = getAnnotationsForMapIds(mapIds);
		annotationsAtCenter = getAnnotationsForMapIds(centerMapIds);
		mapIdsAtCenter = centerMapIds;
	}

	function getAnnotationsForMapIds(mapIds: string[]) {
		return [
			...new Set(
				mapIds.flatMap((mapId) => [...(annotationsByMapId.get(mapId) ?? new Set<string>())])
			)
		];
	}

	function updateGeocoderBounds() {
		const boundsLike = warpedMapLayer.getBounds();
		if (!boundsLike) {
			geocoderBounds = undefined;
			return;
		}

		const bounds = maplibregl.LngLatBounds.convert(boundsLike);
		const nextBounds = {
			west: bounds.getWest(),
			south: bounds.getSouth(),
			east: bounds.getEast(),
			north: bounds.getNorth()
		};

		geocoderBounds = Object.values(nextBounds).every(Number.isFinite) ? nextBounds : undefined;
	}

	onMount(() => {
		if (!mapElement) return;

		loaded = false;

		const mapInstance = new maplibregl.Map({
			style: getProtomapsStyle('light', config.basemap.protomapsApiKey),
			container: mapElement,
			attributionControl: false,
			maxPitch: 0,
			center: currentLocation.center,
			zoom: currentLocation.zoom,
			bearing: currentLocation.bearing ?? 0,
			bearingSnap: 0,
			keyboard: false
		});
		map = mapInstance;
		mapReady = true;
		const blurMapCanvas = () => mapInstance.getCanvas().blur();
		disableMapCanvasFocus(mapInstance, blurMapCanvas);

		mapInstance.on('movestart', (event) => {
			if (event.originalEvent) handleUserCameraAction();
		});

		mapInstance.on('move', () => {
			if (!isSyncing) {
				const nextLocation = {
					center: mapInstance.getCenter().toArray() as [number, number],
					zoom: mapInstance.getZoom(),
					bearing: mapInstance.getBearing()
				};
				currentLocation = nextLocation;
				onLocationChange?.(nextLocation);
			}

			if (visibilityWarningOpen) {
				checkSelectedMapVisibility(activeAnnotation, false);
			}
		});

		mapInstance.on('moveend', () => {
			updateAnnotationsInView();
			checkSelectedMapVisibility(activeAnnotation, false);
		});

		mapInstance.on('load', async () => {
			basemapLayers.forEach((layer) => mapInstance.addLayer(layer, 'foreground'));
			mapInstance.addLayer(warpedMapLayer);
			loaded = true;
			updateAnnotationsInView();
			updateGeocoderBounds();
		});

		mapInstance.on('styleimagemissing', async (event) => {
			if (loadedStyleImages.has(event.id)) return;
			if (!isImageUrl(event.id)) return;

			loadedStyleImages.add(event.id);
			try {
				const image = await mapInstance.loadImage(event.id);
				if (!mapInstance.hasImage(event.id)) {
					mapInstance.addImage(event.id, image.data);
				}
			} catch {
				loadedStyleImages.delete(event.id);
			}
		});

		return () => {
			setPresentationTouchMapInteractionsDisabled(false);
			cancelPendingSelectedMapZoomLimit();
			if (visibilityCheckFrame !== undefined) {
				cancelAnimationFrame(visibilityCheckFrame);
			}
			clearSelectedLocationCircle();
			mapInstance.getCanvas().removeEventListener('focus', blurMapCanvas);
			mapInstance.remove();
			annotationsInView = [];
			annotationsAtCenter = [];
			mapIdsAtCenter = [];
			geocoderBounds = undefined;
			map = undefined;
			mapReady = false;
			loaded = false;
		};
	});

	function disableMapCanvasFocus(mapInstance: maplibregl.Map, blurMapCanvas: () => void) {
		const canvas = mapInstance.getCanvas();
		const canvasContainer = mapInstance.getCanvasContainer();

		canvas.tabIndex = -1;
		canvas.setAttribute('tabindex', '-1');
		canvasContainer.tabIndex = -1;
		canvasContainer.setAttribute('tabindex', '-1');
		canvas.addEventListener('focus', blurMapCanvas);
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && visibilityWarningOpen) {
			dismissVisibilityWarning();
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div bind:this={mapElement} class="absolute inset-0 h-full w-full"></div>
{#if mapReady && map && !autoplayActive}
	<div transition:fly={{ x: controlsPosition === 'top-left' ? -64 : 64, duration: 180 }}>
		<MapControls
			{map}
			{config}
			bind:opacity
			bind:rotateToMapOrientation
			bind:focusActiveMap
			bind:viewsLinked
			bind:inViewOnly
			position={controlsPosition}
			canZoomToMap={canZoomToActiveMap}
			canFilterInView={annotationsInView.length > 0}
			{showZoomControls}
			{showLinkControl}
			{showInViewControl}
			onUserCameraAction={handleUserCameraAction}
		/>
	</div>
{/if}
<MapVisibilityWarning
	open={visibilityWarningOpen}
	{config}
	{map}
	{mapElement}
	{selectedMapCenter}
	{selectedMapVisibility}
	{navPosition}
	onDismiss={dismissVisibilityWarning}
	onZoomToLayer={zoomToActiveMapFromWarning}
/>

<style>
	:global(.maplibregl-canvas:focus),
	:global(.maplibregl-canvas:focus-visible) {
		outline: none;
	}
</style>
