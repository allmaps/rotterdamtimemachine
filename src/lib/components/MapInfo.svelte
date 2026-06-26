<script lang="ts">
	import { MapCollection } from '$lib/models/MapCollection';
	import { zoomTo } from '$lib/store.svelte';
	import { ChevronDown, ChevronUp, LocateFixed } from '@lucide/svelte';
	import { onMount } from 'svelte';

	let {
		annotation = $bindable(),
		opacity = $bindable(100),
		selectedYear = $bindable(),
		panelId = 'map-info-panel'
	}: {
		annotation?: string;
		opacity?: number;
		selectedYear: number;
		panelId?: string;
	} = $props();

	const collection = new MapCollection();
	const maps = collection.getAllMaps();
	const availableYears = [...new Set(maps.map((map) => map.metadata.year))].sort((a, b) => a - b);

	let collapsed = $state(false);
	let userToggled = false;
	let resolvedYear = $derived(resolveAvailableYear(selectedYear));
	let mapsForResolvedYear = $derived(maps.filter((map) => map.metadata.year === resolvedYear));
	let activeOpacity = $derived(opacity ?? 100);
	let activeMap = $derived(
		mapsForResolvedYear.find((map) => map.metadata.annotation === annotation) ??
			mapsForResolvedYear[0]
	);

	$effect(() => {
		if (activeMap && !mapsForResolvedYear.some((map) => map.metadata.annotation === annotation)) {
			annotation = activeMap.metadata.annotation;
		}
	});

	onMount(() => {
		const smallScreen = window.matchMedia('(max-width: 767px)');

		function syncCollapsed(event: MediaQueryList | MediaQueryListEvent) {
			if (!userToggled) {
				collapsed = event.matches;
			}
		}

		syncCollapsed(smallScreen);
		smallScreen.addEventListener('change', syncCollapsed);

		return () => {
			smallScreen.removeEventListener('change', syncCollapsed);
		};
	});

	function resolveAvailableYear(year: number) {
		let resolved = availableYears[0] ?? year;
		for (const availableYear of availableYears) {
			if (availableYear <= year) {
				resolved = availableYear;
			}
		}
		return resolved;
	}

	function handleOpacity(e: Event) {
		opacity = Number((e.target as HTMLInputElement).value);
	}

	function toggleCollapsed() {
		userToggled = true;
		collapsed = !collapsed;
	}
</script>

{#if activeMap}
	{#if collapsed}
		<button
			type="button"
			aria-expanded="false"
			aria-controls={panelId}
			onclick={toggleCollapsed}
			class="absolute right-2 bottom-8 z-10 flex max-w-[calc(100%-1rem)] items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-lg hover:bg-gray-50"
		>
			<span class="min-w-0 truncate">Kaartinfo {resolvedYear}</span>
			<ChevronUp class="h-4 w-4 flex-none" />
		</button>
	{:else}
		<div
			id={panelId}
			class="absolute right-2 bottom-8 left-2 z-10 max-h-[min(32rem,calc(100%-4rem))] overflow-x-hidden overflow-y-auto rounded-md border border-gray-200 bg-white p-2 text-gray-900 shadow-lg md:left-auto md:w-80"
		>
			<div class="mb-2 flex min-w-0 items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-xs font-bold tracking-widest text-gray-500 uppercase">Kaartinfo</p>
					<h2 class="text-lg leading-5 font-bold text-gray-900">{resolvedYear}</h2>
				</div>
				<div class="flex flex-none items-start gap-2">
					{#if selectedYear !== resolvedYear}
						<span class="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
							gekozen: {selectedYear}
						</span>
					{/if}
					<button
						type="button"
						aria-expanded="true"
						aria-controls={panelId}
						aria-label="Kaartinfo inklappen"
						onclick={toggleCollapsed}
						class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
					>
						<ChevronDown class="h-4 w-4" />
					</button>
				</div>
			</div>

			<div class="mb-3 flex min-w-0 flex-col gap-2">
				{#each mapsForResolvedYear as map (map.metadata.annotation)}
					<button
						onclick={() => (annotation = map.metadata.annotation)}
						class="min-w-0 rounded border p-2 text-left transition {annotation ===
						map.metadata.annotation
							? 'border-green-700 bg-green-50'
							: 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}"
					>
						<div class="mb-1 flex min-w-0 items-start justify-between gap-2">
							<p class="min-w-0 flex-1 text-sm leading-4 font-semibold break-words text-gray-900">
								{map.metadata.label}
							</p>
							<span
								class="flex-none rounded bg-gray-900 px-1.5 py-0.5 font-mono text-[0.65rem] text-white"
							>
								{map.metadata.year}
							</span>
						</div>
						<div class="flex min-w-0 flex-wrap gap-1 text-[0.65rem] font-semibold text-gray-500">
							<span class="max-w-full rounded bg-gray-100 px-1.5 py-0.5 break-words">
								{map.metadata.institution}
							</span>
							<span class="rounded border border-gray-200 px-1.5 py-0.5">
								{map.metadata.iiif ? 'IIIF / GeoRef' : 'GeoRef'}
							</span>
						</div>
					</button>
				{/each}
			</div>

			<p class="mb-1 text-xs font-bold tracking-widest text-gray-500 uppercase">Transparantie</p>
			<input
				value={activeOpacity}
				oninput={handleOpacity}
				type="range"
				min="0"
				max="100"
				class="m-0 mb-1 w-full accent-green-700"
			/>
			<div class="mb-3 flex justify-between text-xs text-gray-400">
				<span>0%</span>
				<span class="font-bold text-gray-700">{activeOpacity}%</span>
				<span>100%</span>
			</div>

			<button
				onclick={() => (zoomTo.annotation = activeMap?.metadata.annotation ?? null)}
				class="flex w-full items-center justify-center gap-2 rounded bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-800"
			>
				<LocateFixed size={14} />
				Zoom
			</button>

			<div class="mt-3 border-t border-gray-200 pt-2 text-[0.65rem] leading-4 text-gray-500">
				<p class="font-bold tracking-widest uppercase">Attributie</p>
				<p class="break-words">
					<a
						class="font-semibold hover:text-gray-800"
						href="https://maplibre.org/"
						target="_blank"
						rel="external noreferrer"
					>
						MapLibre
					</a>
					<span aria-hidden="true"> | </span>
					<a
						class="font-semibold hover:text-gray-800"
						href="https://github.com/protomaps/basemaps"
						target="_blank"
						rel="external noreferrer"
					>
						Protomaps
					</a>
					<span aria-hidden="true"> | </span>
					<a
						class="font-semibold hover:text-gray-800"
						href="https://www.openstreetmap.org/copyright"
						target="_blank"
						rel="external noreferrer"
					>
						OpenStreetMap
					</a>
				</p>
			</div>
		</div>
	{/if}
{/if}
