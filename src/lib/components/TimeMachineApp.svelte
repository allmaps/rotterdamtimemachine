<script lang="ts">
	import MapPane from '$lib/components/MapPane.svelte';
	import Header from '$lib/components/Header.svelte';
	import AppTour from '$lib/components/AppTour.svelte';
	import About from '$lib/components/About.svelte';
	import Share from '$lib/components/Share.svelte';
	import { onMount, tick, untrack } from 'svelte';
	import {
		comparison,
		configureStoredLocationsStorage,
		mapView,
		viewState
	} from '$lib/app-state.svelte.js';
	import { getMapStartYear, mapIncludesYear } from '$lib/map-years';
	import { annotationById, loadWarpedMapData } from '$lib/warped-map-list';
	import { LoaderCircle } from '@lucide/svelte';
	import type {
		AppConfig,
		GeocoderBounds,
		MapKeyboardCommand,
		MapLocation,
		MapMetadata,
		MapToolbarCommand
	} from '$lib/types';

	type AutoplayItem = {
		annotation: string;
		year: number;
		order: number;
	};
	type PresentationTouch = {
		x: number;
		y: number;
		time: number;
	};

	const PRESENTATION_SWIPE_THRESHOLD = 48;
	const PRESENTATION_SWIPE_MAX_DURATION_MS = 900;
	const PRESENTATION_SWIPE_AXIS_RATIO = 1.25;

	let {
		config,
		collection,
		startInPresentation = false
	}: {
		config: AppConfig;
		collection: MapMetadata[];
		startInPresentation?: boolean;
	} = $props();

	const startsInPresentation = untrack(() => startInPresentation);

	if (startsInPresentation) {
		comparison.active = false;
	}

	let DEFAULT_YEAR = $derived(config.map.defaultYear);
	let KEYBOARD_PAN_PIXELS = $derived(config.map.keyboard.panPixels);
	let defaultMap = $derived(mapForYear(DEFAULT_YEAR) ?? collection[0]);
	const initial = untrack(() => {
		const defaultYear = config.map.defaultYear;
		const initialMap = collection.find((map) => mapIncludesYear(map, defaultYear)) ?? collection[0];
		const rightMap = collection[1];
		const defaultLocation = {
			center: [...config.map.initialView.center] as [number, number],
			zoom: config.map.initialView.zoom,
			bearing: config.map.initialView.bearing
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
	let panesError = $state<string>();
	let mapKeyboardCommand = $state<MapKeyboardCommand>();
	let mapToolbarCommand = $state<MapToolbarCommand>();
	let autoplayActive = $state(startsInPresentation);
	let autoplayPlaying = $state(startsInPresentation);
	let autoplayFollowMap = $state(false);
	let autoplayRepairSelection = $state(false);
	let autoplayRemainingMs = $state(0);
	let autoplayTimerCycle = $state(0);
	let autoplayTimerStartedAt = 0;
	let autoplayTimeout: ReturnType<typeof setTimeout> | undefined;
	let leftAnnotationsInView = $state<string[]>([]);
	let leftAnnotationsAtCenter = $state<string[]>([]);
	let appShellElement = $state<HTMLDivElement>();
	let presentationTouch: PresentationTouch | undefined;
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
	let autoplayInterval = $derived(config.autoplay?.intervalSeconds);
	let autoplayIntervalMs = $derived(Math.max(0, (autoplayInterval ?? 0) * 1000));
	let autoplayViewportMaps = $derived(getMapsInView(collection, leftAnnotationsAtCenter));
	let autoplaySourceMaps = $derived(autoplayFollowMap ? collection : autoplayViewportMaps);
	let autoplayItems = $derived(getAutoplayItems(autoplaySourceMaps));
	let allAutoplayItems = $derived(getAutoplayItems(collection));
	let autoplayCurrentIndex = $derived(getAutoplayCurrentIndex());
	let autoplayCurrentPosition = $derived(autoplayCurrentIndex >= 0 ? autoplayCurrentIndex + 1 : 0);
	let autoplayTotal = $derived(autoplayItems.length);
	let autoplayNextAnnotation = $derived(
		autoplayActive && autoplayTotal > 1 ? getRelativeAutoplayItem(1)?.annotation : undefined
	);
	let autoplayDisabled = $derived(
		comparison.active ||
			!panesReady ||
			!autoplayIntervalMs ||
			autoplayIntervalMs <= 0 ||
			allAutoplayItems.length === 0
	);

	$effect(() => {
		mapView.center = currentLocation.center;
		mapView.zoom = currentLocation.zoom;
		mapView.bearing = currentLocation.bearing;
	});

	$effect(() => {
		configureStoredLocationsStorage(config.site.url || config.site.name);
	});

	$effect(() => {
		if (comparison.active && autoplayActive) {
			stopAutoplay();
		}
	});

	$effect(() => {
		if (!autoplayActive || !autoplayPlaying || autoplayIntervalMs <= 0 || autoplayTotal === 0) {
			clearAutoplayTimer();
			return;
		}

		const timerCycle = autoplayTimerCycle;
		const remainingMs = getAutoplayTimerDuration();
		autoplayTimerStartedAt = performance.now();
		autoplayTimeout = setTimeout(() => {
			if (timerCycle !== autoplayTimerCycle) return;

			clearAutoplayTimer();
			advanceAutoplay();
		}, remainingMs);

		return clearAutoplayTimer;
	});

	$effect(() => {
		if (!autoplayActive || autoplayTotal === 0) return;
		if (autoplayCurrentIndex >= 0) {
			setAutoplayRepairSelection(false);
			return;
		}
		if (!autoplayRepairSelection) return;

		ensureAutoplaySelection();
		setAutoplayRepairSelection(false);
	});

	function yearForAnnotation(annotation: string) {
		const map = collection.find((map) => map.annotation === annotation);
		return map ? getMapStartYear(map) : undefined;
	}

	function syncSelectedYearToAnnotation(annotation: string) {
		const map = collection.find((map) => map.annotation === annotation);
		if (!map) return;

		selectedYear = mapIncludesYear(map, selectedYear) ? selectedYear : getMapStartYear(map);
	}

	function mapForYear(year: number) {
		return collection.find((map) => mapIncludesYear(map, year));
	}

	function getAutoplayItems(maps: MapMetadata[]): AutoplayItem[] {
		return maps
			.map((map, order) => ({
				annotation: map.annotation,
				year: getMapStartYear(map),
				order
			}))
			.sort((left, right) => left.year - right.year || left.order - right.order);
	}

	function getMapsInView(maps: MapMetadata[], annotationsInView: string[]) {
		const annotationsInViewSet = new Set(annotationsInView);
		if (annotationsInViewSet.size === 0) return [];

		return maps.filter((map) => annotationsInViewSet.has(map.annotation));
	}

	function mapForAnnotationParam(value: string | null) {
		if (!value) return undefined;

		const annotation = annotationById.get(value);
		if (!annotation) return undefined;

		return collection.find((map) => map.annotation === annotation);
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
			: ((yearParam !== undefined ? mapForYear(yearParam) : undefined) ?? defaultMap);
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

	function startAutoplay() {
		if (autoplayDisabled) return;

		autoplayFollowMap = false;
		setAutoplayRepairSelection(
			!autoplayItems.some((item) => item.annotation === viewState.annotation)
		);
		resetAutoplayTimer();
		autoplayActive = true;
		autoplayPlaying = true;
		aboutOpen = false;
		shareOpen = false;
		ensureAutoplaySelection();
	}

	function toggleAutoplayPlayback() {
		if (!autoplayActive) {
			startAutoplay();
			return;
		}

		if (autoplayPlaying) {
			pauseAutoplay();
		} else {
			autoplayPlaying = true;
		}
	}

	function toggleAutoplayFollowMap() {
		setAutoplayRepairSelection(true);
		autoplayFollowMap = !autoplayFollowMap;
		ensureAutoplaySelection();
	}

	function stopAutoplay() {
		clearAutoplayTimer();
		syncSelectedYearToAnnotation(viewState.annotation);
		autoplayActive = false;
		autoplayPlaying = false;
		autoplayFollowMap = false;
		setAutoplayRepairSelection(false);
		resetAutoplayTimer();
	}

	function pauseAutoplay() {
		autoplayRemainingMs = getCurrentAutoplayRemainingMs();
		autoplayPlaying = false;
	}

	function ensureAutoplaySelection() {
		const item = getAutoplayStartItem();
		if (!item || item.annotation === viewState.annotation) return;

		selectAutoplayItem(item);
	}

	function advanceAutoplay() {
		const nextItem = getRelativeAutoplayItem(1);
		if (!nextItem) return;

		selectAutoplayItem(nextItem);
	}

	function getAutoplayCurrentIndex() {
		return autoplayItems.findIndex((item) => item.annotation === viewState.annotation);
	}

	function getAutoplayStartItem() {
		if (autoplayItems.length === 0) return undefined;

		const currentItem = autoplayItems.find((item) => item.annotation === viewState.annotation);
		if (currentItem) return currentItem;

		return getNearestAutoplayItem(selectedYear);
	}

	function getNearestAutoplayItem(year: number) {
		return autoplayItems.reduce((best, item) => {
			const bestDistance = Math.abs(best.year - year);
			const itemDistance = Math.abs(item.year - year);

			if (itemDistance < bestDistance) return item;
			if (itemDistance > bestDistance) return best;
			if (item.year >= year && best.year < year) return item;

			return best;
		}, autoplayItems[0]);
	}

	function getRelativeAutoplayItem(direction: -1 | 1) {
		if (autoplayItems.length === 0) return undefined;

		const currentIndex = autoplayCurrentIndex;

		if (currentIndex >= 0) {
			const nextIndex = (currentIndex + direction + autoplayItems.length) % autoplayItems.length;
			return autoplayItems[nextIndex];
		}

		if (direction === 1) {
			return autoplayItems.find((item) => item.year > selectedYear) ?? autoplayItems[0];
		}

		return (
			[...autoplayItems].reverse().find((item) => item.year < selectedYear) ?? autoplayItems.at(-1)
		);
	}

	function selectRelativeAutoplaySlide(direction: -1 | 1) {
		const item = getRelativeAutoplayItem(direction);
		if (item) selectAutoplayItem(item);
	}

	function handlePresentationTouchStart(event: TouchEvent) {
		if (!autoplayActive || hasOpenModal() || event.touches.length !== 1) {
			presentationTouch = undefined;
			return;
		}

		if (isInteractiveTarget(event.target)) {
			presentationTouch = undefined;
			return;
		}

		const touch = event.touches[0];
		presentationTouch = {
			x: touch.clientX,
			y: touch.clientY,
			time: performance.now()
		};
	}

	function handlePresentationTouchMove(event: TouchEvent) {
		if (!presentationTouch || !autoplayActive || event.touches.length !== 1) return;

		const touch = event.touches[0];
		const dx = touch.clientX - presentationTouch.x;
		const dy = touch.clientY - presentationTouch.y;

		if (isHorizontalPresentationSwipe(dx, dy, 12)) {
			event.preventDefault();
		}
	}

	function handlePresentationTouchEnd(event: TouchEvent) {
		if (!presentationTouch || !autoplayActive) {
			presentationTouch = undefined;
			return;
		}

		const touch = event.changedTouches[0];
		if (!touch) {
			presentationTouch = undefined;
			return;
		}

		const dx = touch.clientX - presentationTouch.x;
		const dy = touch.clientY - presentationTouch.y;
		const duration = performance.now() - presentationTouch.time;
		presentationTouch = undefined;

		if (
			duration <= PRESENTATION_SWIPE_MAX_DURATION_MS &&
			isHorizontalPresentationSwipe(dx, dy, PRESENTATION_SWIPE_THRESHOLD)
		) {
			event.preventDefault();
			event.stopPropagation();
			selectRelativeAutoplaySlide(dx < 0 ? 1 : -1);
		}
	}

	function handlePresentationTouchCancel() {
		presentationTouch = undefined;
	}

	function isHorizontalPresentationSwipe(dx: number, dy: number, threshold: number) {
		const horizontalDistance = Math.abs(dx);
		const verticalDistance = Math.abs(dy);

		return (
			horizontalDistance >= threshold &&
			horizontalDistance >= verticalDistance * PRESENTATION_SWIPE_AXIS_RATIO
		);
	}

	function selectAutoplayItem(item: AutoplayItem) {
		resetAutoplayTimer();
		setAutoplayRepairSelection(false);
		selectedYear = item.year;
		viewState.annotation = item.annotation;
	}

	function resetAutoplayTimer() {
		autoplayRemainingMs = autoplayIntervalMs;
		autoplayTimerCycle += 1;
		autoplayTimerStartedAt = 0;
	}

	function setAutoplayRepairSelection(repair: boolean) {
		if (untrack(() => autoplayRepairSelection) !== repair) {
			autoplayRepairSelection = repair;
		}
	}

	function clearAutoplayTimer() {
		if (autoplayTimeout) {
			clearTimeout(autoplayTimeout);
			autoplayTimeout = undefined;
		}
		autoplayTimerStartedAt = 0;
	}

	function getAutoplayTimerDuration() {
		if (autoplayRemainingMs <= 0 || autoplayRemainingMs > autoplayIntervalMs) {
			autoplayRemainingMs = autoplayIntervalMs;
		}

		return autoplayRemainingMs;
	}

	function getCurrentAutoplayRemainingMs() {
		if (!autoplayPlaying || !autoplayTimerStartedAt) return getAutoplayTimerDuration();

		const elapsedMs = performance.now() - autoplayTimerStartedAt;
		return Math.max(0, getAutoplayTimerDuration() - elapsedMs);
	}

	function hasOpenModal() {
		return (
			document.body.classList.contains('driver-active') ||
			!!document.querySelector('[role="dialog"][aria-modal="true"]')
		);
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
		if (hasOpenModal()) return;

		if (autoplayActive) {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopImmediatePropagation();
				stopAutoplay();
				return;
			}

			if (event.code === 'Space') {
				if (event.repeat) return;

				event.preventDefault();
				event.stopImmediatePropagation();
				toggleAutoplayPlayback();
				return;
			}

			if (
				!event.shiftKey &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				(event.key === 'ArrowLeft' || event.key === 'ArrowRight')
			) {
				event.preventDefault();
				event.stopImmediatePropagation();
				selectRelativeAutoplaySlide(event.key === 'ArrowLeft' ? -1 : 1);
				return;
			}

			if (
				!event.shiftKey &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				(event.key === 'ArrowUp' || event.key === 'ArrowDown')
			) {
				event.preventDefault();
				event.stopImmediatePropagation();
				return;
			}
		}

		if (isInteractiveTarget(event.target)) return;

		if (
			!event.repeat &&
			!event.shiftKey &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			event.key.toLowerCase() === 'p'
		) {
			event.preventDefault();
			event.stopImmediatePropagation();
			startAutoplay();
			return;
		}

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

		if ((!autoplayActive && handleMapToolbarKeydown(event)) || handleMapNavigationKeydown(event)) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}

	function handleGlobalKeydownCapture(event: KeyboardEvent) {
		if (hasOpenModal()) return;
		if (!autoplayActive && isInteractiveTarget(event.target)) return;
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
		return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
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
		let cancelled = false;
		const appShell = appShellElement;

		function syncCompareStacked(event: MediaQueryList | MediaQueryListEvent) {
			compareStacked = event.matches;
		}

		async function initializePanes() {
			syncCompareStacked(compareStackQuery);

			try {
				await loadWarpedMapData();
				if (!cancelled) {
					applyInitialParams(new URLSearchParams(window.location.search));
					panesReady = true;
					if (startsInPresentation) {
						await tick();
						if (!cancelled) startAutoplay();
					}
				}
			} catch (error) {
				console.error(error);
				if (!cancelled) {
					panesError = 'Kaartlagen konden niet worden geladen.';
				}
			}
		}

		initializePanes();
		compareStackQuery.addEventListener('change', syncCompareStacked);
		appShell?.addEventListener('touchstart', handlePresentationTouchStart, { passive: true });
		appShell?.addEventListener('touchmove', handlePresentationTouchMove, { passive: false });
		appShell?.addEventListener('touchend', handlePresentationTouchEnd, { passive: false });
		appShell?.addEventListener('touchcancel', handlePresentationTouchCancel, { passive: true });

		return () => {
			cancelled = true;
			compareStackQuery.removeEventListener('change', syncCompareStacked);
			appShell?.removeEventListener('touchstart', handlePresentationTouchStart);
			appShell?.removeEventListener('touchmove', handlePresentationTouchMove);
			appShell?.removeEventListener('touchend', handlePresentationTouchEnd);
			appShell?.removeEventListener('touchcancel', handlePresentationTouchCancel);
		};
	});
</script>

<svelte:window
	onkeydowncapture={handleGlobalKeydownCapture}
	onkeydown={handleGlobalKeydown}
	onkeyup={handleGlobalKeyup}
	onblur={restoreOpacityShortcut}
/>

<div
	bind:this={appShellElement}
	data-app-shell
	class="relative flex h-[100dvh] min-h-0 flex-col overflow-hidden"
>
	<AppTour {config} enabled={panesReady && !startsInPresentation} />

	<Header
		{config}
		searchBounds={geocoderBounds}
		{autoplayActive}
		{autoplayPlaying}
		{autoplayDisabled}
		{autoplayCurrentPosition}
		{autoplayTotal}
		autoplayIntervalSeconds={autoplayInterval ?? 0}
		{autoplayFollowMap}
		onAboutOpen={() => (aboutOpen = true)}
		onShareOpen={() => (shareOpen = true)}
		onAutoplayStart={startAutoplay}
		onAutoplayPauseToggle={toggleAutoplayPlayback}
		onAutoplayStop={stopAutoplay}
		onAutoplayFollowMapToggle={toggleAutoplayFollowMap}
	/>

	<div
		class="flex min-h-0 flex-1 bg-white {comparison.active
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
				bind:annotationsInView={leftAnnotationsInView}
				bind:annotationsAtCenter={leftAnnotationsAtCenter}
				{mapKeyboardCommand}
				{mapToolbarCommand}
				enableFlyTo
				enableLocationMarker
				enableLayersShortcut
				showLayersPaneIndicator={comparison.active}
				{autoplayActive}
				{autoplayFollowMap}
				{autoplayNextAnnotation}
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
					enableLocationMarker
					showLayersPaneIndicator
				/>
			{/if}
		{:else}
			<div class="grid min-h-0 flex-1 place-items-center">
				{#if panesError}
					<p class="px-6 text-center text-sm font-semibold text-gray-700">{panesError}</p>
				{:else}
					<div role="status" aria-label="Loading map">
						<LoaderCircle class="h-8 w-8 animate-spin text-brand-main" />
					</div>
				{/if}
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
