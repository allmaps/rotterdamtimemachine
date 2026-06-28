<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { MapCollection } from '$lib/models/MapCollection';
	import { favorites, toggleFavorite } from '$lib/store.svelte';
	import {
		ChevronLeft,
		ChevronRight,
		Eye,
		ExternalLink,
		Layers,
		MapPinned,
		PanelLeft,
		PanelRight,
		Search as SearchIcon,
		Star,
		X
	} from '@lucide/svelte';
	import { tick } from 'svelte';
	import { slide } from 'svelte/transition';

	let {
		annotation = $bindable(),
		selectedYear = $bindable(),
		layersId = 'map-layers',
		paneSide = 'left',
		showPaneIndicator = false,
		enableKeyboardShortcut = false,
		annotationsInView = []
	}: {
		annotation?: string;
		selectedYear: number;
		layersId?: string;
		paneSide?: 'left' | 'right';
		showPaneIndicator?: boolean;
		enableKeyboardShortcut?: boolean;
		annotationsInView?: string[];
	} = $props();

	const collection = new MapCollection();
	const maps = collection.getAllMaps();
	const availableYears = [...new Set(maps.map((map) => map.metadata.year))].sort((a, b) => a - b);

	let layersOpen = $state(false);
	let showCollection = $state(false);
	let showFavoritesOnly = $state(false);
	let showInViewOnly = $state(false);
	let searchTerm = $state('');
	let selectedIndex = $state(0);
	let listElement = $state<HTMLUListElement>();
	let searchInputElement = $state<HTMLInputElement>();

	let modalId = $derived(`${layersId}-modal`);
	let modalTitleId = $derived(`${modalId}-title`);
	let paneIndicatorLabel = $derived(paneSide === 'left' ? 'Linker kaart' : 'Rechter kaart');
	let resolvedYear = $derived(resolveAvailableYear(selectedYear));
	let mapsForResolvedYear = $derived(maps.filter((map) => map.metadata.year === resolvedYear));
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
	let annotationsInViewSet = $derived(new Set(annotationsInView));
	let normalizedSearchTerm = $derived(normalizeSearchTerm(searchTerm));
	let visibleMaps = $derived(
		(showCollection ? maps : mapsForResolvedYear).filter(
			(map) =>
				(showFavoritesOnly ? favorites.includes(map.metadata.annotation) : true) &&
				(showInViewOnly ? annotationsInViewSet.has(map.metadata.annotation) : true) &&
				(normalizedSearchTerm ? getSearchText(map).includes(normalizedSearchTerm) : true)
		)
	);
	let resultLabel = $derived(`${visibleMaps.length} kaart${visibleMaps.length === 1 ? '' : 'en'}`);

	$effect(() => {
		if (activeMap && !mapsForResolvedYear.some((map) => map.metadata.annotation === annotation)) {
			annotation = activeMap.metadata.annotation;
		}
	});

	$effect(() => {
		if (layersOpen) {
			tick().then(() => {
				searchInputElement?.focus();
				selectActiveResult();
			});
		}
	});

	$effect(() => {
		if (visibleMaps.length === 0) {
			selectedIndex = 0;
		} else if (selectedIndex > visibleMaps.length - 1) {
			selectedIndex = visibleMaps.length - 1;
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

	function normalizeSearchTerm(value: string) {
		return value
			.toLocaleLowerCase('nl-NL')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.trim();
	}

	function getSearchText(map: (typeof maps)[0]) {
		return normalizeSearchTerm(
			[map.metadata.label, map.metadata.title, map.metadata.year, map.metadata.institution].join(
				' '
			)
		);
	}

	function openLayers() {
		resetModalState();
		layersOpen = true;
	}

	function closeLayers() {
		layersOpen = false;
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (!enableKeyboardShortcut || event.repeat) return;
		if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;

		event.preventDefault();
		event.stopPropagation();

		if (layersOpen) {
			searchInputElement?.focus();
		} else {
			openLayers();
		}
	}

	function resetModalState() {
		showCollection = false;
		showFavoritesOnly = false;
		showInViewOnly = false;
		searchTerm = '';
		selectedIndex = Math.max(
			0,
			mapsForResolvedYear.findIndex((map) => map.metadata.annotation === annotation)
		);
	}

	function selectMap(map: (typeof maps)[0]) {
		annotation = map.metadata.annotation;
		selectedYear = map.metadata.year;
		closeLayers();
	}

	async function showCollectionView() {
		showCollection = true;
		searchInputElement?.focus();
		await selectActiveResult();
	}

	async function showCurrentYearView() {
		showCollection = false;
		searchInputElement?.focus();
		await selectActiveResult();
	}

	async function selectActiveResult() {
		await tick();
		if (!annotation) return;

		const activeIndex = visibleMaps.findIndex((map) => map.metadata.annotation === annotation);
		selectedIndex = Math.max(0, activeIndex);
		scrollSelectedIntoView('center');
	}

	function handleSearchInput() {
		if (searchTerm.trim() !== '') {
			showCollection = true;
		}
		selectedIndex = 0;
	}

	function toggleFavoritesFilter() {
		showFavoritesOnly = !showFavoritesOnly;
		selectedIndex = 0;
		searchInputElement?.focus();
	}

	function toggleInViewFilter() {
		showInViewOnly = !showInViewOnly;
		selectedIndex = 0;
		searchInputElement?.focus();
	}

	function scrollSelectedIntoView(block: ScrollLogicalPosition = 'nearest') {
		if (!listElement) return;

		const selectedElement = listElement.children[selectedIndex] as HTMLElement | undefined;
		selectedElement?.scrollIntoView({ block, inline: 'nearest' });
	}

	function handleKeydown(event: KeyboardEvent) {
		event.stopPropagation();

		if (event.key === 'Escape') {
			closeLayers();
			return;
		}

		if (visibleMaps.length === 0) return;

		if (event.key === 'Enter') {
			const target = event.target instanceof HTMLElement ? event.target : undefined;
			if (target?.closest('button, a')) return;

			event.preventDefault();
			selectMap(visibleMaps[selectedIndex]);
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, visibleMaps.length - 1);
			scrollSelectedIntoView();
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
			scrollSelectedIntoView();
		}
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

<svelte:window onkeydown={handleGlobalKeydown} />

{#if activeMap}
	<div
		class="absolute right-2 bottom-2 left-2 grid grid-flow-col items-center justify-items-center"
	>
		<div
			class="z-30 flex min-h-14 w-full max-w-xl items-center gap-3 overflow-hidden rounded-md border border-gray-200 bg-white p-1 text-gray-900 shadow-lg"
		>
			<div class="min-w-0 flex-1 rounded">
				<button
					type="button"
					aria-haspopup="dialog"
					aria-controls={modalId}
					onclick={openLayers}
					class="flex w-full min-w-0 items-center gap-2 rounded px-2 pt-1 pb-0.5 text-left hover:bg-gray-50"
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
				<div class="px-2 pt-1 pb-1">
					<a
						href={activeMap.metadata.url}
						target="_blank"
						rel="external noopener noreferrer"
						class="inline-flex max-w-full items-center gap-1 text-xs font-medium text-gray-500 hover:text-green-700"
						aria-label="Bekijk item bij {activeMap.metadata.institution}"
					>
						<span class="min-w-0 truncate">{activeMap.metadata.institution}</span>
						<ExternalLink class="h-3 w-3 flex-none" />
					</a>
				</div>
			</div>

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
				aria-label="Open kaartlagen"
				aria-haspopup="dialog"
				aria-controls={modalId}
				onclick={openLayers}
				class="flex h-10 w-10 flex-none items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900"
			>
				<Layers class="h-4 w-4" />
			</button>
		</div>
	</div>

	{#if layersOpen}
		<Modal
			onClose={closeLayers}
			ariaLabelledby={modalTitleId}
			panelClass="max-h-[calc(100vh-5.5rem)] max-w-2xl md:max-h-[calc(100vh-8rem)]"
			onKeydown={handleKeydown}
		>
			<div class="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
				<Layers class="h-5 w-5 flex-none text-green-700" />
				<div class="min-w-0 flex-1">
					<h2 id={modalTitleId} class="text-lg leading-6 font-semibold">Kaartlagen</h2>
					<p class="truncate text-xs font-medium text-gray-500">
						{resultLabel}
						{#if searchTerm}
							gevonden
						{/if}
						{#if !showCollection}
							voor {resolvedYear}
						{/if}
					</p>
				</div>
				{#if showPaneIndicator}
					<div
						title={paneIndicatorLabel}
						class="flex flex-none items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600"
					>
						{#if paneSide === 'left'}
							<PanelLeft class="h-4 w-4 flex-none" />
						{:else}
							<PanelRight class="h-4 w-4 flex-none" />
						{/if}
						<span class="hidden sm:inline">{paneIndicatorLabel}</span>
					</div>
				{/if}
				<button
					type="button"
					aria-label="Sluit kaartlagen"
					class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
					onclick={closeLayers}
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<div class="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
				<SearchIcon class="h-5 w-5 flex-none text-green-700" />
				<input
					bind:this={searchInputElement}
					bind:value={searchTerm}
					type="search"
					enterkeyhint="search"
					spellcheck="false"
					autocomplete="off"
					placeholder="Zoek kaart..."
					class="m-0 min-w-0 flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-gray-400"
					oninput={handleSearchInput}
				/>
			</div>

			<div class="border-b border-gray-200 bg-gray-50 px-4 py-3">
				<div class="grid grid-cols-4 gap-1 text-xs font-semibold">
					<button
						type="button"
						aria-pressed={!showCollection}
						onclick={showCurrentYearView}
						class="min-w-0 rounded border px-1 py-2 transition {!showCollection
							? 'border-gray-900 bg-white text-gray-900 shadow-sm'
							: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'}"
					>
						<span class="block truncate">Huidig</span>
					</button>
					<button
						type="button"
						aria-pressed={showCollection}
						onclick={showCollectionView}
						class="min-w-0 rounded border px-1 py-2 transition {showCollection
							? 'border-gray-900 bg-white text-gray-900 shadow-sm'
							: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'}"
					>
						<span class="block truncate">Collectie</span>
					</button>
					<button
						type="button"
						aria-pressed={showFavoritesOnly}
						onclick={toggleFavoritesFilter}
						class="flex min-w-0 items-center justify-center gap-1 rounded border px-1 py-2 transition {showFavoritesOnly
							? 'border-yellow-500 bg-yellow-50 text-gray-900'
							: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'}"
					>
						<Star
							class="h-4 w-4 flex-none {showFavoritesOnly
								? 'fill-yellow-400 text-yellow-500'
								: 'text-gray-400'}"
						/>
						<span class="min-w-0 truncate">Favoriet</span>
					</button>

					<button
						type="button"
						aria-pressed={showInViewOnly}
						onclick={toggleInViewFilter}
						class="flex min-w-0 items-center justify-center gap-1 rounded border px-1 py-2 transition {showInViewOnly
							? 'border-green-700 bg-green-50 text-gray-900'
							: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'}"
					>
						<MapPinned
							class="h-4 w-4 flex-none {showInViewOnly ? 'text-green-700' : 'text-gray-400'}"
						/>
						<span class="min-w-0 truncate">In beeld</span>
					</button>
				</div>

				<!-- {#if selectedYear !== resolvedYear}
					<p class="text-xs font-medium text-gray-500">
						Geselecteerd jaar {selectedYear}; getoond wordt {resolvedYear}.
					</p>
				{/if} -->
			</div>

			{#if visibleMaps.length > 0}
				<ul
					bind:this={listElement}
					transition:slide={{ duration: 140 }}
					class="min-h-0 flex-1 overflow-y-auto bg-white"
				>
					{#each visibleMaps as map, index (map.metadata.annotation)}
						<li
							data-map-annotation={map.metadata.annotation}
							class="border-b border-gray-100 last:border-b-0"
						>
							<div
								class="flex min-w-0 items-stretch transition {index === selectedIndex
									? 'bg-green-50'
									: 'hover:bg-gray-50'}"
							>
								<div class="min-w-0 flex-1">
									<button
										type="button"
										aria-label="Selecteer {map.metadata.label} ({map.metadata.year}, {map.metadata
											.institution})"
										onclick={() => selectMap(map)}
										onmouseenter={() => (selectedIndex = index)}
										class="w-full min-w-0 px-4 pt-3 pb-1 text-left"
									>
										<div class="flex min-w-0 items-start justify-between gap-2">
											<p
												class="min-w-0 flex-1 text-sm leading-4 font-semibold break-words text-gray-900"
											>
												{map.metadata.label}
											</p>
											<span
												class="flex-none rounded bg-gray-900 px-1.5 py-0.5 font-heading text-[0.65rem] text-white"
											>
												{map.metadata.year}
											</span>
											{#if annotation === map.metadata.annotation}
												<span
													title="Zichtbaar op de kaart"
													class="flex h-5 w-5 flex-none items-center justify-center rounded bg-green-100 text-green-700"
												>
													<span class="sr-only">Zichtbaar op de kaart</span>
													<Eye class="h-3.5 w-3.5" />
												</span>
											{/if}
										</div>
									</button>
									<div class="px-4 pb-3 text-[0.65rem] font-semibold text-gray-500">
										<a
											href={map.metadata.url}
											target="_blank"
											rel="external noopener noreferrer"
											aria-label="Bekijk item bij {map.metadata.institution}"
											onmouseenter={() => (selectedIndex = index)}
											class="inline-flex max-w-full items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 hover:bg-green-50 hover:text-green-700"
										>
											<span class="min-w-0 break-words">{map.metadata.institution}</span>
											<ExternalLink class="h-3 w-3 flex-none" />
										</a>
									</div>
								</div>

								<button
									type="button"
									aria-label={favorites.includes(map.metadata.annotation)
										? `Verwijder ${map.metadata.label} (${map.metadata.year}, ${map.metadata.institution}) uit favorieten`
										: `Voeg ${map.metadata.label} (${map.metadata.year}, ${map.metadata.institution}) toe aan favorieten`}
									aria-pressed={favorites.includes(map.metadata.annotation)}
									onclick={() => toggleFavorite(map.metadata.annotation)}
									onmouseenter={() => (selectedIndex = index)}
									class="flex w-12 flex-none items-center justify-center border-l border-gray-100 text-gray-400 hover:bg-white hover:text-yellow-500"
								>
									<Star
										class="h-4 w-4 {favorites.includes(map.metadata.annotation)
											? 'fill-yellow-400 text-yellow-500'
											: ''}"
									/>
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p
					transition:slide={{ duration: 140 }}
					class="bg-white px-4 py-8 text-center text-sm text-gray-500"
				>
					Geen kaarten gevonden.
				</p>
			{/if}

			<div class="border-t border-gray-200 px-4 py-3 text-xs leading-4 font-light text-gray-600">
				<p class="break-words">
					Achtergrondkaart:
					<a
						class="hover:text-gray-800"
						href="https://github.com/protomaps/basemaps"
						target="_blank"
						rel="external noreferrer"
					>
						Protomaps
					</a>
					<span aria-hidden="true"> | </span>
					<a
						class="hover:text-gray-800"
						href="https://www.openstreetmap.org/copyright"
						target="_blank"
						rel="external noreferrer"
					>
						© OpenStreetMap
					</a>
				</p>
			</div>
		</Modal>
	{/if}
{/if}

<style>
	input[type='search']::-webkit-search-cancel-button {
		-webkit-appearance: none;
		appearance: none;
	}
</style>
