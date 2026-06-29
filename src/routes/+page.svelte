<script lang="ts">
	import MapPane from '$lib/components/MapPane.svelte';
	import Header from '$lib/components/Header.svelte';
	import Welcome from '$lib/components/Welcome.svelte';
	import About from '$lib/components/About.svelte';
	import Share from '$lib/components/Share.svelte';
	import { onMount, untrack } from 'svelte';
	import { comparison, mapView, viewState } from '$lib/app-state.svelte.js';
	import { getMapStartYear, mapIncludesYear } from '$lib/map-years';
	import { LoaderCircle } from '@lucide/svelte';
	import type { PageData } from './$types';
	import type {
		GeocoderBounds,
		MapKeyboardCommand,
		MapLocation,
		MapToolbarCommand
	} from '$lib/types';

	let {
		data: pageData
	}: {
		data: PageData;
	} = $props();

	let config = $derived(pageData.config);
	let collection = $derived(pageData.collection);
	let DEFAULT_YEAR = $derived(config.map.defaultYear);
	let KEYBOARD_PAN_PIXELS = $derived(config.map.keyboard.panPixels);
	let defaultMap = $derived(mapForYear(DEFAULT_YEAR) ?? collection[0]);
	const initial = untrack(() => {
		const defaultYear = pageData.config.map.defaultYear;
		const initialMap =
			pageData.collection.find((map) => mapIncludesYear(map, defaultYear)) ??
			pageData.collection[0];
		const rightMap = pageData.collection[1];
		const defaultLocation = {
			center: [...pageData.config.map.initialView.center] as [number, number],
			zoom: pageData.config.map.initialView.zoom,
			bearing: pageData.config.map.initialView.bearing
		};

		return {
			defaultYear,
			defaultLocation,
			initialMap,
			selectedYear:
				initialMap && mapIncludesYear(initialMap, defaultYear)
					? defaultYear
					: initialMap
						? getMapStartYear(initialMap)
						: defaultYear,
			rightAnnotation: rightMap?.annotation ?? '',
			rightYear: rightMap ? getMapStartYear(rightMap) : defaultYear
		};
	});

	let aboutOpen = $state(false);
	let shareOpen = $state(false);
	let currentLocation = $state<MapLocation>(initial.defaultLocation);
	let geocoderBounds = $state<GeocoderBounds>();
	let compareStacked = $state(false);
	let panesReady = $state(false);
	let mapKeyboardCommand = $state<MapKeyboardCommand>();
	let mapToolbarCommand = $state<MapToolbarCommand>();
	let keyboardCommandId = 0;
	let toolbarCommandId = 0;
	let opacityShortcutSnapshot:
		| {
				left: number;
				right: number;
		  }
		| undefined;

	if (initial.initialMap) viewState.annotation = initial.initialMap.annotation;
	if (!comparison.rightAnnotation) comparison.rightAnnotation = initial.rightAnnotation;
	let selectedYear = $state(initial.selectedYear);
	let rightSelectedYear = $state(
		yearForAnnotation(comparison.rightAnnotation) ?? initial.rightYear
	);
	let leftNavPosition: 'left' | 'right' = $derived(
		comparison.active && compareStacked ? 'right' : 'left'
	);

	$effect(() => {
		mapView.center = currentLocation.center;
		mapView.zoom = currentLocation.zoom;
		mapView.bearing = currentLocation.bearing;
	});

	function yearForAnnotation(annotation: string) {
		const map = collection.find((map) => map.annotation === annotation);
		return map ? getMapStartYear(map) : undefined;
	}

	function mapForYear(year: number) {
		return collection.find((map) => mapIncludesYear(map, year));
	}

	function mapForAnnotationParam(value: string | null) {
		if (!value) return undefined;

		return collection.find((map) => map.annotation === value);
	}

	function yearFromParam(value: string | null) {
		if (!value) return undefined;
		const numericYear = Number(value);

		return Number.isInteger(numericYear) ? numericYear : undefined;
	}

	function numberParam(params: URLSearchParams, key: string) {
		const value = params.get(key);
		if (value === null) return undefined;

		const number = Number(value);
		return Number.isFinite(number) ? number : undefined;
	}

	function locationFromParams(params: URLSearchParams): MapLocation | undefined {
		const lat = numberParam(params, 'lat');
		const lng = numberParam(params, 'lng');
		if (lat === undefined || lng === undefined) return undefined;

		return {
			center: [lng, lat],
			zoom: numberParam(params, 'zoom') ?? config.map.initialView.zoom,
			bearing: numberParam(params, 'bearing') ?? config.map.initialView.bearing
		};
	}

	function applyInitialParams(params: URLSearchParams) {
		const yearParam = yearFromParam(params.get('year'));
		const initialMap = params.has('map')
			? (mapForAnnotationParam(params.get('map')) ?? defaultMap)
			: (yearParam !== undefined ? mapForYear(yearParam) : undefined) ?? defaultMap;
		if (initialMap) {
			viewState.annotation = initialMap.annotation;
			selectedYear =
				yearParam !== undefined && !params.has('map') && mapIncludesYear(initialMap, yearParam)
					? yearParam
					: getMapStartYear(initialMap);
		}

		currentLocation = locationFromParams(params) ?? initial.defaultLocation;
	}

	function dispatchMapKeyboardCommand(command: Omit<MapKeyboardCommand, 'id'>) {
		mapKeyboardCommand = {
			id: ++keyboardCommandId,
			...command
		};
	}

	function dispatchMapToolbarCommand(action: MapToolbarCommand['action']) {
		mapToolbarCommand = {
			id: ++toolbarCommandId,
			action
		};
	}

	function hasOpenModal() {
		return !!document.querySelector('[role="dialog"][aria-modal="true"]');
	}

	function isInteractiveTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;

		const tagName = target.tagName.toLowerCase();
		return (
			tagName === 'input' ||
			tagName === 'textarea' ||
			tagName === 'select' ||
			tagName === 'button' ||
			tagName === 'a' ||
			target.isContentEditable
		);
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (hasOpenModal() || isInteractiveTarget(event.target)) return;

		if (event.code === 'Space') {
			if (event.repeat) return;

			event.preventDefault();
			opacityShortcutSnapshot = {
				left: viewState.opacity,
				right: comparison.rightOpacity
			};
			viewState.opacity = 0;
			comparison.rightOpacity = 0;
			return;
		}

		if (handleMapToolbarKeydown(event) || handleMapNavigationKeydown(event)) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}

	function handleGlobalKeydownCapture(event: KeyboardEvent) {
		if (hasOpenModal() || isInteractiveTarget(event.target)) return;
		if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
		if (!isArrowKey(event.key)) return;

		if (handleMapNavigationKeydown(event)) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}

	function handleMapToolbarKeydown(event: KeyboardEvent) {
		if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
			return false;
		}

		const key = event.key.toLowerCase();

		if (key === 'f') {
			dispatchMapToolbarCommand('toggle-in-view');
			return true;
		}

		if (key === 'r') {
			dispatchMapToolbarCommand('toggle-rotation');
			return true;
		}

		if (key === 'z') {
			dispatchMapToolbarCommand('toggle-focus');
			return true;
		}

		return false;
	}

	function isArrowKey(key: string) {
		return (
			key === 'ArrowLeft' ||
			key === 'ArrowRight' ||
			key === 'ArrowUp' ||
			key === 'ArrowDown'
		);
	}

	function handleMapNavigationKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return false;

		if (
			event.key === '+' ||
			event.key === '=' ||
			event.code === 'Equal' ||
			event.code === 'NumpadAdd'
		) {
			dispatchMapKeyboardCommand({ zoomDelta: event.shiftKey ? 2 : 1 });
			return true;
		}

		if (event.key === '-' || event.code === 'Minus' || event.code === 'NumpadSubtract') {
			dispatchMapKeyboardCommand({ zoomDelta: event.shiftKey ? -2 : -1 });
			return true;
		}

		if (!event.shiftKey) return false;

		if (event.key === 'ArrowLeft') {
			dispatchMapKeyboardCommand({ offset: [KEYBOARD_PAN_PIXELS, 0] });
			return true;
		}

		if (event.key === 'ArrowRight') {
			dispatchMapKeyboardCommand({ offset: [-KEYBOARD_PAN_PIXELS, 0] });
			return true;
		}

		if (event.key === 'ArrowUp') {
			dispatchMapKeyboardCommand({ offset: [0, KEYBOARD_PAN_PIXELS] });
			return true;
		}

		if (event.key === 'ArrowDown') {
			dispatchMapKeyboardCommand({ offset: [0, -KEYBOARD_PAN_PIXELS] });
			return true;
		}

		return false;
	}

	function restoreOpacityShortcut() {
		if (!opacityShortcutSnapshot) return;

		viewState.opacity = opacityShortcutSnapshot.left;
		comparison.rightOpacity = opacityShortcutSnapshot.right;
		opacityShortcutSnapshot = undefined;
	}

	function handleGlobalKeyup(event: KeyboardEvent) {
		if (event.code !== 'Space' || !opacityShortcutSnapshot) return;

		event.preventDefault();
		restoreOpacityShortcut();
	}

	onMount(() => {
		const compareStackQuery = window.matchMedia('(max-width: 767px)');

		function syncCompareStacked(event: MediaQueryList | MediaQueryListEvent) {
			compareStacked = event.matches;
		}

		syncCompareStacked(compareStackQuery);
		applyInitialParams(new URLSearchParams(window.location.search));
		panesReady = true;
		compareStackQuery.addEventListener('change', syncCompareStacked);

		return () => {
			compareStackQuery.removeEventListener('change', syncCompareStacked);
		};
	});
</script>

<svelte:window
	onkeydowncapture={handleGlobalKeydownCapture}
	onkeydown={handleGlobalKeydown}
	onkeyup={handleGlobalKeyup}
	onblur={restoreOpacityShortcut}
/>

<div class="flex h-[100dvh] flex-col">
	<Welcome {config} />

	<Header
		{config}
		searchBounds={geocoderBounds}
		onAboutOpen={() => (aboutOpen = true)}
		onShareOpen={() => (shareOpen = true)}
	/>

	<div
		class="flex flex-1 bg-white {comparison.active
			? 'flex-col overflow-y-auto md:flex-row md:overflow-hidden'
			: 'overflow-hidden'}"
	>
		{#if panesReady}
			<MapPane
				navPosition={leftNavPosition}
				paneSide="left"
				layersId="map-layers-left"
				bordered={comparison.active}
				maps={collection}
				{config}
				bind:annotation={viewState.annotation}
				bind:opacity={viewState.opacity}
				bind:selectedYear
				bind:currentLocation
				bind:geocoderBounds
				{mapKeyboardCommand}
				{mapToolbarCommand}
				enableFlyTo
				enableLocationMarker
				enableLayersShortcut
				showLayersPaneIndicator={comparison.active}
			/>

			{#if comparison.active}
				<MapPane
					navPosition="right"
					paneSide="right"
					layersId="map-layers-right"
					maps={collection}
					{config}
					bind:annotation={comparison.rightAnnotation}
					bind:opacity={comparison.rightOpacity}
					bind:selectedYear={rightSelectedYear}
					bind:currentLocation
					{mapKeyboardCommand}
					showLayersPaneIndicator
				/>
			{/if}
		{:else}
			<div class="grid min-h-0 flex-1 place-items-center">
				<div role="status" aria-label="Loading map">
					<LoaderCircle class="h-8 w-8 animate-spin text-brand-main" />
				</div>
			</div>
		{/if}
	</div>

	{#if aboutOpen}
		<About {config} maps={collection} onClose={() => (aboutOpen = false)} />
	{/if}

	{#if shareOpen}
		<Share {config} onClose={() => (shareOpen = false)} />
	{/if}
</div>
