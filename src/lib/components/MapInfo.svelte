<script lang="ts">
	import { MapCollection } from '$lib/models/MapCollection';
	import { zoomTo } from '$lib/store.svelte';
	import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LocateFixed } from '@lucide/svelte';

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

	let collapsed = $state(true);
	let resolvedYear = $derived(resolveAvailableYear(selectedYear));
	let mapsForResolvedYear = $derived(maps.filter((map) => map.metadata.year === resolvedYear));
	let activeOpacity = $derived(opacity ?? 100);
	let activeMap = $derived(
		mapsForResolvedYear.find((map) => map.metadata.annotation === annotation) ??
			mapsForResolvedYear[0]
	);
	let activeMapIndex = $derived(
		mapsForResolvedYear.findIndex(
			(map) => map.metadata.annotation === activeMap?.metadata.annotation
		)
	);
	let hasMultipleMaps = $derived(mapsForResolvedYear.length > 1);

	$effect(() => {
		if (activeMap && !mapsForResolvedYear.some((map) => map.metadata.annotation === annotation)) {
			annotation = activeMap.metadata.annotation;
		}
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
		collapsed = !collapsed;
	}

	function selectRelativeMap(direction: -1 | 1) {
		if (!hasMultipleMaps) return;

		const currentIndex = activeMapIndex >= 0 ? activeMapIndex : 0;
		const nextIndex =
			(currentIndex + direction + mapsForResolvedYear.length) % mapsForResolvedYear.length;
		const nextMap = mapsForResolvedYear[nextIndex];
		if (nextMap) {
			annotation = nextMap.metadata.annotation;
		}
	}
</script>

{#if activeMap}
	{#if collapsed}
		<div
			class="absolute right-2 bottom-2 left-2 z-30 flex min-h-14 items-center gap-1 overflow-hidden rounded-md border border-gray-200 bg-white p-1 text-gray-900 shadow-lg md:right-auto md:left-1/2 md:w-80 md:-translate-x-1/2"
		>
			<button
				type="button"
				aria-expanded="false"
				aria-controls={panelId}
				onclick={toggleCollapsed}
				class="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left hover:bg-gray-50"
			>
				<span
					class="flex-none rounded bg-gray-900 px-1.5 py-0.5 font-heading text-[0.65rem] text-white"
				>
					{activeMap.metadata.year}
				</span>
				<span class="min-w-0 flex-1 truncate text-sm leading-4 font-semibold">
					{activeMap.metadata.label}
				</span>
			</button>

			{#if hasMultipleMaps}
				<button
					type="button"
					aria-label="Vorige kaart"
					onclick={() => selectRelativeMap(-1)}
					class="flex h-10 w-8 flex-none items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900"
				>
					<ChevronLeft class="h-4 w-4" />
				</button>
				<button
					type="button"
					aria-label="Volgende kaart"
					onclick={() => selectRelativeMap(1)}
					class="flex h-10 w-8 flex-none items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900"
				>
					<ChevronRight class="h-4 w-4" />
				</button>
			{/if}

			<button
				type="button"
				aria-label="Kaartinfo uitklappen"
				aria-expanded="false"
				aria-controls={panelId}
				onclick={toggleCollapsed}
				class="flex h-10 w-8 flex-none items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900"
			>
				<ChevronUp class="h-4 w-4" />
			</button>
		</div>
	{:else}
		<div
			id={panelId}
			class="absolute right-2 bottom-2 left-2 z-30 max-h-[min(32rem,calc(100%-1rem))] overflow-x-hidden overflow-y-auto rounded-md border border-gray-200 bg-white p-2 text-gray-900 shadow-lg md:right-auto md:left-1/2 md:w-80 md:-translate-x-1/2"
		>
			<div class="mb-2 flex min-w-0 items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-m font-bolder font-semibold">Kaartlagen</p>
				</div>
				<div class="flex flex-none items-start gap-2">
					{#if selectedYear !== resolvedYear}
						<span class="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
							Geselecteerd: {selectedYear}
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
						type="button"
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
								class="flex-none rounded bg-gray-900 px-1.5 py-0.5 font-heading text-[0.65rem] text-white"
							>
								{map.metadata.year}
							</span>
						</div>
						<div class="flex min-w-0 flex-wrap gap-1 text-[0.65rem] font-semibold text-gray-500">
							<span class="max-w-full rounded bg-gray-100 px-1.5 py-0.5 break-words">
								{map.metadata.institution}
							</span>
						</div>
					</button>
				{/each}
			</div>
			<div class="mt-3 pt-2 leading-4">
				<p class="text-m mb-3 font-bolder font-light">Transparantie</p>
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
			</div>

			<button
				type="button"
				onclick={() => (zoomTo.annotation = activeMap?.metadata.annotation ?? null)}
				class="flex w-full items-center justify-center gap-2 rounded bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-800"
			>
				<LocateFixed size={14} />
				Zoom
			</button>

			<div class="mt-3 pt-2 leading-4">
				<p class="text-m mb-3 font-bolder font-light">Achtergrondkaart</p>
				<p class="text-xs font-light break-words">
					<a
						class=" hover:text-gray-800"
						href="https://github.com/protomaps/basemaps"
						target="_blank"
						rel="external noreferrer"
					>
						Protomaps
					</a>
					<span aria-hidden="true"> | </span>
					<a
						class=" hover:text-gray-800"
						href="https://www.openstreetmap.org/copyright"
						target="_blank"
						rel="external noreferrer"
					>
						© OpenStreetMap
					</a>
				</p>
			</div>
		</div>
	{/if}
{/if}
