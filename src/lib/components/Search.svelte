<script lang="ts">
	import {
		addStoredLocation,
		clearStoredLocations,
		flyTo,
		hasDisplayableStoredLocationGeometry,
		liveUserLocation,
		liveUserLocationTracking,
		removeStoredLocation,
		setActiveLocation,
		setStoredLocationDisplayMode,
		setStoredLocationGeometry,
		setStoredLocationLabel,
		storedLocations,
		toggleStoredLocationVisibility
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
		Check,
		CornerDownLeft,
		Eye,
		EyeOff,
		LocateFixed,
		MapPin,
		Pencil,
		Search as SearchIcon,
		Shapes,
		Trash2,
		X
	} from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import type { AppConfig, GeocoderBounds } from '$lib/types';

	type GeometryStatus = {
		type: 'loading' | 'error';
		message: string;
	};

	let {
		bounds,
		config,
		open = $bindable(false)
	}: {
		bounds?: GeocoderBounds;
		config: AppConfig;
		open?: boolean;
	} = $props();

	const search = untrack(() => new GeocoderService(config.search, config.site));

	let selectedIndex = $state(0);
	let inputElement: HTMLInputElement | undefined = $state();
	let editingLocationInputElement: HTMLInputElement | undefined = $state();
	let listElement: HTMLUListElement | undefined = $state();
	let editingLocationId = $state<string | null>(null);
	let editingLocationLabel = $state('');
	let geometryStatusByLocationId = $state<Record<string, GeometryStatus>>({});
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Timer handles are side effects, not UI state.
	const geometryStatusTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
			osmId: location.osmId,
			displayMode: location.displayMode,
			hasGeometry: hasDisplayableStoredLocationGeometry(location.geometry),
			canUseGeometry:
				hasDisplayableStoredLocationGeometry(location.geometry) ||
				canLoadDisplayableOsmGeometry(location.osmId),
			geometryStatus: geometryStatusByLocationId[location.id],
			geometryLoading: geometryStatusByLocationId[location.id]?.type === 'loading',
			geometryMessage: geometryStatusByLocationId[location.id]?.message,
			visible: location.visible,
			source: 'search' as const
		}))
	]);
	let showVisibleLocations = $derived(!showSearchResults && visibleLocations.length > 0);
	let canSubmitSearch = $derived(
		search.searchTerm.trim().length >= config.search.minLength && !!search.bounds
	);

	$effect(() => {
		search.setConfig(config.search, config.site);
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
			cancelEditingVisibleLocation();
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
		const id = getResultLocationId(result);
		const osmId = search.getOsmId(result);
		const geometry = hasDisplayableStoredLocationGeometry(result.geojson)
			? result.geojson
			: undefined;
		const defaultDisplayMode = getDefaultDisplayMode(result, geometry);
		releaseLiveUserLocationFollow();
		flyTo.center = center;
		addStoredLocation({
			id,
			label: getResultLabel(result),
			center,
			osmId,
			geometry,
			displayMode: defaultDisplayMode,
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

	function getDefaultDisplayMode(result: GeocoderResult, geometry: GeoJSON.Geometry | undefined) {
		return isOverpassResult(result) && hasDisplayableStoredLocationGeometry(geometry)
			? 'geometry'
			: 'point';
	}

	function isOverpassResult(result: GeocoderResult) {
		return typeof result.place_id === 'string' && result.place_id.startsWith('overpass:');
	}

	function canLoadDisplayableOsmGeometry(osmId: string | undefined) {
		return !!osmId && /^[WR]\d+$/.test(osmId);
	}

	function handleLiveLocationLocated() {
		open = false;
	}

	function selectVisibleLocation(location: (typeof visibleLocations)[number]) {
		setActiveLocation(location.id, location.center);

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

	async function toggleVisibleLocationDisplayMode(location: (typeof visibleLocations)[number]) {
		if (location.source !== 'search' || !location.canUseGeometry || location.geometryLoading)
			return;

		if (!location.hasGeometry && location.osmId) {
			setGeometryStatus(location.id, 'loading', config.search.fetchingGeometry);

			try {
				const geometry = await search.lookupGeometryByOsmId(location.osmId);
				if (hasDisplayableStoredLocationGeometry(geometry)) {
					setStoredLocationGeometry(location.id, geometry, 'geometry');
					clearGeometryStatus(location.id);
				} else {
					showTransientGeometryStatus(location.id, config.search.geometryUnavailable);
				}
			} catch (error) {
				console.warn('Could not fetch full geometry:', error);
				showTransientGeometryStatus(location.id, config.search.geometryUnavailable);
			}

			return;
		}

		setStoredLocationDisplayMode(
			location.id,
			location.displayMode === 'geometry' ? 'point' : 'geometry'
		);
	}

	function setGeometryStatus(id: string, type: GeometryStatus['type'], message: string) {
		clearGeometryStatusTimer(id);
		geometryStatusByLocationId = {
			...geometryStatusByLocationId,
			[id]: { type, message }
		};
	}

	function showTransientGeometryStatus(id: string, message: string) {
		setGeometryStatus(id, 'error', message);
		geometryStatusTimers.set(
			id,
			setTimeout(() => {
				clearGeometryStatus(id);
			}, 2800)
		);
	}

	function clearGeometryStatus(id: string) {
		clearGeometryStatusTimer(id);

		const nextStatuses = { ...geometryStatusByLocationId };
		delete nextStatuses[id];
		geometryStatusByLocationId = nextStatuses;
	}

	function clearGeometryStatusTimer(id: string) {
		const timer = geometryStatusTimers.get(id);
		if (timer) clearTimeout(timer);
		geometryStatusTimers.delete(id);
	}

	function toggleVisibleLocationVisibility(location: (typeof visibleLocations)[number]) {
		if (location.source === 'search') {
			toggleStoredLocationVisibility(location.id);
		}
	}

	function startEditingVisibleLocation(location: (typeof visibleLocations)[number]) {
		if (location.source !== 'search') return;

		editingLocationId = location.id;
		editingLocationLabel = location.label;
		tick().then(() => {
			editingLocationInputElement?.focus({ preventScroll: true });
			editingLocationInputElement?.select();
		});
	}

	function saveEditingVisibleLocation() {
		if (!editingLocationId) return;

		const label = editingLocationLabel.trim();
		if (label) {
			setStoredLocationLabel(editingLocationId, label);
		}

		cancelEditingVisibleLocation();
	}

	function cancelEditingVisibleLocation() {
		editingLocationId = null;
		editingLocationLabel = '';
		editingLocationInputElement = undefined;
	}

	function handleEditingLocationKeydown(event: KeyboardEvent) {
		event.stopPropagation();

		if (event.key === 'Enter') {
			event.preventDefault();
			saveEditingVisibleLocation();
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			cancelEditingVisibleLocation();
		}
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
								<span class="min-w-0 flex-1 truncate pl-1 text-sm font-medium text-gray-800">
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
					<li
						class="flex items-stretch border-b border-gray-100 {location.source === 'search' &&
						location.geometryStatus?.type === 'loading'
							? 'geometry-row-loading'
							: ''}"
					>
						{#if location.source === 'search' && location.canUseGeometry}
							<button
								type="button"
								aria-label={location.geometryLoading
									? config.search.fetchingGeometry
									: location.displayMode === 'geometry'
										? config.search.usePoint
										: config.search.useGeometry}
								title={location.geometryLoading
									? config.search.fetchingGeometry
									: location.displayMode === 'geometry'
										? config.search.usePoint
										: config.search.useGeometry}
								aria-pressed={location.displayMode === 'geometry'}
								disabled={location.geometryLoading}
								class="flex w-11 flex-none cursor-pointer items-center justify-center text-brand-main transition hover:bg-gray-100 disabled:cursor-default disabled:opacity-60"
								onclick={() => toggleVisibleLocationDisplayMode(location)}
							>
								{#if location.displayMode === 'geometry'}
									<Shapes class="h-4 w-4" />
								{:else}
									<MapPin class="h-4 w-4 {location.geometryLoading ? 'animate-pulse' : ''}" />
								{/if}
							</button>
						{/if}
						{#if location.source === 'search' && editingLocationId === location.id}
							<div class="flex min-w-0 flex-1 items-center {location.visible ? '' : 'opacity-55'}">
								{#if !location.canUseGeometry}
									<span class="flex w-11 flex-none items-center justify-center">
										<MapPin class="h-4 w-4 text-brand-main" />
									</span>
								{/if}
								<div class="min-w-0 flex-1 py-3 pr-4 pl-3">
									<input
										bind:this={editingLocationInputElement}
										bind:value={editingLocationLabel}
										type="text"
										aria-label={config.search.editLocation}
										class="w-full min-w-0 rounded-sm border border-brand-main/40 bg-white px-2 py-1 text-sm font-medium text-gray-800 outline-none focus:border-brand-main focus:ring-2 focus:ring-brand-main/20"
										onkeydown={handleEditingLocationKeydown}
										onblur={saveEditingVisibleLocation}
									/>
								</div>
							</div>
						{:else}
							<button
								type="button"
								class="flex min-w-0 flex-1 cursor-pointer items-stretch text-left transition hover:bg-brand-soft {location.source ===
									'search' && !location.visible
									? 'opacity-55'
									: ''}"
								onclick={() => selectVisibleLocation(location)}
							>
								{#if !('canUseGeometry' in location) || !location.canUseGeometry}
									<span class="flex w-11 flex-none items-start justify-center pt-3">
										{#if location.source === 'user'}
											<LocateFixed class="h-4 w-4 text-brand-main" />
										{:else}
											<MapPin class="h-4 w-4 text-brand-main" />
										{/if}
									</span>
								{/if}
								<span
									class="min-w-0 flex-1 truncate py-3 pr-4 pl-3 text-sm font-medium {location.source ===
										'search' && location.geometryStatus?.type === 'error'
										? 'text-red-700'
										: location.source === 'search' && location.geometryStatus?.type === 'loading'
											? 'text-brand-main'
											: 'text-gray-800'}"
								>
									{location.source === 'search' && location.geometryMessage
										? location.geometryMessage
										: location.label}
								</span>
							</button>
						{/if}
						{#if location.source === 'search'}
							<button
								type="button"
								aria-label={location.visible
									? config.search.hideLocation
									: config.search.showLocation}
								title={location.visible ? config.search.hideLocation : config.search.showLocation}
								aria-pressed={location.visible}
								class="flex w-11 flex-none cursor-pointer items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-brand-main"
								onclick={() => toggleVisibleLocationVisibility(location)}
							>
								{#if location.visible}
									<Eye class="h-4 w-4" />
								{:else}
									<EyeOff class="h-4 w-4" />
								{/if}
							</button>
							{#if editingLocationId === location.id}
								<button
									type="button"
									aria-label={config.search.saveLocation}
									title={config.search.saveLocation}
									class="flex w-11 flex-none cursor-pointer items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-brand-main"
									onclick={saveEditingVisibleLocation}
								>
									<Check class="h-4 w-4" />
								</button>
							{:else}
								<button
									type="button"
									aria-label={config.search.editLocation}
									title={config.search.editLocation}
									class="flex w-11 flex-none cursor-pointer items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-brand-main"
									onclick={() => startEditingVisibleLocation(location)}
								>
									<Pencil class="h-4 w-4" />
								</button>
							{/if}
						{/if}
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

	.geometry-row-loading {
		background-color: color-mix(in srgb, var(--color-brand-main) 4%, white);
		background-image: linear-gradient(
			105deg,
			transparent 0%,
			color-mix(in srgb, var(--color-brand-main) 5%, transparent) 22%,
			color-mix(in srgb, var(--color-brand-main) 12%, transparent) 42%,
			color-mix(in srgb, var(--color-brand-main) 18%, transparent) 50%,
			color-mix(in srgb, var(--color-brand-main) 12%, transparent) 58%,
			color-mix(in srgb, var(--color-brand-main) 5%, transparent) 78%,
			transparent 100%
		);
		background-size: 220% 100%;
		animation: geometry-row-loading 4.2s ease-in-out infinite alternate;
	}

	@keyframes geometry-row-loading {
		from {
			background-position: 115% 0;
		}

		to {
			background-position: -15% 0;
		}
	}
</style>
