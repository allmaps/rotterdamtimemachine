<script lang="ts">
	import {
		addStoredLocation,
		clearStoredLocations,
		flyTo,
		liveUserLocation,
		liveUserLocationTracking,
		removeStoredLocation,
		storedLocations
	} from '$lib/app-state.svelte.js';
	import { GeocoderService, type GeocoderResult } from '$lib/services/geocoder.svelte.js';
	import {
		liveLocationError,
		releaseLiveUserLocationFollow,
		resumeLiveUserLocationFollow,
		stopLiveUserLocationTracking
	} from '$lib/services/live-location.svelte.js';
	import Modal from '$lib/components/Modal.svelte';
	import SearchLocationButton from '$lib/components/SearchLocationButton.svelte';
	import {
		CornerDownLeft,
		LocateFixed,
		MapPin,
		Search as SearchIcon,
		Trash2,
		X
	} from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import type { AppConfig, GeocoderBounds } from '$lib/types';

	let {
		bounds,
		config,
		open = $bindable(false)
	}: {
		bounds?: GeocoderBounds;
		config: AppConfig;
		open?: boolean;
	} = $props();

	const search = untrack(() => new GeocoderService(config.search));

	let selectedIndex = $state(0);
	let inputElement: HTMLInputElement | undefined = $state();
	let listElement: HTMLUListElement | undefined = $state();
	let showSearchResults = $derived(
		search.searchTerm.trim() !== '' &&
			(search.loading || search.hasSearched || !!search.error || search.results.length > 0)
	);
	let visibleLocations = $derived([
		...(liveUserLocation.current
			? [
					{
						id: liveUserLocation.current.id,
						label: config.search.userLocationLabel,
						center: liveUserLocation.current.center,
						source: 'user' as const
					}
				]
			: []),
		...storedLocations.map((location) => ({
			id: location.id,
			label: location.label,
			center: location.center,
			source: 'search' as const
		}))
	]);
	let showVisibleLocations = $derived(!showSearchResults && visibleLocations.length > 0);
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
			liveLocationError.message = '';
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
		liveLocationError.message = '';
		search.reset();
	}

	function handleSearchSubmit(event: SubmitEvent) {
		event.preventDefault();
		selectedIndex = 0;
		liveLocationError.message = '';
		search.searchWithDelay();
	}

	function selectResult(result: GeocoderResult) {
		const center = search.selectLocation(result);
		releaseLiveUserLocationFollow();
		flyTo.center = center;
		addStoredLocation({
			id: getResultLocationId(result),
			label: getResultLabel(result),
			center,
			source: 'search'
		});
		open = false;
	}

	function getResultLabel(result: GeocoderResult) {
		return result.name?.trim() || getCompactDisplayName(result.display_name);
	}

	function getCompactDisplayName(displayName: string) {
		const parts = displayName
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean);
		if (parts.length === 0) return displayName;

		const [firstPart, secondPart] = parts;
		if (secondPart && looksLikeHouseNumber(firstPart)) {
			return `${secondPart} ${formatHouseNumber(firstPart)}`;
		}

		return firstPart;
	}

	function looksLikeHouseNumber(value: string) {
		return /^\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?$/.test(value);
	}

	function formatHouseNumber(value: string) {
		return value.replace(/\s+/g, '').replace(/([-/])/g, '$1');
	}

	function getResultLocationId(result: GeocoderResult) {
		return `search:${result.place_id}:${result.lon}:${result.lat}`;
	}

	function handleLiveLocationLocated() {
		open = false;
	}

	function selectVisibleLocation(location: (typeof visibleLocations)[number]) {
		if (location.source === 'user') {
			if (liveUserLocationTracking.status === 'active') {
				flyTo.center = location.center;
			} else {
				resumeLiveUserLocationFollow();
			}
		} else {
			releaseLiveUserLocationFollow();
			flyTo.center = location.center;
		}

		open = false;
	}

	function removeVisibleLocation(location: (typeof visibleLocations)[number]) {
		if (location.source === 'user') {
			stopLiveUserLocationTracking();
			return;
		}

		removeStoredLocation(location.id);
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
	class="flex h-8 cursor-pointer items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-brand-hover lg:px-3"
>
	<SearchIcon class="h-4 w-4" />
	<span class="hidden lg:inline">{config.search.buttonLabel}</span>
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
			<SearchLocationButton config={config.search} onLocated={handleLiveLocationLocated} />
			<button
				type="button"
				aria-label={config.search.clearLocations}
				title={config.search.clearLocations}
				disabled={storedLocations.length === 0}
				class="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-brand-main disabled:cursor-default disabled:opacity-35"
				onclick={clearStoredLocations}
			>
				<Trash2 class="h-5 w-5" />
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

		{#if liveLocationError.message}
			<p class="border-b border-gray-100 px-4 py-2 text-sm font-medium text-red-700" role="alert">
				{liveLocationError.message}
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
		{:else if showVisibleLocations}
			<ul
				transition:slide={{ duration: 140 }}
				class="max-h-[56dvh] overflow-y-auto overscroll-contain bg-white"
			>
				{#each visibleLocations as location (location.id)}
					<li class="flex items-stretch border-b border-gray-100">
						<button
							type="button"
							class="flex min-w-0 flex-1 cursor-pointer items-start gap-3 px-4 py-3 text-left transition hover:bg-brand-soft"
							onclick={() => selectVisibleLocation(location)}
						>
							{#if location.source === 'user'}
								<LocateFixed class="mt-0.5 h-4 w-4 flex-none text-brand-main" />
							{:else}
								<MapPin class="mt-0.5 h-4 w-4 flex-none text-brand-main" />
							{/if}
							<span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
								{location.label}
							</span>
						</button>
						<button
							type="button"
							aria-label={config.search.removeLocation}
							title={config.search.removeLocation}
							class="flex w-11 flex-none cursor-pointer items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-gray-800"
							onclick={() => removeVisibleLocation(location)}
						>
							<X class="h-4 w-4" />
						</button>
					</li>
				{/each}
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
