<script lang="ts">
	import MapPane from '$lib/components/MapPane.svelte';
	import Header from '$lib/components/Header.svelte';
	import About from '$lib/components/About.svelte';
	import Share from '$lib/components/Share.svelte';
	import { onMount } from 'svelte';
	import data from '$lib/content/data';
	import { comparison, mapView, viewState } from '$lib/store.svelte';
	import type { MapKeyboardCommand, MapLocation } from '$lib/types';

	const DEFAULT_YEAR = 1897;
	const KEYBOARD_PAN_PIXELS = 100;
	const KEYBOARD_BEARING_STEP = 15;
	const defaultMap = mapForYear(DEFAULT_YEAR) ?? data[0];
	const defaultLocation = {
		center: [...mapView.center] as [number, number],
		zoom: mapView.zoom,
		bearing: mapView.bearing
	};

	let overOpen = $state(false);
	let shareOpen = $state(false);
	let currentLocation = $state<MapLocation>(defaultLocation);
	let compareStacked = $state(false);
	let panesReady = $state(false);
	let mapKeyboardCommand = $state<MapKeyboardCommand>();
	let keyboardCommandId = 0;
	let opacityShortcutSnapshot:
		| {
				left: number;
				right: number;
		  }
		| undefined;

	if (defaultMap) viewState.annotation = defaultMap.annotation;
	if (!comparison.rightAnnotation) comparison.rightAnnotation = data[1]?.annotation ?? '';
	let selectedYear = $state(defaultMap?.year ?? DEFAULT_YEAR);
	let rightSelectedYear = $state(
		yearForAnnotation(comparison.rightAnnotation) ?? data[1]?.year ?? DEFAULT_YEAR
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
		return data.find((map) => map.annotation === annotation)?.year;
	}

	function mapForYear(year: number) {
		return data.find((map) => map.year === year);
	}

	function mapForYearParam(value: string | null) {
		if (!value) return undefined;

		const mapForAnnotation = data.find((map) => map.annotation === value);
		if (mapForAnnotation) return mapForAnnotation;

		const numericYear = Number(value);
		return Number.isFinite(numericYear) ? mapForYear(numericYear) : undefined;
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
			zoom: numberParam(params, 'zoom') ?? mapView.zoom,
			bearing: numberParam(params, 'bearing') ?? mapView.bearing
		};
	}

	function applyInitialParams(params: URLSearchParams) {
		const initialMap = mapForYearParam(params.get('year')) ?? defaultMap;
		if (initialMap) {
			viewState.annotation = initialMap.annotation;
			selectedYear = initialMap.year;
		}

		currentLocation = locationFromParams(params) ?? defaultLocation;
	}

	function dispatchMapKeyboardCommand(command: Omit<MapKeyboardCommand, 'id'>) {
		mapKeyboardCommand = {
			id: ++keyboardCommandId,
			...command
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

		if (handleMapNavigationKeydown(event)) {
			event.preventDefault();
		}
	}

	function handleMapNavigationKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return false;

		if (event.shiftKey && event.key === 'ArrowLeft') {
			dispatchMapKeyboardCommand({ bearingDelta: -KEYBOARD_BEARING_STEP });
			return true;
		}

		if (event.shiftKey && event.key === 'ArrowRight') {
			dispatchMapKeyboardCommand({ bearingDelta: KEYBOARD_BEARING_STEP });
			return true;
		}

		if (event.key === '+' || event.key === '=' || event.code === 'Equal' || event.code === 'NumpadAdd') {
			dispatchMapKeyboardCommand({ zoomDelta: event.shiftKey ? 2 : 1 });
			return true;
		}

		if (
			event.key === '-' ||
			event.code === 'Minus' ||
			event.code === 'NumpadSubtract'
		) {
			dispatchMapKeyboardCommand({ zoomDelta: event.shiftKey ? -2 : -1 });
			return true;
		}

		if (event.shiftKey) return false;

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
	onkeydown={handleGlobalKeydown}
	onkeyup={handleGlobalKeyup}
	onblur={restoreOpacityShortcut}
/>

<div class="flex h-screen flex-col">
	<Header onOverOpen={() => (overOpen = true)} onShareOpen={() => (shareOpen = true)} />

	<div
		class="flex flex-1 {comparison.active
			? 'flex-col overflow-y-auto md:flex-row md:overflow-hidden'
			: 'overflow-hidden'}"
	>
		{#if panesReady}
			<MapPane
				navPosition={leftNavPosition}
				paneSide="left"
				layersId="map-layers-left"
				bordered={comparison.active}
				bind:annotation={viewState.annotation}
				bind:opacity={viewState.opacity}
				bind:selectedYear
				bind:currentLocation
				{mapKeyboardCommand}
				syncUrl
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
					bind:annotation={comparison.rightAnnotation}
					bind:opacity={comparison.rightOpacity}
					bind:selectedYear={rightSelectedYear}
					bind:currentLocation
					{mapKeyboardCommand}
					showLayersPaneIndicator
				/>
			{/if}
		{/if}
	</div>

	{#if overOpen}
		<About onClose={() => (overOpen = false)} />
	{/if}

	{#if shareOpen}
		<Share onClose={() => (shareOpen = false)} />
	{/if}
</div>
