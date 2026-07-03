<script lang="ts">
	import Map from '$lib/components/Map.svelte';
	import MapLayers from '$lib/components/MapLayers.svelte';
	import Slider from '$lib/components/Slider.svelte';
	import { fly } from 'svelte/transition';
	import type {
		AppConfig,
		GeocoderBounds,
		MapLayersKeyboardCommand,
		MapLayersOpenCommand,
		MapKeyboardCommand,
		MapLocation,
		MapMetadata,
		MapToolbarCommand,
		SliderKeyboardCommand
	} from '$lib/types';

	let {
		maps,
		config,
		annotation = $bindable(''),
		opacity = $bindable(100),
		selectedYear = $bindable(),
		mapKeyboardCommand,
		sliderKeyboardCommand,
		mapLayersKeyboardCommand,
		mapLayersOpenCommand,
		currentLocation = $bindable({
			center: [...config.map.initialView.center] as [number, number],
			zoom: config.map.initialView.zoom,
			bearing: config.map.initialView.bearing
		}),
		geocoderBounds = $bindable(),
		navPosition = 'left',
		mapToolbarCommand,
		paneSide = 'left',
		layersId = `map-layers-${navPosition}`,
		bordered = false,
		showMapYearTicks = true,
		showOnlyAvailableYears = config.slider.showOnlyAvailableYears ?? false,
		enableFlyTo = false,
		enableLocationMarker = false,
		enableLayersShortcut = false,
		showLayersPaneIndicator = false,
		showInViewControl = false,
		rotateToMapOrientation = $bindable(false),
		focusActiveMap = $bindable(false),
		autoplayActive = false,
		autoplayNextAnnotation,
		annotationsInView = $bindable<string[]>([]),
		annotationsAtCenter = $bindable<string[]>([])
	}: {
		maps: MapMetadata[];
		config: AppConfig;
		annotation?: string;
		opacity?: number;
		selectedYear: number;
		mapKeyboardCommand?: MapKeyboardCommand;
		sliderKeyboardCommand?: SliderKeyboardCommand;
		mapLayersKeyboardCommand?: MapLayersKeyboardCommand;
		mapLayersOpenCommand?: MapLayersOpenCommand;
		currentLocation?: MapLocation;
		geocoderBounds?: GeocoderBounds;
		navPosition?: 'left' | 'right';
		mapToolbarCommand?: MapToolbarCommand;
		paneSide?: 'left' | 'right';
		layersId?: string;
		bordered?: boolean;
		showMapYearTicks?: boolean;
		showOnlyAvailableYears?: boolean;
		enableFlyTo?: boolean;
		enableLocationMarker?: boolean;
		enableLayersShortcut?: boolean;
		showLayersPaneIndicator?: boolean;
		showInViewControl?: boolean;
		rotateToMapOrientation?: boolean;
		focusActiveMap?: boolean;
		autoplayActive?: boolean;
		autoplayNextAnnotation?: string;
		annotationsInView?: string[];
		annotationsAtCenter?: string[];
	} = $props();

	let mapOrderClass = $derived(navPosition === 'right' ? 'md:order-1' : 'md:order-2');
	let controlsPosition: 'top-left' | 'top-right' = $derived(
		navPosition === 'right' ? 'top-left' : 'top-right'
	);
	let sliderInViewOnly = $state(false);
</script>

<section
	class="map-pane relative flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden {bordered
		? 'md:border-r-2 md:border-gray-300'
		: ''}"
>
	{#if !autoplayActive}
		<div
			class="absolute inset-y-0 z-20 flex-none {navPosition === 'right' ? 'right-0' : 'left-0'}"
			transition:fly={{ x: navPosition === 'right' ? 96 : -96, duration: 180 }}
		>
			<Slider
				bind:selectedYear
				bind:inViewOnly={sliderInViewOnly}
				{maps}
				scaleInterval={config.slider.scaleInterval}
				{navPosition}
				{showMapYearTicks}
				{showOnlyAvailableYears}
				{annotationsInView}
				enableKeyboardShortcut={enableLayersShortcut}
				keyboardCommand={sliderKeyboardCommand}
			/>
		</div>
	{/if}

	<div class="relative min-h-0 flex-1 grow {mapOrderClass}">
		<Map
			bind:annotation
			bind:opacity
			bind:rotateToMapOrientation
			bind:focusActiveMap
			bind:inViewOnly={sliderInViewOnly}
			bind:currentLocation
			bind:annotationsInView
			bind:annotationsAtCenter
			bind:geocoderBounds
			{config}
			{mapKeyboardCommand}
			{mapToolbarCommand}
			{enableFlyTo}
			{enableLocationMarker}
			{navPosition}
			{controlsPosition}
			{showInViewControl}
			{autoplayActive}
			{autoplayNextAnnotation}
		/>
		<MapLayers
			bind:annotation
			bind:selectedYear
			{maps}
			{config}
			{layersId}
			{paneSide}
			{annotationsInView}
			preferInViewMaps={sliderInViewOnly || autoplayActive}
			requirePreferredMaps={autoplayActive}
			enableKeyboardShortcut={enableLayersShortcut}
			keyboardCommand={mapLayersKeyboardCommand}
			openCommand={mapLayersOpenCommand}
			showPaneIndicator={showLayersPaneIndicator}
			{autoplayActive}
		/>
	</div>
</section>

<style>
	.map-pane {
		container: map-pane / inline-size;
	}
</style>
