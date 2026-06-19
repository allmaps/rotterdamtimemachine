<script lang="ts">
	import Map from '$lib/components/Map.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import MapInfo from '$lib/components/MapInfo.svelte';

	import Header from '$lib/components/Header.svelte';
	import About from '$lib/components/About.svelte';
	import Share from '$lib/components/Share.svelte';
	import { onMount } from 'svelte';
	import data from '$lib/content/data';
	import { comparison, flyTo, mapView, viewState } from '$lib/store.svelte';

	let overOpen = $state(false);
	let shareOpen = $state(false);
	let navOpen = $state(false);
	$effect(() => {
		if (comparison.active) navOpen = false;
	});

	if (!comparison.leftAnnotation) comparison.leftAnnotation = data[0]?.annotation ?? '';
	if (!comparison.rightAnnotation) comparison.rightAnnotation = data[1]?.annotation ?? '';

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const lat = params.get('lat');
		const lng = params.get('lng');
		const zoom = params.get('zoom');
		const year = params.get('year');

		if (lat && lng) {
			flyTo.center = [parseFloat(lng), parseFloat(lat)];
			if (zoom) mapView.zoom = parseFloat(zoom);
		}

		if (year) {
			const gevonden = data.find((d) => d.annotation === year);
			if (gevonden) viewState.annotation = gevonden.annotation;
		}
	});
</script>

<div class="flex h-screen flex-col">
	<Header
		onOverOpen={() => (overOpen = true)}
		onShareOpen={() => (shareOpen = true)}
		onMenuToggle={() => (navOpen = !navOpen)}
	/>

	{#if !comparison.active}
		<div class="flex flex-1 flex-row overflow-hidden">
			<div class="{navOpen ? 'block' : 'hidden'} md:block">
				<Nav onOverOpen={() => (overOpen = true)} onShareOpen={() => (shareOpen = true)} />
			</div>

			<div class="relative flex-1 grow">
				<Map />
				<MapInfo />
			</div>
		</div>
	{:else}
		<div class="flex flex-1 flex-col overflow-hidden md:flex-row">
			<!-- Desktop: nav links -->
			<div class="hidden md:block">
				<Nav
					onSelect={(ann) => (comparison.leftAnnotation = ann)}
					opacity={comparison.leftOpacity}
					onOpacityChange={(v) => (comparison.leftOpacity = v)}
				/>
			</div>

			<!-- Kaarten: 2 Map instanties, layout past zich aan -->
			<div class="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
				<!-- Panel 1 -->
				<div class="flex flex-col md:flex-1 md:border-r-2 md:border-gray-300">
					<!-- Mobiel: volledige nav boven kaart -->
					<div class="flex-none md:hidden">
						<Nav
							onSelect={(ann) => (comparison.leftAnnotation = ann)}
							opacity={comparison.leftOpacity}
							onOpacityChange={(v) => (comparison.leftOpacity = v)}
							onOverOpen={() => (overOpen = true)}
							onShareOpen={() => (shareOpen = true)}
						/>
					</div>
					<!-- Kaart (vaste hoogte op mobiel, flexibel op desktop) -->
					<div
						class="relative h-72 flex-none border-b-2 border-gray-300 md:relative md:h-auto md:flex-1 md:border-b-0"
					>
						<Map annotation={comparison.leftAnnotation} opacity={comparison.leftOpacity} />
						<MapInfo annotation={comparison.leftAnnotation} opacity={comparison.leftOpacity} onOpacityChange={(v) => (comparison.leftOpacity = v)} />
					</div>
				</div>
				<!-- Panel 2 -->
				<div class="flex flex-col md:flex-1">
					<!-- Mobiel: volledige nav boven kaart -->
					<div class="flex-none md:hidden">
						<Nav
							onSelect={(ann) => (comparison.rightAnnotation = ann)}
							opacity={comparison.rightOpacity}
							onOpacityChange={(v) => (comparison.rightOpacity = v)}
							onOverOpen={() => (overOpen = true)}
							onShareOpen={() => (shareOpen = true)}
						/>
					</div>
					<!-- Kaart -->
					<div class="relative h-72 flex-none md:relative md:h-auto md:flex-1">
						<Map annotation={comparison.rightAnnotation} opacity={comparison.rightOpacity} />
						<MapInfo annotation={comparison.rightAnnotation} opacity={comparison.rightOpacity} onOpacityChange={(v) => (comparison.rightOpacity = v)} />
					</div>
				</div>
			</div>

			<!-- Desktop: nav rechts -->
			<div class="hidden md:block">
				<Nav
					onSelect={(ann) => (comparison.rightAnnotation = ann)}
					opacity={comparison.rightOpacity}
					onOpacityChange={(v) => (comparison.rightOpacity = v)}
				/>
			</div>
		</div>
	{/if}

	{#if overOpen}
		<About onClose={() => (overOpen = false)} />
	{/if}

	{#if shareOpen}
		<Share onClose={() => (shareOpen = false)} />
	{/if}
</div>
