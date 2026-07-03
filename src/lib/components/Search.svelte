<script lang="ts">
	import { flyTo, selectedLocation } from '$lib/app-state.svelte.js';
	import { GeocoderService, type GeocoderResult } from '$lib/services/geocoder.svelte.js';
	import Modal from '$lib/components/Modal.svelte';
	import { CornerDownLeft, LocateFixed, MapPin, Search as SearchIcon, X } from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import type { AppConfig, GeocoderBounds } from '$lib/types';

	let {
		bounds,
		config
	}: {
		bounds?: GeocoderBounds;
		config: AppConfig;
	} = $props();

	const search = untrack(() => new GeocoderService(config.search));

	let open = $state(false);
	let selectedIndex = $state(0);
	let locating = $state(false);
	let locationError = $state('');
	let inputElement: HTMLInputElement | undefined = $state();
	let listElement: HTMLUListElement | undefined = $state();
	let showSearchResults = $derived(
		search.searchTerm.trim() !== '' &&
			(search.loading || search.hasSearched || !!search.error || search.results.length > 0)
	);
	let canSubmitSearch = $derived(
		search.searchTerm.trim().length >= config.search.minLength && !!search.bounds
	);

	$effect(() => {
		search.setConfig(config.search);
	});

	$effect(() => {
		search.bounds = bounds;
	});

	$effect(() => {
		if (open) {
			tick().then(() => {
				inputElement?.focus({ preventScroll: true });
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
		search.reset();
	}

	function handleSearchSubmit(event: SubmitEvent) {
		event.preventDefault();
		selectedIndex = 0;
		locationError = '';
		search.searchWithDelay();
	}

	function selectResult(result: GeocoderResult) {
		flyTo.center = search.selectLocation(result);
		selectedLocation.center = flyTo.center;
		open = false;
	}

	function useUserLocation() {
		locationError = '';

		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			locationError = config.search.locationUnsupported;
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
					locationError = config.search.locationDenied;
				} else if (error.code === error.TIMEOUT) {
					locationError = config.search.locationTimeout;
				} else {
					locationError = config.search.locationUnavailable;
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
	data-tour="search"
	aria-label={config.search.modalLabel}
	class="flex h-8 cursor-pointer items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-brand-hover md:px-3"
>
	<SearchIcon class="h-4 w-4" />
	<span class="hidden sm:inline">{config.search.buttonLabel}</span>
</button>

{#if open}
	<Modal onClose={closeSearch} ariaLabel={config.search.modalLabel} onKeydown={handleKeydown}>
		<form
			class="flex items-center gap-3 border-b border-gray-200 px-4 py-3"
			onsubmit={handleSearchSubmit}
		>
			<SearchIcon class="h-5 w-5 flex-none text-brand-main" />
			<input
				bind:this={inputElement}
				bind:value={search.searchTerm}
				type="search"
				enterkeyhint="search"
				spellcheck="false"
				autocomplete="off"
				placeholder={config.search.placeholder}
				class="m-0 min-w-0 flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-gray-400"
				oninput={handleInput}
			/>
			<button
				type="submit"
				aria-label={config.search.submitLabel}
				title={config.search.submitLabel}
				disabled={!canSubmitSearch || search.loading}
				class="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-brand-main disabled:cursor-default disabled:opacity-45"
			>
				<CornerDownLeft class="h-5 w-5" />
			</button>
			<button
				type="button"
				aria-label={locating ? config.search.locating : config.search.useLocation}
				title={locating ? config.search.locating : config.search.useLocation}
				disabled={locating}
				class="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-brand-main disabled:cursor-wait disabled:opacity-70"
				onclick={useUserLocation}
			>
				<LocateFixed class="h-5 w-5 {locating ? 'animate-pulse text-brand-main' : ''}" />
			</button>
			<button
				type="button"
				aria-label={config.search.closeLabel}
				class="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
				onclick={closeSearch}
			>
				<X class="h-5 w-5" />
			</button>
		</form>

		{#if locationError}
			<p class="border-b border-gray-100 px-4 py-2 text-sm font-medium text-red-700" role="alert">
				{locationError}
			</p>
		{/if}

		{#if showSearchResults}
			<ul
				bind:this={listElement}
				transition:slide={{ duration: 140 }}
				class="max-h-[56dvh] overflow-y-auto overscroll-contain bg-white"
			>
				{#if search.results.length > 0}
					{#each search.results as result, index (`${result.place_id}-${result.lon}-${result.lat}`)}
						<li>
							<button
								type="button"
								class="flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition hover:bg-brand-soft {index ===
								selectedIndex
									? 'bg-brand-soft'
									: ''}"
								onmouseenter={() => (selectedIndex = index)}
								onclick={() => selectResult(result)}
							>
								<MapPin class="mt-0.5 h-4 w-4 flex-none text-brand-main" />
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
							{config.search.loading}
						{:else}
							{config.search.noResults}
						{/if}
					</li>
				{/if}
			</ul>
		{/if}

		<p class="border-t border-gray-100 px-4 py-2 text-xs font-light text-gray-500">
			{config.search.attribution.prefix}
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={config.search.attribution.providerUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="hover:text-brand-main">{config.search.attribution.provider}</a
			>
			· ©
			<a
				href={config.search.attribution.copyrightUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="hover:text-brand-main">{config.search.attribution.copyright}</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</p>
	</Modal>
{/if}

<style>
	input[type='search']::-webkit-search-cancel-button {
		-webkit-appearance: none;
		appearance: none;
	}
</style>
