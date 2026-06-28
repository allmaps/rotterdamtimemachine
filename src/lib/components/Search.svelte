<script lang="ts">
	import { flyTo, selectedLocation } from '$lib/store.svelte';
	import { SearchService, type SearchResult } from '$lib/models/SearchService.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { LocateFixed, MapPin, Search as SearchIcon, X } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { slide } from 'svelte/transition';

	const search = new SearchService();

	let open = $state(false);
	let selectedIndex = $state(0);
	let locating = $state(false);
	let locationError = $state('');
	let inputElement: HTMLInputElement | undefined = $state();
	let listElement: HTMLUListElement | undefined = $state();

	$effect(() => {
		if (open) {
			tick().then(() => {
				inputElement?.focus();
			});
		} else {
			search.searchTerm = '';
			search.reset();
			selectedIndex = 0;
			locationError = '';
		}
	});

	function showSearch() {
		open = true;
	}

	function closeSearch() {
		open = false;
	}

	function handleInput() {
		selectedIndex = 0;
		locationError = '';
		search.searchWithDelay();
	}

	function selectResult(result: SearchResult) {
		flyTo.center = search.selectLocation(result);
		selectedLocation.center = flyTo.center;
		open = false;
	}

	function useUserLocation() {
		locationError = '';

		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			locationError = 'Je browser ondersteunt locatiebepaling niet.';
			return;
		}

		locating = true;

		navigator.geolocation.getCurrentPosition(
			(position) => {
				const center: [number, number] = [position.coords.longitude, position.coords.latitude];

				flyTo.center = center;
				selectedLocation.center = center;
				locating = false;
				open = false;
			},
			(error) => {
				locating = false;

				if (error.code === error.PERMISSION_DENIED) {
					locationError = 'Locatiebepaling is geweigerd.';
				} else if (error.code === error.TIMEOUT) {
					locationError = 'Locatiebepaling duurde te lang.';
				} else {
					locationError = 'Je locatie kon niet worden bepaald.';
				}
			},
			{ enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
		);
	}

	function scrollSelectedIntoView() {
		if (!listElement) return;
		const selectedElement = listElement.children[selectedIndex] as HTMLElement | undefined;
		selectedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	function handleKeydown(event: KeyboardEvent) {
		event.stopPropagation();

		if (event.key === 'Escape') {
			closeSearch();
			return;
		}

		if (search.results.length === 0) return;

		if (event.key === 'Enter') {
			event.preventDefault();
			selectResult(search.results[selectedIndex]);
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, search.results.length - 1);
			scrollSelectedIntoView();
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
			scrollSelectedIntoView();
		}
	}
</script>

<button
	type="button"
	onclick={showSearch}
	aria-label="Zoek locatie"
	class="flex h-8 items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-green-800 md:px-3"
>
	<SearchIcon class="h-4 w-4" />
	<span class="hidden sm:inline">Zoeken</span>
</button>

{#if open}
	<Modal onClose={closeSearch} ariaLabel="Zoek locatie" onKeydown={handleKeydown}>
		<div class="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
			<SearchIcon class="h-5 w-5 flex-none text-green-700" />
			<input
				bind:this={inputElement}
				bind:value={search.searchTerm}
				type="search"
				enterkeyhint="search"
				spellcheck="false"
				autocomplete="off"
				placeholder="Zoek locatie..."
				class="m-0 min-w-0 flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-gray-400"
				oninput={handleInput}
			/>
			<button
				type="button"
				aria-label={locating ? 'Locatie bepalen...' : 'Gebruik mijn locatie'}
				title={locating ? 'Locatie bepalen...' : 'Gebruik mijn locatie'}
				disabled={locating}
				class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-green-700 disabled:cursor-wait disabled:opacity-70"
				onclick={useUserLocation}
			>
				<LocateFixed class="h-5 w-5 {locating ? 'animate-pulse text-green-700' : ''}" />
			</button>
			<button
				type="button"
				aria-label="Sluit zoeken"
				class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
				onclick={closeSearch}
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		{#if locationError}
			<p class="border-b border-gray-100 px-4 py-2 text-sm font-medium text-red-700" role="alert">
				{locationError}
			</p>
		{/if}

		{#if search.searchTerm.trim() !== ''}
			<ul
				bind:this={listElement}
				transition:slide={{ duration: 140 }}
				class="max-h-[56vh] overflow-y-auto bg-white"
			>
				{#if search.results.length > 0}
					{#each search.results as result, index (`${result.place_id}-${result.lon}-${result.lat}`)}
						<li>
							<button
								type="button"
								class="flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition hover:bg-green-50 {index ===
								selectedIndex
									? 'bg-green-50'
									: ''}"
								onmouseenter={() => (selectedIndex = index)}
								onclick={() => selectResult(result)}
							>
								<MapPin class="mt-0.5 h-4 w-4 flex-none text-green-700" />
								<span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
									{result.display_name}
								</span>
							</button>
						</li>
					{/each}
				{:else}
					<li class="px-4 py-8 text-center text-sm text-gray-500">
						{#if search.error}
							{search.error}
						{:else if search.loading}
							Aan het zoeken...
						{:else}
							Geen resultaten gevonden.
						{/if}
					</li>
				{/if}
			</ul>
		{/if}
	</Modal>
{/if}

<style>
	input[type='search']::-webkit-search-cancel-button {
		-webkit-appearance: none;
		appearance: none;
	}
</style>
