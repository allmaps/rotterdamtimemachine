<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import maplibregl from 'maplibre-gl';
	import { WarpedMapLayer } from '@allmaps/maplibre';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import {
		viewState,
		flyTo,
		selectedLocation,
		mapView,
		zoomTo,
		loadedAnnotations
	} from '$lib/store.svelte';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getProtomapsLayers, getProtomapsStyle } from '$lib/basemap';
	import { MapCollection } from '$lib/models/MapCollection';
	import type { MapLocation } from '$lib/types';

	let {
		annotation = $bindable(viewState.annotation),
		opacity = $bindable(viewState.opacity),
		currentLocation = $bindable({
			center: [...mapView.center] as [number, number],
			zoom: mapView.zoom
		}),
		syncUrl = false,
		enableFlyTo = false,
		enableLocationMarker = false,
		enableKeyboardToggle = false
	}: {
		annotation?: string;
		opacity?: number;
		currentLocation?: MapLocation;
		syncUrl?: boolean;
		enableFlyTo?: boolean;
		enableLocationMarker?: boolean;
		enableKeyboardToggle?: boolean;
	} = $props();

	let actieveAnnotation = $derived(annotation);
	let actieveOpacity = $derived((opacity ?? 100) / 100);

	let mapElement: HTMLDivElement;
	let map: maplibregl.Map;
	let mapReady: boolean = $state(false);
	let loaded: boolean = $state(false);
	let routerReady = false;
	let isSyncing = false;
	let warpedMapLayer = new WarpedMapLayer({ visible: false });

	const collection = new MapCollection();
	const allMaps = collection.getAllMaps();
	const mapIdsByAnnotation = new SvelteMap<string, Set<string>>();
	const basemapStyle = getProtomapsStyle('light');
	const basemapLayers = getProtomapsLayers('light', undefined, {});
	const loadedStyleImages = new Set<string>();

	afterNavigate(() => {
		routerReady = true;
	});

	// Laad de kaartlaag als de annotatie verandert
	$effect(() => {
		if (loaded && actieveAnnotation && mapIdsByAnnotation.size > 0) {
			const idsToShow = mapIdsByAnnotation.get(actieveAnnotation) ?? new Set();
			warpedMapLayer.setMapsOptions((id: string) =>
				idsToShow.has(id) ? { visible: true } : { visible: false }
			);
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
		if (enableFlyTo && mapReady && flyTo.center) {
			map.flyTo({ center: flyTo.center, zoom: 14 });
		}
	});

	// Zoom naar geselecteerde kaart
	$effect(() => {
		if (loaded && zoomTo.annotation && zoomTo.annotation === actieveAnnotation) {
			const ids = mapIdsByAnnotation.get(zoomTo.annotation);
			if (ids) {
				const bounds = warpedMapLayer.getMapsBounds([...ids]);
				if (bounds) {
					map.fitBounds(bounds, { padding: 40 });
				}
			}
			zoomTo.annotation = null;
		}
	});

	// Tijdelijke marker
	$effect(() => {
		if (enableLocationMarker && mapReady && selectedLocation.center) {
			const marker = new maplibregl.Marker().setLngLat(selectedLocation.center).addTo(map);
			setTimeout(() => {
				marker.remove();
				selectedLocation.center = null;
			}, 3000);
		}
	});

	// Synchroniseer kaartpositie met de gebonden locatie.
	$effect(() => {
		if (mapReady && currentLocation) {
			const center = currentLocation.center;
			const zoom = currentLocation.zoom;
			if (!mapMatchesLocation(center, zoom)) {
				isSyncing = true;
				map.jumpTo({ center, zoom });
				isSyncing = false;
			}
		}
	});

	function mapMatchesLocation(center: [number, number], zoom: number) {
		const c = map.getCenter();
		return (
			Math.abs(c.lng - center[0]) < 0.000001 &&
			Math.abs(c.lat - center[1]) < 0.000001 &&
			Math.abs(map.getZoom() - zoom) < 0.000001
		);
	}

	function updateBrowserUrl() {
		if (!routerReady) return;

		const center = map.getCenter();
		const params = new URLSearchParams({
			lat: center.lat.toFixed(5),
			lng: center.lng.toFixed(5),
			zoom: map.getZoom().toFixed(2),
			year: String(annotation)
		});
		replaceState(resolve(`/?${params.toString()}`), {});
	}

	function isImageUrl(id: string) {
		return /^https?:\/\//.test(id) || id.startsWith('/') || id.startsWith('data:');
	}

	onMount(() => {
		map = new maplibregl.Map({
			style: basemapStyle,
			container: mapElement,
			attributionControl: false,
			maxPitch: 0,
			center: currentLocation.center,
			zoom: currentLocation.zoom
		});
		mapReady = true;

		map.addControl(new maplibregl.NavigationControl());

		map.on('move', () => {
			if (!isSyncing) {
				currentLocation = {
					center: map.getCenter().toArray() as [number, number],
					zoom: map.getZoom()
				};
			}
		});

		map.on('moveend', () => {
			const center = map.getCenter();
			console.log('Kaart gestopt op:', center.lng, center.lat, 'zoom:', map.getZoom());

			if (syncUrl) {
				updateBrowserUrl();
			}
		});

		map.on('load', async () => {
			basemapLayers.forEach((layer) => map.addLayer(layer, 'foreground'));
			map.addLayer(warpedMapLayer);
			await Promise.all(
				allMaps.map(async (mapCard) => {
					const annotationUrl = mapCard.metadata.annotation;
					try {
						const ids = await warpedMapLayer.addGeoreferenceAnnotationByUrl(annotationUrl);
						const stringIds = ids.filter((id): id is string => typeof id === 'string');
						if (stringIds.length > 0) {
							mapIdsByAnnotation.set(annotationUrl, new Set(stringIds));
							loadedAnnotations.add(annotationUrl);
						}
					} catch {
						console.warn('Kon annotatie niet laden:', annotationUrl);
					}
				})
			);
			loaded = true;
		});

		map.on('styleimagemissing', async (event) => {
			if (loadedStyleImages.has(event.id)) return;
			if (!isImageUrl(event.id)) return;

			loadedStyleImages.add(event.id);
			try {
				const image = await map.loadImage(event.id);
				if (!map.hasImage(event.id)) {
					map.addImage(event.id, image.data);
				}
			} catch {
				loadedStyleImages.delete(event.id);
			}
		});

		return () => {
			map.remove();
		};
	});

	let previousOpacity: number | undefined;
	function toggleMap(event: KeyboardEvent) {
		if (!enableKeyboardToggle || event.repeat) return;
		if (event.code === 'Space') {
			if (previousOpacity === undefined) {
				previousOpacity = opacity;
				opacity = 0;
			} else {
				opacity = previousOpacity;
				previousOpacity = undefined;
			}
		}
	}
</script>

<svelte:window on:keydown={toggleMap} on:keyup={toggleMap} />

<div bind:this={mapElement} class="absolute inset-0 h-full w-full"></div>
