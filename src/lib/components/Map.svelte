<script lang="ts">
	import { onMount, tick } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import { WarpedMapLayer } from '@allmaps/maplibre';
	import { AlertTriangle, Focus } from '@lucide/svelte';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { viewState, flyTo, selectedLocation } from '$lib/app-state.svelte.js';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getProtomapsLayers, getProtomapsStyle } from '$lib/basemap';
	import { annotationsByMapId, getWarpedMapList, mapIdsByAnnotation } from '$lib/warped-map-list';
	import MapControls from '$lib/components/MapControls.svelte';
	import type {
		AppConfig,
		GeocoderBounds,
		MapKeyboardCommand,
		MapLocation,
		MapToolbarCommand
	} from '$lib/types';

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
		geocoderBounds = $bindable(),
		mapKeyboardCommand,
		mapToolbarCommand,
		syncUrl = false,
		enableFlyTo = false,
		enableLocationMarker = false,
		controlsPosition = 'top-right'
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
		syncUrl?: boolean;
		enableFlyTo?: boolean;
		enableLocationMarker?: boolean;
		controlsPosition?: 'top-left' | 'top-right';
	} = $props();

	let actieveAnnotation = $derived(annotation);
	let actieveOpacity = $derived((opacity ?? 100) / 100);

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
	let urlSyncFrame: number | undefined;
	let isSyncing = false;
	let warpedMapList = getWarpedMapList();
	let warpedMapLayer = new WarpedMapLayer({ visible: false, warpedMapList });

	const basemapStyle = getProtomapsStyle('light');
	const basemapLayers = getProtomapsLayers('light', undefined, {});
	const loadedStyleImages = new Set<string>();
	let canZoomToActiveMap = $derived(
		loaded && !!actieveAnnotation && (mapIdsByAnnotation.get(actieveAnnotation)?.size ?? 0) > 0
	);

	// Laad de kaartlaag als de annotatie verandert
	$effect(() => {
		if (loaded && actieveAnnotation && mapIdsByAnnotation.size > 0) {
			const idsToShow = mapIdsByAnnotation.get(actieveAnnotation) ?? new Set();
			warpedMapLayer.setMapsOptions((id: string) =>
				idsToShow.has(id) ? { visible: true } : { visible: false }
			);
		}
	});

	$effect(() => {
		if (syncUrl && mapReady && map && actieveAnnotation) {
			queueBrowserUrlUpdate();
		}
	});

	// Pas transparantie aan
	$effect(() => {
		if (loaded) {
			warpedMapLayer.setOpacity(actieveOpacity);
		}
	});

	// Vlieg naar locatie
	$effect(() => {
		if (enableFlyTo && mapReady && map && flyTo.center) {
			map.flyTo({ center: flyTo.center, zoom: 14 });
		}
	});

	// Tijdelijke marker
	$effect(() => {
		if (enableLocationMarker && mapReady && map && selectedLocation.center) {
			const marker = new maplibregl.Marker().setLngLat(selectedLocation.center).addTo(map);
			setTimeout(() => {
				marker.remove();
				selectedLocation.center = null;
			}, 3000);
		}
	});

	// Synchroniseer kaartpositie met de gebonden locatie.
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

	// Waarschuw pas bij selectie/laden; gewone kaartbewegingen mogen niet blijven storen.
	$effect(() => {
		const annotationForCheck = actieveAnnotation;
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
		const shouldRotate = rotateToMapOrientation;
		const annotationForOrientation = actieveAnnotation;
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
		const annotationForFocus = actieveAnnotation;
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
			bearing:
				command.bearingDelta === undefined
					? map.getBearing()
					: map.getBearing() + command.bearingDelta,
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

	function updateBrowserUrl() {
		if (!map) return;

		const center = map.getCenter();
		const params = new URLSearchParams({
			lat: center.lat.toFixed(5),
			lng: center.lng.toFixed(5),
			zoom: map.getZoom().toFixed(2),
			year: String(actieveAnnotation)
		});
		const bearing = map.getBearing();
		if (bearingDifference(bearing, 0) >= 0.005) {
			params.set('bearing', bearing.toFixed(2));
		}
		replaceBrowserUrl(resolve(`/?${params.toString()}`));
	}

	function queueBrowserUrlUpdate() {
		if (urlSyncFrame !== undefined) {
			cancelAnimationFrame(urlSyncFrame);
		}

		urlSyncFrame = requestAnimationFrame(() => {
			urlSyncFrame = undefined;
			updateBrowserUrl();
		});
	}

	function replaceBrowserUrl(url: string, retry = true) {
		try {
			replaceState(url, {});
		} catch (error) {
			if (
				retry &&
				error instanceof Error &&
				error.message.includes('before router is initialized')
			) {
				requestAnimationFrame(() => replaceBrowserUrl(url, false));
			} else {
				console.warn('Kon URL niet bijwerken:', error);
			}
		}
	}

	function isImageUrl(id: string) {
		return /^https?:\/\//.test(id) || id.startsWith('/') || id.startsWith('data:');
	}

	function focusSelectedMap(annotationForFocus = actieveAnnotation) {
		if (!map || !annotationForFocus) return;

		if (rotateToMapOrientation) {
			const camera = getSelectedMapCamera(annotationForFocus);
			if (camera) {
				map.easeTo({ ...camera, pitch: 0, duration: 350 });
				return;
			}
		}

		const bounds = getSelectedMapBounds(annotationForFocus);
		if (bounds) {
			map.fitBounds(bounds, { padding: 40 });
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

	function getSelectedMapCamera(annotationForCheck: string) {
		const ids = getSelectedMapIds(annotationForCheck);
		if (!ids) return undefined;

		try {
			return warpedMapLayer.getMapsCenterZoomBearing(ids, { padding: 40 });
		} catch (error) {
			console.warn('Kon kaartoriëntatie niet bepalen:', error);
			return undefined;
		}
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

	function checkSelectedMapVisibility(annotationForCheck = actieveAnnotation, showWarning = false) {
		if (!annotationForCheck || annotationForCheck !== actieveAnnotation) return;

		selectedMapVisibility = getSelectedMapVisibility(annotationForCheck);

		if (selectedMapVisibility === 'fully-visible') {
			visibilityWarningOpen = false;
			return;
		}

		if (
			showWarning &&
			selectedMapVisibility === 'not-visible' &&
			// (selectedMapVisibility === 'partly-visible' || selectedMapVisibility === 'not-visible') &&
			dismissedVisibilityWarningAnnotation !== annotationForCheck
		) {
			visibilityWarningOpen = true;
		}
	}

	function dismissVisibilityWarning() {
		dismissedVisibilityWarningAnnotation = actieveAnnotation;
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
			style: basemapStyle,
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
			checkSelectedMapVisibility(actieveAnnotation, false);

			if (syncUrl) {
				updateBrowserUrl();
			}
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
			if (urlSyncFrame !== undefined) {
				cancelAnimationFrame(urlSyncFrame);
			}
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
{#if mapReady && map}
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
	/>
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
					class="rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
					onclick={dismissVisibilityWarning}
				>
					{config.mapWarnings.dismiss}
				</button>
				<button
					bind:this={visibilityWarningPrimaryButton}
					type="button"
					class="inline-flex items-center gap-2 rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
					onclick={zoomToActiveMapFromWarning}
				>
					<Focus class="h-4 w-4" />
					{config.mapWarnings.zoomToLayer}
				</button>
			</div>
		</div>
	</div>
{/if}
