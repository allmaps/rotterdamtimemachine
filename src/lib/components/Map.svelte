<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import maplibregl from 'maplibre-gl';
	import { WarpedMapLayer } from '@allmaps/maplibre';
	import { AlertTriangle, Focus } from '@lucide/svelte';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { viewState, flyTo, selectedLocation } from '$lib/app-state.svelte.js';
	import { getProtomapsLayers, getProtomapsStyle } from '$lib/basemap';
	import { getThemeColor } from '$lib/theme';
	import { annotationsByMapId, getWarpedMapList, mapIdsByAnnotation } from '$lib/warped-map-list';
	import MapControls from '$lib/components/MapControls.svelte';
	import type {
		AppConfig,
		GeocoderBounds,
		MapKeyboardCommand,
		MapLocation,
		MapToolbarCommand
	} from '$lib/types';

	type CameraPadding = {
		top: number;
		right: number;
		bottom: number;
		left: number;
	};

	const CAMERA_BASE_PADDING = 40;
	const CAMERA_PANEL_GAP = 16;
	const DESKTOP_SLIDER_INSET = 96;
	const LOCATION_SOURCE_ID = 'selected-location-source';
	const LOCATION_LAYER_ID = 'selected-location-circle';
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
		inViewOnly = $bindable(false),
		currentLocation = $bindable({
			center: [...config.map.initialView.center] as [number, number],
			zoom: config.map.initialView.zoom,
			bearing: config.map.initialView.bearing
		}),
		annotationsInView = $bindable<string[]>([]),
		// eslint-disable-next-line no-useless-assignment -- This bindable prop is written back to the parent.
		geocoderBounds = $bindable(),
		mapKeyboardCommand,
		mapToolbarCommand,
		enableFlyTo = false,
		enableLocationMarker = false,
		navPosition = 'left',
		controlsPosition = 'top-right',
		showInViewControl = false,
		autoplayActive = false
	}: {
		config: AppConfig;
		annotation?: string;
		opacity?: number;
		rotateToMapOrientation?: boolean;
		focusActiveMap?: boolean;
		inViewOnly?: boolean;
		currentLocation?: MapLocation;
		annotationsInView?: string[];
		geocoderBounds?: GeocoderBounds;
		mapKeyboardCommand?: MapKeyboardCommand;
		mapToolbarCommand?: MapToolbarCommand;
		enableFlyTo?: boolean;
		enableLocationMarker?: boolean;
		navPosition?: 'left' | 'right';
		controlsPosition?: 'top-left' | 'top-right';
		showInViewControl?: boolean;
		autoplayActive?: boolean;
	} = $props();

	let activeAnnotation = $derived(annotation);
	let activeOpacity = $derived((opacity ?? 100) / 100);

	let mapElement: HTMLDivElement;
	let map = $state<maplibregl.Map>();
	let mapReady: boolean = $state(false);
	let loaded: boolean = $state(false);
	let selectedMapVisibility = $state<
		'fully-visible' | 'partly-visible' | 'not-visible' | 'unknown'
	>('unknown');
	let visibilityWarningOpen = $state(false);
	let visibilityWarningPrimaryButton: HTMLButtonElement | undefined = $state();
	let dismissedVisibilityWarningAnnotation: string | undefined;
	let previousAnnotationForVisibility: string | undefined;
	let previousAnnotationForOrientation: string | undefined;
	let previousAnnotationForFocus: string | undefined;
	let previousRotateToMapOrientation = rotateToMapOrientation;
	let previousRotateToMapOrientationForFocus = rotateToMapOrientation;
	let previousFocusActiveMap = focusActiveMap;
	let previousKeyboardCommandId = 0;
	let previousToolbarCommandId = 0;
	let commandIdsInitialized = false;
	let visibilityCheckFrame: number | undefined;
	let selectedLocationTimer: ReturnType<typeof setTimeout> | undefined;
	let isSyncing = false;
	let warpedMapList = getWarpedMapList();
	let warpedMapLayer = new WarpedMapLayer({ visible: false, warpedMapList });

	const basemapLayers = untrack(() =>
		getProtomapsLayers('light', undefined, { lang: config.site.locale })
	);
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Internal MapLibre image loading cache, not UI state.
	const loadedStyleImages = new Set<string>();
	let canZoomToActiveMap = $derived(
		loaded && !!activeAnnotation && (mapIdsByAnnotation.get(activeAnnotation)?.size ?? 0) > 0
	);

	// Load the warped map layer when the selected annotation changes.
	$effect(() => {
		if (loaded && activeAnnotation && mapIdsByAnnotation.size > 0) {
			const idsToShow = mapIdsByAnnotation.get(activeAnnotation) ?? new Set();
			warpedMapLayer.setMapsOptions((id: string) =>
				idsToShow.has(id) ? { visible: true } : { visible: false }
			);
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
		if (enableFlyTo && mapReady && map && flyTo.center) {
			const cameraPadding = getCameraPadding();
			map.flyTo({
				center: flyTo.center,
				zoom: 14,
				offset: getCameraOffset(cameraPadding)
			});
		}
	});

	// Show a temporary location circle.
	$effect(() => {
		if (enableLocationMarker && loaded && map && selectedLocation.center) {
			showSelectedLocationCircle(selectedLocation.center);
		}
	});

	// Synchronize the map position with the bound location.
	$effect(() => {
		if (mapReady && map && currentLocation) {
			const center = currentLocation.center;
			const zoom = currentLocation.zoom;
			const bearing = currentLocation.bearing ?? 0;
			if (!mapMatchesLocation(center, zoom, bearing)) {
				isSyncing = true;
				map.jumpTo({ center, zoom, bearing });
				isSyncing = false;
			}
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
		if (visibilityWarningOpen) {
			tick().then(() => visibilityWarningPrimaryButton?.focus());
		}
	});

	$effect(() => {
		if (autoplayActive || focusActiveMap) {
			visibilityWarningOpen = false;
		}
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
		const command = mapKeyboardCommand;
		if (!mapReady || !map || !command || command.id === previousKeyboardCommandId) return;

		previousKeyboardCommandId = command.id;
		map.easeTo({
			duration: 300,
			easeId: 'keyboardHandler',
			center: map.getCenter(),
			zoom: command.zoomDelta === undefined ? map.getZoom() : map.getZoom() + command.zoomDelta,
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

	function createLocationData(center: [number, number]): GeoJSON.FeatureCollection<GeoJSON.Point> {
		return {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					geometry: {
						type: 'Point',
						coordinates: center
					},
					properties: {}
				}
			]
		};
	}

	function showSelectedLocationCircle(center: [number, number]) {
		if (!map) return;

		ensureSelectedLocationLayer();
		const source = map.getSource(LOCATION_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
		source?.setData(createLocationData(center));
		map.setPaintProperty(LOCATION_LAYER_ID, 'circle-color', getBrandMainColor());

		if (selectedLocationTimer) clearTimeout(selectedLocationTimer);
		selectedLocationTimer = setTimeout(() => {
			clearSelectedLocationCircle();
			selectedLocation.center = null;
		}, 3000);
	}

	function ensureSelectedLocationLayer() {
		if (!map) return;

		if (!map.getSource(LOCATION_SOURCE_ID)) {
			map.addSource(LOCATION_SOURCE_ID, {
				type: 'geojson',
				data: EMPTY_LOCATION_DATA
			});
		}

		if (!map.getLayer(LOCATION_LAYER_ID)) {
			map.addLayer({
				id: LOCATION_LAYER_ID,
				type: 'circle',
				source: LOCATION_SOURCE_ID,
				paint: {
					'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7, 15, 13, 18, 18],
					'circle-color': getBrandMainColor(),
					'circle-opacity': 0.82,
					'circle-stroke-color': '#ffffff',
					'circle-stroke-opacity': 0.95,
					'circle-stroke-width': 2
				}
			});
		}
	}

	function clearSelectedLocationCircle() {
		if (selectedLocationTimer) {
			clearTimeout(selectedLocationTimer);
			selectedLocationTimer = undefined;
		}

		const source = map?.getSource(LOCATION_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
		source?.setData(EMPTY_LOCATION_DATA);
	}

	function getBrandMainColor() {
		return getThemeColor(config.theme);
	}

	function focusSelectedMap(annotationForFocus = activeAnnotation) {
		if (!map || !annotationForFocus) return;

		const cameraPadding = getFocusCameraPadding();

		if (rotateToMapOrientation) {
			const camera = getSelectedMapCamera(annotationForFocus, cameraPadding);
			if (camera) {
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
			checkSelectedMapVisibility(annotationForCheck, showWarning);
		});
	}

	function getSelectedMapBounds(annotationForCheck: string) {
		const ids = getSelectedMapIds(annotationForCheck);
		if (!ids) return undefined;

		return warpedMapLayer.getMapsBounds(ids);
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
		if (!panel) return 0;

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

		const viewportBounds = map.getBounds();
		const selectedBounds = maplibregl.LngLatBounds.convert(bounds);
		const selectedBoundsCorners = [
			selectedBounds.getSouthWest(),
			selectedBounds.getNorthWest(),
			selectedBounds.getNorthEast(),
			selectedBounds.getSouthEast()
		];
		const fullyVisible = selectedBoundsCorners.every((corner) => viewportBounds.contains(corner));

		if (fullyVisible) return 'fully-visible';
		if (viewportBounds.intersects(selectedBounds)) return 'partly-visible';

		return 'not-visible';
	}

	function checkSelectedMapVisibility(annotationForCheck = activeAnnotation, showWarning = false) {
		if (!annotationForCheck || annotationForCheck !== activeAnnotation) return;

		selectedMapVisibility = getSelectedMapVisibility(annotationForCheck);

		if (autoplayActive || focusActiveMap || selectedMapVisibility === 'fully-visible') {
			visibilityWarningOpen = false;
			return;
		}

		if (
			showWarning &&
			selectedMapVisibility === 'not-visible' &&
			dismissedVisibilityWarningAnnotation !== annotationForCheck
		) {
			visibilityWarningOpen = true;
		}
	}

	function dismissVisibilityWarning() {
		dismissedVisibilityWarningAnnotation = activeAnnotation;
		visibilityWarningOpen = false;
	}

	function zoomToActiveMapFromWarning() {
		dismissVisibilityWarning();
		focusSelectedMap();
	}

	function handleVisibilityWarningKeydown(event: KeyboardEvent) {
		event.stopPropagation();

		if (event.key === 'Escape') {
			dismissVisibilityWarning();
		}
	}

	function updateAnnotationsInView() {
		if (!map || !loaded) {
			annotationsInView = [];
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
		const nextAnnotationsInView = [
			...new Set(
				mapIds
					.map((mapId) => annotationsByMapId.get(mapId))
					.filter((annotationUrl): annotationUrl is string => !!annotationUrl)
			)
		];

		annotationsInView = nextAnnotationsInView;
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

		mapInstance.on('move', () => {
			if (!isSyncing) {
				currentLocation = {
					center: mapInstance.getCenter().toArray() as [number, number],
					zoom: mapInstance.getZoom(),
					bearing: mapInstance.getBearing()
				};
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
			if (visibilityCheckFrame !== undefined) {
				cancelAnimationFrame(visibilityCheckFrame);
			}
			clearSelectedLocationCircle();
			mapInstance.remove();
			annotationsInView = [];
			geocoderBounds = undefined;
			map = undefined;
			mapReady = false;
		};
	});

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
			bind:inViewOnly
			position={controlsPosition}
			canZoomToMap={canZoomToActiveMap}
			canFilterInView={annotationsInView.length > 0}
			{showInViewControl}
		/>
	</div>
{/if}

{#if visibilityWarningOpen}
	<div
		role="presentation"
		class="absolute inset-0 z-40 flex items-center justify-center bg-black/25 p-4"
		onpointerdown={(event) => event.stopPropagation()}
		ondblclick={(event) => event.stopPropagation()}
	>
		<div
			role="dialog"
			aria-modal="true"
			aria-label={config.mapWarnings.label}
			tabindex="-1"
			class="pointer-events-auto w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 text-gray-900 shadow-2xl"
			onkeydown={handleVisibilityWarningKeydown}
			onkeyup={(event) => event.stopPropagation()}
			onpointerdown={(event) => event.stopPropagation()}
			ondblclick={(event) => event.stopPropagation()}
		>
			<div class="flex items-start gap-3">
				<div
					class="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-amber-100 text-amber-700"
				>
					<AlertTriangle class="h-5 w-5" />
				</div>
				<div class="min-w-0">
					<h2 class="font-heading text-base font-bold">
						{selectedMapVisibility === 'not-visible'
							? config.mapWarnings.outsideTitle
							: config.mapWarnings.partialTitle}
					</h2>
					<p class="mt-1 text-sm leading-5 text-gray-600">
						{selectedMapVisibility === 'not-visible'
							? config.mapWarnings.outsideDescription
							: config.mapWarnings.partialDescription}
					</p>
				</div>
			</div>

			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-main"
					onclick={dismissVisibilityWarning}
				>
					{config.mapWarnings.dismiss}
				</button>
				<button
					bind:this={visibilityWarningPrimaryButton}
					type="button"
					class="inline-flex items-center gap-2 rounded-md bg-brand-main px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-main"
					onclick={zoomToActiveMapFromWarning}
				>
					<Focus class="h-4 w-4" />
					{config.mapWarnings.zoomToLayer}
				</button>
			</div>
		</div>
	</div>
{/if}
