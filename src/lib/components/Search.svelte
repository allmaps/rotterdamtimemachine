<script lang="ts">
	import { flyTo, selectedLocation } from '$lib/store.svelte';
	import { SearchService, type SearchResult } from '$lib/models/SearchService.svelte';
	import { MapPin, Search as SearchIcon, X } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { fly, slide } from 'svelte/transition';

	const search = new SearchService();

	let open = $state(false);
	let selectedIndex = $state(0);
	let inputElement: HTMLInputElement | undefined = $state();
	let listElement: HTMLUListElement | undefined = $state();
	let dialogElement: HTMLDivElement | undefined = $state();
	let firstFocusableElement: HTMLElement | undefined = $state();
	let lastFocusableElement: HTMLElement | undefined = $state();

	$effect(() => {
		if (open) {
			tick().then(() => {
				inputElement?.focus();
				updateFocusableElements();
			});
		} else {
			search.searchTerm = '';
			search.reset();
			selectedIndex = 0;
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
		search.searchWithDelay();
	}

	function selectResult(result: SearchResult) {
		flyTo.center = search.selectLocation(result);
		selectedLocation.center = flyTo.center;
		open = false;
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

	function updateFocusableElements() {
		if (!dialogElement) return;

		const focusableElements = dialogElement.querySelectorAll<HTMLElement>(
			'button:not([tabindex="-1"]), input:not([tabindex="-1"]), [href]:not([tabindex="-1"]), select:not([tabindex="-1"]), textarea:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
		);

		firstFocusableElement = focusableElements[0];
		lastFocusableElement = focusableElements[focusableElements.length - 1];
	}

	function trapFocus(event: KeyboardEvent) {
		if (!open || event.key !== 'Tab') return;

		if (event.shiftKey && document.activeElement === firstFocusableElement) {
			event.preventDefault();
			lastFocusableElement?.focus();
		} else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
			event.preventDefault();
			firstFocusableElement?.focus();
		}
	}
</script>

<svelte:document onkeydown={trapFocus} />

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
	<div
		bind:this={dialogElement}
		class="fixed inset-0 z-[1000] flex items-start justify-center bg-black/45 px-3 pt-14 md:pt-24"
		role="dialog"
		aria-modal="true"
		aria-label="Zoek locatie"
		tabindex="-1"
		onkeydown={handleKeydown}
	>
		<button
			type="button"
			class="absolute inset-0 cursor-default"
			aria-hidden="true"
			tabindex="-1"
			onclick={closeSearch}
			transition:fly={{ y: -4, duration: 150 }}
		></button>

		<div
			class="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-2xl"
			transition:fly={{ y: -16, duration: 180 }}
		>
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
					aria-label="Sluit zoeken"
					class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
					onclick={closeSearch}
				>
					<X class="h-5 w-5" />
				</button>
			</div>

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
		</div>
	</div>
{/if}

<style>
	input[type='search']::-webkit-search-cancel-button {
		-webkit-appearance: none;
		appearance: none;
	}
</style>
