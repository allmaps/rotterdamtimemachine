<script lang="ts">
	import Map from '$lib/components/Map.svelte';
	import MapInfo from '$lib/components/MapInfo.svelte';
	import Slider from '$lib/components/Slider.svelte';
	import type { MapLocation } from '$lib/types';

	let {
		annotation = $bindable(''),
		opacity = $bindable(100),
		selectedYear = $bindable(),
		currentLocation = $bindable({
			center: [4.4777, 51.9244] as [number, number],
			zoom: 12
		}),
		navPosition = 'left',
		bordered = false,
		syncUrl = false,
		enableFlyTo = false,
		enableLocationMarker = false,
		enableKeyboardToggle = false
	}: {
		annotation?: string;
		opacity?: number;
		selectedYear: number;
		currentLocation?: MapLocation;
		navPosition?: 'left' | 'right';
		bordered?: boolean;
		syncUrl?: boolean;
		enableFlyTo?: boolean;
		enableLocationMarker?: boolean;
		enableKeyboardToggle?: boolean;
	} = $props();

	let navOrderClass = $derived(navPosition === 'right' ? 'md:order-2' : 'md:order-1');
	let mapOrderClass = $derived(navPosition === 'right' ? 'md:order-1' : 'md:order-2');
</script>

<section
	class="flex flex-1 flex-row overflow-hidden {bordered ? 'md:border-r-2 md:border-gray-300' : ''}"
>
	<div class="flex-none {navOrderClass}">
		<Slider bind:selectedYear {navPosition} />
	</div>

	<div class="relative flex-1 grow {mapOrderClass}">
		<Map
			bind:annotation
			bind:opacity
			bind:currentLocation
			{syncUrl}
			{enableFlyTo}
			{enableLocationMarker}
			{enableKeyboardToggle}
		/>
		<MapInfo
			bind:annotation
			bind:opacity
			bind:selectedYear
			panelId="map-info-panel-{navPosition}"
		/>
	</div>
</section>
