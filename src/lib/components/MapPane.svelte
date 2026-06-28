<script lang="ts">
	import Map from '$lib/components/Map.svelte';
	import MapLayers from '$lib/components/MapLayers.svelte';
	import Slider from '$lib/components/Slider.svelte';
	import type { MapKeyboardCommand, MapLocation } from '$lib/types';

	let {
		annotation = $bindable(''),
		opacity = $bindable(100),
		selectedYear = $bindable(),
		mapKeyboardCommand,
		currentLocation = $bindable({
			center: [4.4777, 51.9244] as [number, number],
			zoom: 12,
			bearing: 0
		}),
		navPosition = 'left',
		paneSide = 'left',
		layersId = `map-layers-${navPosition}`,
		bordered = false,
		showMapYearTicks = true,
		syncUrl = false,
		enableFlyTo = false,
		enableLocationMarker = false,
		enableLayersShortcut = false,
		showLayersPaneIndicator = false
	}: {
		annotation?: string;
		opacity?: number;
		selectedYear: number;
		mapKeyboardCommand?: MapKeyboardCommand;
		currentLocation?: MapLocation;
		navPosition?: 'left' | 'right';
		paneSide?: 'left' | 'right';
		layersId?: string;
		bordered?: boolean;
		showMapYearTicks?: boolean;
		syncUrl?: boolean;
		enableFlyTo?: boolean;
		enableLocationMarker?: boolean;
		enableLayersShortcut?: boolean;
		showLayersPaneIndicator?: boolean;
	} = $props();

	let mapOrderClass = $derived(navPosition === 'right' ? 'md:order-1' : 'md:order-2');
	let controlsPosition: 'top-left' | 'top-right' = $derived(
		navPosition === 'right' ? 'top-left' : 'top-right'
	);
	let annotationsInView = $state<string[]>([]);
	let rotateToMapOrientation = $state(false);
	let focusActiveMap = $state(false);
	let sliderInViewOnly = $state(false);
</script>

<section
	class="map-pane relative flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden {bordered
		? 'md:border-r-2 md:border-gray-300'
		: ''}"
>
	<div class="absolute inset-y-0 z-20 flex-none {navPosition === 'right' ? 'right-0' : 'left-0'}">
		<Slider
			bind:selectedYear
			bind:inViewOnly={sliderInViewOnly}
			{navPosition}
			{showMapYearTicks}
			{annotationsInView}
			enableKeyboardShortcut={enableLayersShortcut}
		/>
	</div>

	<div class="relative flex-1 grow {mapOrderClass}">
		<Map
			bind:annotation
			bind:opacity
			bind:rotateToMapOrientation
			bind:focusActiveMap
			bind:inViewOnly={sliderInViewOnly}
			bind:currentLocation
			bind:annotationsInView
			{mapKeyboardCommand}
			{syncUrl}
			{enableFlyTo}
			{enableLocationMarker}
			{controlsPosition}
		/>
		<MapLayers
			bind:annotation
			bind:selectedYear
			{layersId}
			{paneSide}
			{annotationsInView}
			preferInViewMaps={sliderInViewOnly}
			enableKeyboardShortcut={enableLayersShortcut}
			showPaneIndicator={showLayersPaneIndicator}
		/>
	</div>
</section>

<style>
	.map-pane {
		container: map-pane / inline-size;
	}
</style>
