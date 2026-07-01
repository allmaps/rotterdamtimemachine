<script lang="ts">
	import { base } from '$app/paths';
	import AllmapsLogo from '$lib/components/AllmapsLogo.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { configureFavoritesStorage, favorites, toggleFavorite } from '$lib/app-state.svelte.js';
	import { resolveAbsolutePublicAssetUrl } from '$lib/asset-urls';
	import {
		ChevronLeft,
		ChevronRight,
		Check,
		Copy,
		Eye,
		ExternalLink,
		MapPinned,
		PanelLeft,
		PanelRight,
		Search as SearchIcon,
		Star,
		X
	} from '@lucide/svelte';
	import { onDestroy, tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import {
		getExpandedMapYears,
		getMapStartYear,
		getMapYearLabel,
		mapIncludesYear
	} from '$lib/map-years';
	import type { AppConfig, MapMetadata } from '$lib/types';

	const CAROUSEL_SCROLL_SETTLE_MS = 140;
	const CAROUSEL_SCROLL_FALLBACK_MS = 640;
	const CAROUSEL_USER_SCROLL_SETTLE_MS = 70;
	const CAROUSEL_POINTER_SETTLE_MS = 40;

	let {
		maps: mapMetadata,
		config,
		annotation = $bindable(),
		selectedYear = $bindable(),
		layersId = 'map-layers',
		paneSide = 'left',
		showPaneIndicator = false,
		enableKeyboardShortcut = false,
		annotationsInView = [],
		preferInViewMaps = false
	}: {
		maps: MapMetadata[];
		config: AppConfig;
		annotation?: string;
		selectedYear: number;
		layersId?: string;
		paneSide?: 'left' | 'right';
		showPaneIndicator?: boolean;
		enableKeyboardShortcut?: boolean;
		annotationsInView?: string[];
		preferInViewMaps?: boolean;
	} = $props();

	let maps = $derived(mapMetadata);
	let availableYears = $derived(getExpandedMapYears(maps));
	let favoriteStorageScope = $derived(
		[config.site.url || config.site.name || 'default', config.collection ?? 'collection'].join(':')
	);
	let favoriteAnnotations = $derived(maps.map((map) => map.annotation));

	let layersOpen = $state(false);
	let showCurrentYearOnly = $state(true);
	let showFavoritesOnly = $state(false);
	let showInViewOnly = $state(false);
	let searchTerm = $state('');
	let selectedIndex = $state(0);
	let copiedXyzAnnotation = $state<string | undefined>();
	let listElement = $state<HTMLUListElement>();
	let searchInputElement = $state<HTMLInputElement>();
	let carouselTrackElement = $state<HTMLDivElement>();
	let carouselDotsElement = $state<HTMLDivElement>();
	let copiedXyzTimer: ReturnType<typeof setTimeout> | undefined;
	let carouselScrollTimer: ReturnType<typeof setTimeout> | undefined;
	let carouselProgrammaticScrollTimer: ReturnType<typeof setTimeout> | undefined;
	let carouselPointerStart: { x: number; y: number } | undefined;
	let suppressCarouselClick = false;
	let hasSyncedCarousel = false;
	let hasSyncedCarouselDots = false;
	let isProgrammaticCarouselScroll = false;
	const filterButtonClass =
		'relative flex min-w-0 items-center justify-center gap-1 rounded border px-2 py-1.5 transition';
	const activeFilterClass = 'border-brand-main bg-brand-soft text-gray-900 shadow-sm';
	const inactiveFilterClass =
		'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900';

	let modalId = $derived(`${layersId}-modal`);
	let modalTitleId = $derived(`${modalId}-title`);
	let paneIndicatorLabel = $derived(
		paneSide === 'left' ? config.layers.leftPane : config.layers.rightPane
	);
	let annotationsInViewSet = $derived(new Set(annotationsInView));
	let inViewMaps = $derived(maps.filter((map) => annotationsInViewSet.has(map.annotation)));
	let selectionMaps = $derived(preferInViewMaps && inViewMaps.length > 0 ? inViewMaps : maps);
	let selectionAvailableYears = $derived(getExpandedMapYears(selectionMaps));
	let resolvedYear = $derived(resolveAvailableYear(selectedYear, selectionAvailableYears));
	let mapsForResolvedYear = $derived(
		selectionMaps.filter((map) => mapIncludesYear(map, resolvedYear))
	);
	let mapsForVisibleYear = $derived(maps.filter((map) => mapIncludesYear(map, resolvedYear)));
	let activeMap = $derived(
		mapsForResolvedYear.find((map) => map.annotation === annotation) ?? mapsForResolvedYear[0]
	);
	let activeMapIndex = $derived(
		mapsForResolvedYear.findIndex((map) => map.annotation === activeMap?.annotation)
	);
	let activeMapPosition = $derived(activeMapIndex >= 0 ? activeMapIndex + 1 : 1);
	let hasMultipleMaps = $derived(mapsForResolvedYear.length > 1);
	let canSelectPreviousMap = $derived(hasMultipleMaps && activeMapIndex > 0);
	let canSelectNextMap = $derived(
		hasMultipleMaps && activeMapIndex >= 0 && activeMapIndex < mapsForResolvedYear.length - 1
	);
	let normalizedSearchTerm = $derived(normalizeSearchTerm(searchTerm));
	let visibleMaps = $derived(
		(showCurrentYearOnly ? mapsForVisibleYear : maps).filter(
			(map) =>
				(showFavoritesOnly ? favorites.includes(map.annotation) : true) &&
				(showInViewOnly ? annotationsInViewSet.has(map.annotation) : true) &&
				(normalizedSearchTerm ? getSearchText(map).includes(normalizedSearchTerm) : true)
		)
	);
	let resultLabel = $derived(
		`${visibleMaps.length} ${
			visibleMaps.length === 1 ? config.layers.resultSingular : config.layers.resultPlural
		}`
	);

	$effect(() => {
		configureFavoritesStorage(favoriteStorageScope, favoriteAnnotations);
	});

	$effect(() => {
		if (activeMap && !mapsForResolvedYear.some((map) => map.annotation === annotation)) {
			annotation = activeMap.annotation;
		}
	});

	$effect(() => {
		const trackElement = carouselTrackElement;
		const index = activeMapIndex;
		const mapCount = mapsForResolvedYear.length;

		if (!trackElement || index < 0 || mapCount < 1) return;

		tick().then(() => {
			if (carouselTrackElement !== trackElement) return;

			scrollCarouselToIndex(index, hasSyncedCarousel ? 'smooth' : 'auto');
			hasSyncedCarousel = true;
		});
	});

	$effect(() => {
		const dotsElement = carouselDotsElement;
		const index = activeMapIndex;
		const mapCount = mapsForResolvedYear.length;

		if (!dotsElement || index < 0 || mapCount < 2) return;

		tick().then(() => {
			if (carouselDotsElement !== dotsElement) return;

			scrollCarouselDotToIndex(index, hasSyncedCarouselDots ? 'smooth' : 'auto');
			hasSyncedCarouselDots = true;
		});
	});

	$effect(() => {
		if (layersOpen) {
			tick().then(() => {
				focusSearchInput();
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

	onDestroy(() => {
		if (copiedXyzTimer) clearTimeout(copiedXyzTimer);
		if (carouselScrollTimer) clearTimeout(carouselScrollTimer);
		if (carouselProgrammaticScrollTimer) clearTimeout(carouselProgrammaticScrollTimer);
	});

	function resolveAvailableYear(year: number, years = availableYears) {
		let resolved = years[0] ?? year;
		for (const availableYear of years) {
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
			[map.label, map.title, getMapYearLabel(map), map.institution].join(' ')
		);
	}

	function openLayers() {
		resetModalState();
		layersOpen = true;
	}

	function closeLayers() {
		layersOpen = false;
	}

	function isEditableTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;

		const tagName = target.tagName.toLowerCase();
		return (
			tagName === 'input' ||
			tagName === 'textarea' ||
			tagName === 'select' ||
			target.isContentEditable
		);
	}

	function hasOpenModal() {
		return (
			document.body.classList.contains('driver-active') ||
			!!document.querySelector('[role="dialog"][aria-modal="true"]')
		);
	}

	function shouldAutoFocusSearch() {
		if (typeof window === 'undefined') return false;

		return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
	}

	function focusSearchInput() {
		if (shouldAutoFocusSearch()) {
			searchInputElement?.focus({ preventScroll: true });
		}
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (!enableKeyboardShortcut || event.repeat) return;
		if (document.body.classList.contains('driver-active')) return;

		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			event.stopPropagation();

			if (layersOpen) {
				searchInputElement?.focus();
			} else {
				openLayers();
			}
			return;
		}

		if (hasOpenModal()) return;
		if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
		if (isEditableTarget(event.target)) return;

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			selectRelativeMap(-1);
		}

		if (event.key === 'ArrowRight') {
			event.preventDefault();
			selectRelativeMap(1);
		}
	}

	function resetModalState() {
		showCurrentYearOnly = true;
		showFavoritesOnly = false;
		showInViewOnly = preferInViewMaps && annotationsInViewSet.size > 0;
		searchTerm = '';
		selectedIndex = Math.max(
			0,
			mapsForResolvedYear.findIndex((map) => map.annotation === annotation)
		);
	}

	function selectMap(map: (typeof maps)[0]) {
		annotation = map.annotation;
		selectedYear = mapIncludesYear(map, selectedYear) ? selectedYear : getMapStartYear(map);
		closeLayers();
	}

	function getAllmapsViewerUrl(annotationUrl: string) {
		const url = new URL('https://viewer.allmaps.org/');
		url.searchParams.set('url', getPublicAnnotationUrl(annotationUrl));

		return url.href;
	}

	function getXyzTileUrl(annotationUrl: string) {
		return `https://allmaps.xyz/{z}/{x}/{y}.png?url=${encodeURIComponent(
			getPublicAnnotationUrl(annotationUrl)
		)}`;
	}

	function getPublicAnnotationUrl(annotationUrl: string) {
		const origin =
			typeof window === 'undefined' ? new URL(config.site.url).origin : window.location.origin;

		return resolveAbsolutePublicAssetUrl(annotationUrl, origin, base);
	}

	async function copyXyzTileUrl(annotationUrl: string) {
		const xyzTileUrl = getXyzTileUrl(annotationUrl);

		try {
			await navigator.clipboard.writeText(xyzTileUrl);
		} catch {
			copyTextWithFallback(xyzTileUrl);
		}

		if (copiedXyzTimer) clearTimeout(copiedXyzTimer);
		copiedXyzAnnotation = annotationUrl;
		copiedXyzTimer = setTimeout(() => (copiedXyzAnnotation = undefined), 2000);
	}

	function copyTextWithFallback(value: string) {
		const textarea = document.createElement('textarea');
		textarea.value = value;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'fixed';
		textarea.style.left = '-9999px';
		document.body.append(textarea);
		textarea.select();
		document.execCommand('copy');
		textarea.remove();
	}

	async function toggleCurrentYearFilter() {
		showCurrentYearOnly = !showCurrentYearOnly;
		focusSearchInput();
		await selectActiveResult();
	}

	async function selectActiveResult() {
		await tick();
		if (!annotation) return;

		const activeIndex = visibleMaps.findIndex((map) => map.annotation === annotation);
		selectedIndex = Math.max(0, activeIndex);
		scrollSelectedIntoView('center');
	}

	function handleSearchInput() {
		if (searchTerm.trim() !== '') {
			showCurrentYearOnly = false;
		}
		selectedIndex = 0;
	}

	function toggleFavoritesFilter() {
		showFavoritesOnly = !showFavoritesOnly;
		selectedIndex = 0;
		focusSearchInput();
	}

	function toggleInViewFilter() {
		showInViewOnly = !showInViewOnly;
		selectedIndex = 0;
		focusSearchInput();
	}

	function scrollSelectedIntoView(block: ScrollLogicalPosition = 'nearest') {
		if (!listElement) return;

		const selectedElement = listElement.children[selectedIndex] as HTMLElement | undefined;
		if (!selectedElement) return;

		const listRect = listElement.getBoundingClientRect();
		const selectedRect = selectedElement.getBoundingClientRect();
		const selectedTop = selectedRect.top - listRect.top + listElement.scrollTop;
		const selectedBottom = selectedTop + selectedRect.height;
		const viewportTop = listElement.scrollTop;
		const viewportBottom = viewportTop + listElement.clientHeight;

		if (block === 'center') {
			listElement.scrollTop = selectedTop - (listElement.clientHeight - selectedRect.height) / 2;
		} else if (block === 'end') {
			listElement.scrollTop = selectedBottom - listElement.clientHeight;
		} else if (block === 'start' || selectedTop < viewportTop) {
			listElement.scrollTop = selectedTop;
		} else if (selectedBottom > viewportBottom) {
			listElement.scrollTop = selectedBottom - listElement.clientHeight;
		}
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

	function scrollCarouselToIndex(index: number, behavior: ScrollBehavior = 'smooth') {
		const trackElement = carouselTrackElement;
		const slideElement = trackElement?.children[index] as HTMLElement | undefined;
		if (!trackElement || !slideElement) return;

		const targetLeft = slideElement.offsetLeft;
		if (Math.abs(trackElement.scrollLeft - targetLeft) < 1) return;

		isProgrammaticCarouselScroll = true;
		if (carouselScrollTimer) {
			clearTimeout(carouselScrollTimer);
			carouselScrollTimer = undefined;
		}
		if (carouselProgrammaticScrollTimer) clearTimeout(carouselProgrammaticScrollTimer);

		trackElement.scrollTo({ left: targetLeft, behavior });
		carouselProgrammaticScrollTimer = setTimeout(
			() => {
				isProgrammaticCarouselScroll = false;
				carouselProgrammaticScrollTimer = undefined;
			},
			behavior === 'smooth' ? CAROUSEL_SCROLL_FALLBACK_MS : 0
		);
	}

	function scrollCarouselDotToIndex(index: number, behavior: ScrollBehavior = 'smooth') {
		const dotsElement = carouselDotsElement;
		const dotElement = dotsElement?.querySelectorAll<HTMLElement>('[data-carousel-dot]')[index];
		if (!dotsElement || !dotElement) return;

		const dotsRect = dotsElement.getBoundingClientRect();
		const dotRect = dotElement.getBoundingClientRect();
		const targetLeft =
			dotsElement.scrollLeft +
			(dotRect.left + dotRect.width / 2 - (dotsRect.left + dotsRect.width / 2));
		const maxScrollLeft = dotsElement.scrollWidth - dotsElement.clientWidth;
		const nextScrollLeft = Math.max(0, Math.min(targetLeft, maxScrollLeft));

		if (Math.abs(dotsElement.scrollLeft - nextScrollLeft) < 1) return;

		dotsElement.scrollTo({ left: nextScrollLeft, behavior });
	}

	function handleCarouselScroll() {
		if (!carouselTrackElement) return;

		if (isProgrammaticCarouselScroll) {
			if (carouselProgrammaticScrollTimer) clearTimeout(carouselProgrammaticScrollTimer);
			carouselProgrammaticScrollTimer = setTimeout(() => {
				isProgrammaticCarouselScroll = false;
				carouselProgrammaticScrollTimer = undefined;
			}, CAROUSEL_SCROLL_SETTLE_MS);
			return;
		}

		queueNearestCarouselSelection(CAROUSEL_USER_SCROLL_SETTLE_MS);
	}

	function queueNearestCarouselSelection(delay = CAROUSEL_USER_SCROLL_SETTLE_MS) {
		if (carouselScrollTimer) clearTimeout(carouselScrollTimer);
		carouselScrollTimer = setTimeout(() => {
			carouselScrollTimer = undefined;
			selectNearestCarouselMap();
		}, delay);
	}

	function selectNearestCarouselMap() {
		const trackElement = carouselTrackElement;
		if (!trackElement || mapsForResolvedYear.length < 1) return;

		const center = trackElement.scrollLeft + trackElement.clientWidth / 2;
		const slides = Array.from(trackElement.children) as HTMLElement[];
		let nearestIndex = 0;
		let nearestDistance = Number.POSITIVE_INFINITY;

		for (const [index, slideElement] of slides.entries()) {
			const slideCenter = slideElement.offsetLeft + slideElement.offsetWidth / 2;
			const distance = Math.abs(center - slideCenter);

			if (distance < nearestDistance) {
				nearestIndex = index;
				nearestDistance = distance;
			}
		}

		selectCarouselMap(nearestIndex);
	}

	function selectCarouselMap(index: number) {
		const map = mapsForResolvedYear[index];
		if (map && map.annotation !== annotation) {
			annotation = map.annotation;
		}
	}

	function handleCarouselDotClick(event: MouseEvent, index: number) {
		event.stopPropagation();
		if (event.currentTarget instanceof HTMLElement) {
			event.currentTarget.blur();
		}
		selectCarouselMap(index);
	}

	function handleCarouselInteractionStart() {
		if (isProgrammaticCarouselScroll) {
			isProgrammaticCarouselScroll = false;
		}

		if (carouselProgrammaticScrollTimer) {
			clearTimeout(carouselProgrammaticScrollTimer);
			carouselProgrammaticScrollTimer = undefined;
		}
	}

	function handleCarouselPointerDown(event: PointerEvent) {
		handleCarouselInteractionStart();
		carouselPointerStart = { x: event.clientX, y: event.clientY };
		suppressCarouselClick = false;
	}

	function handleCarouselPointerMove(event: PointerEvent) {
		if (!carouselPointerStart) return;

		const deltaX = Math.abs(event.clientX - carouselPointerStart.x);
		const deltaY = Math.abs(event.clientY - carouselPointerStart.y);

		if (deltaX > 8 || deltaY > 8) {
			suppressCarouselClick = true;
		}
	}

	function handleCarouselPointerEnd() {
		carouselPointerStart = undefined;
		if (!isProgrammaticCarouselScroll) {
			queueNearestCarouselSelection(CAROUSEL_POINTER_SETTLE_MS);
		}
		setTimeout(() => (suppressCarouselClick = false), 0);
	}

	function handleCarouselSlideClick(event: MouseEvent) {
		if (suppressCarouselClick) {
			event.preventDefault();
			return;
		}

		openLayers();
	}

	function handleCarouselSlideKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			event.stopPropagation();
			openLayers();
			return;
		}

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			event.stopPropagation();
			selectRelativeMap(-1);
		}

		if (event.key === 'ArrowRight') {
			event.preventDefault();
			event.stopPropagation();
			selectRelativeMap(1);
		}
	}

	function selectRelativeMap(direction: -1 | 1) {
		if (!hasMultipleMaps) return;

		const currentIndex = activeMapIndex >= 0 ? activeMapIndex : 0;
		const nextIndex = currentIndex + direction;
		const nextMap = mapsForResolvedYear[nextIndex];
		if (nextMap) {
			annotation = nextMap.annotation;
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if activeMap}
	<div
		class="absolute right-2 bottom-2 left-2 grid grid-flow-col items-center justify-items-center"
	>
		<div
			data-tour="layers"
			data-map-layers-panel
			class="relative z-30 w-full max-w-lg overflow-hidden rounded-md border border-gray-200 bg-white p-1 text-gray-900 shadow-lg {hasMultipleMaps
				? 'min-h-16'
				: 'min-h-14'}"
		>
			<div
				bind:this={carouselTrackElement}
				role="group"
				aria-label={config.layers.openLabel}
				aria-roledescription="carousel"
				class="layers-carousel-track flex snap-x snap-mandatory overflow-x-auto"
				onscroll={handleCarouselScroll}
				onpointerdown={handleCarouselPointerDown}
				onpointermove={handleCarouselPointerMove}
				onpointerup={handleCarouselPointerEnd}
				onpointercancel={handleCarouselPointerEnd}
				onwheel={handleCarouselInteractionStart}
			>
				{#each mapsForResolvedYear as map, index (map.annotation)}
					<div class="w-full flex-none snap-center">
						<div
							role="button"
							tabindex={index === activeMapIndex ? 0 : -1}
							aria-current={index === activeMapIndex ? 'true' : undefined}
							aria-label="{config.layers.openLabel}: {map.label} ({getMapYearLabel(
								map
							)}, {map.institution})"
							aria-haspopup="dialog"
							aria-controls={modalId}
							onclick={handleCarouselSlideClick}
							onkeydown={handleCarouselSlideKeydown}
							class="relative min-h-12 min-w-0 cursor-pointer rounded px-2 py-1.5 transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-main"
						>
							<div class="pointer-events-none flex min-w-0 items-center gap-2 pb-0.5">
								<span
									class="flex-none rounded bg-gray-900 px-1.5 py-0.5 font-heading text-[0.65rem] text-white"
								>
									{getMapYearLabel(map)}
								</span>
								<span class="min-w-0 flex-1 truncate text-sm leading-5 font-semibold">
									{map.label}
								</span>
							</div>
							<div class="pointer-events-none pt-1">
								<span
									class="inline-flex max-w-full items-center gap-1 text-xs font-medium text-gray-500"
								>
									<span class="min-w-0 truncate">{map.institution}</span>
								</span>
							</div>
						</div>
					</div>
				{/each}
			</div>

			{#if hasMultipleMaps}
				<div
					aria-label="{config.layers
						.mapPosition} {activeMapPosition} van {mapsForResolvedYear.length}"
					transition:slide={{ duration: 140 }}
					class="grid h-5 grid-cols-[2rem_1fr_2rem] items-center gap-1 px-1 pb-0.5"
				>
					<button
						type="button"
						aria-label="{config.layers
							.previousMap} ({activeMapPosition} van {mapsForResolvedYear.length})"
						disabled={!canSelectPreviousMap}
						onclick={(event) => {
							event.stopPropagation();
							selectRelativeMap(-1);
						}}
						class="flex h-5 w-8 cursor-pointer items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-main disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-transparent disabled:hover:text-gray-300"
					>
						<ChevronLeft class="h-4 w-4" />
					</button>

					<div
						bind:this={carouselDotsElement}
						class="layers-carousel-dots min-w-0 overflow-x-auto px-1"
					>
						<div class="flex w-max min-w-full items-center justify-center gap-1">
							{#each mapsForResolvedYear as map, index (map.annotation)}
								<button
									type="button"
									data-carousel-dot
									aria-label="{config.layers.mapPosition} {index +
										1} van {mapsForResolvedYear.length}: {map.label}"
									aria-current={index === activeMapIndex ? 'true' : undefined}
									onclick={(event) => handleCarouselDotClick(event, index)}
									class="h-4 w-4 flex-none cursor-pointer rounded-full p-1 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-main"
								>
									<span
										class="block h-1.5 w-1.5 rounded-full transition {index === activeMapIndex
											? 'bg-brand-main'
											: 'bg-gray-300 hover:bg-gray-500'}"
									></span>
								</button>
							{/each}
						</div>
					</div>

					<button
						type="button"
						aria-label="{config.layers
							.nextMap} ({activeMapPosition} van {mapsForResolvedYear.length})"
						disabled={!canSelectNextMap}
						onclick={(event) => {
							event.stopPropagation();
							selectRelativeMap(1);
						}}
						class="flex h-5 w-8 cursor-pointer items-center justify-center justify-self-end rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-main disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-transparent disabled:hover:text-gray-300"
					>
						<ChevronRight class="h-4 w-4" />
					</button>
				</div>
			{/if}
		</div>
	</div>

	{#if layersOpen}
		<Modal
			onClose={closeLayers}
			ariaLabelledby={modalTitleId}
			panelClass="max-h-[calc(100dvh-5.5rem)] max-w-2xl md:max-h-[calc(100dvh-8rem)]"
			onKeydown={handleKeydown}
		>
			<div class="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
				<AllmapsLogo class="h-6 w-6 flex-none text-brand-main" />
				<div class="min-w-0 flex-1">
					<h2 id={modalTitleId} class="text-lg leading-6 font-semibold">
						{config.layers.title}
					</h2>
					<p class="truncate text-xs font-medium text-gray-500">
						{resultLabel}
						{#if searchTerm}
							{config.layers.found}
						{/if}
						{#if showCurrentYearOnly}
							{config.layers.yearPrefix} {resolvedYear}
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
					aria-label={config.layers.closeLabel}
					class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
					onclick={closeLayers}
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<div class="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
				<SearchIcon class="h-5 w-5 flex-none text-brand-main" />
				<input
					bind:this={searchInputElement}
					bind:value={searchTerm}
					type="search"
					enterkeyhint="search"
					spellcheck="false"
					autocomplete="off"
					placeholder={config.layers.searchPlaceholder}
					class="m-0 min-w-0 flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-gray-400"
					oninput={handleSearchInput}
				/>
			</div>

			<div class="border-b border-gray-200 bg-gray-50 px-4 py-2">
				<div class="grid grid-cols-3 gap-1 text-xs leading-none font-semibold">
					<button
						type="button"
						aria-label="{config.layers.current}: {resolvedYear}"
						aria-pressed={showCurrentYearOnly}
						onclick={toggleCurrentYearFilter}
						class="{filterButtonClass} {showCurrentYearOnly
							? activeFilterClass
							: inactiveFilterClass}"
					>
						<span class="min-w-0 truncate tabular-nums {showCurrentYearOnly ? 'pr-3' : ''}">
							{resolvedYear}
						</span>
						{#if showCurrentYearOnly}
							<X class="pointer-events-none absolute right-1.5 h-3 w-3 text-brand-main" />
						{/if}
					</button>
					<button
						type="button"
						aria-pressed={showFavoritesOnly}
						onclick={toggleFavoritesFilter}
						class="{filterButtonClass} {showFavoritesOnly
							? 'border-yellow-500 bg-yellow-50 text-gray-900'
							: inactiveFilterClass}"
					>
						<Star
							class="h-3.5 w-3.5 flex-none {showFavoritesOnly
								? 'fill-yellow-400 text-yellow-500'
								: 'text-gray-400'}"
						/>
						<span class="min-w-0 truncate {showFavoritesOnly ? 'pr-3' : ''}"
							>{config.layers.favorite}</span
						>
						{#if showFavoritesOnly}
							<X class="pointer-events-none absolute right-1.5 h-3 w-3 text-yellow-500" />
						{/if}
					</button>

					<button
						type="button"
						aria-pressed={showInViewOnly}
						onclick={toggleInViewFilter}
						class="{filterButtonClass} {showInViewOnly ? activeFilterClass : inactiveFilterClass}"
					>
						<MapPinned
							class="h-3.5 w-3.5 flex-none {showInViewOnly ? 'text-brand-main' : 'text-gray-400'}"
						/>
						<span class="min-w-0 truncate {showInViewOnly ? 'pr-3' : ''}"
							>{config.layers.inView}</span
						>
						{#if showInViewOnly}
							<X class="pointer-events-none absolute right-1.5 h-3 w-3 text-brand-main" />
						{/if}
					</button>
				</div>
			</div>

			{#if visibleMaps.length > 0}
				<ul
					bind:this={listElement}
					transition:slide={{ duration: 140 }}
					class="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white"
				>
					{#each visibleMaps as map, index (map.annotation)}
						<li
							data-map-annotation={map.annotation}
							class="relative border-b border-gray-100 last:border-b-0"
						>
							<button
								type="button"
								aria-label="{config.layers.selectMap} {map.label} ({getMapYearLabel(
									map
								)}, {map.institution})"
								onclick={() => selectMap(map)}
								onmouseenter={() => (selectedIndex = index)}
								class="absolute inset-0 z-0 cursor-pointer text-left transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-main {index ===
								selectedIndex
									? 'bg-brand-soft'
									: 'hover:bg-gray-50'}"
							></button>
							<div class="pointer-events-none relative z-10 flex min-w-0 items-stretch">
								<div class="min-w-0 flex-1">
									<div class="w-full min-w-0 px-4 pt-3 pb-1 text-left">
										<div class="flex min-w-0 items-start justify-between gap-2">
											<p
												class="min-w-0 flex-1 text-sm leading-4 font-semibold break-words text-gray-900"
											>
												{map.label}
											</p>
											<span
												class="flex-none rounded bg-gray-900 px-1.5 py-0.5 font-heading text-[0.65rem] text-white"
											>
												{getMapYearLabel(map)}
											</span>
											{#if annotation === map.annotation}
												<span
													title={config.layers.visibleOnMap}
													class="flex h-5 w-5 flex-none items-center justify-center rounded bg-brand-muted text-brand-main"
												>
													<span class="sr-only">{config.layers.visibleOnMap}</span>
													<Eye class="h-3.5 w-3.5" />
												</span>
											{/if}
										</div>
										<p class="mt-1 text-xs leading-4 break-words text-gray-500">
											{map.title}
										</p>
									</div>
									<div
										class="flex flex-wrap gap-1 px-4 pb-3 text-[0.65rem] font-semibold text-gray-500"
									>
										<a
											href={map.url}
											target="_blank"
											rel="external noopener noreferrer"
											aria-label="{config.layers.viewItemAt} {map.institution}"
											onmouseenter={() => (selectedIndex = index)}
											class="pointer-events-auto relative z-20 inline-flex max-w-full cursor-pointer items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 hover:bg-brand-soft hover:text-brand-main"
										>
											<span class="min-w-0 break-words">{map.institution}</span>
											<ExternalLink class="h-3 w-3 flex-none" />
										</a>
										<a
											href={getAllmapsViewerUrl(map.annotation)}
											target="_blank"
											rel="external noopener noreferrer"
											aria-label="{config.layers.openInAllmapsViewer} {map.label}"
											onmouseenter={() => (selectedIndex = index)}
											class="pointer-events-auto relative z-20 inline-flex max-w-full cursor-pointer items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 hover:bg-brand-soft hover:text-brand-main"
										>
											<span>{config.layers.openInAllmapsViewer}</span>
											<ExternalLink class="h-3 w-3 flex-none" />
										</a>
										<button
											type="button"
											aria-label="{copiedXyzAnnotation === map.annotation
												? config.layers.copiedXyzTileUrl
												: config.layers.copyXyzTileUrl} {map.label}"
											onclick={() => copyXyzTileUrl(map.annotation)}
											onmouseenter={() => (selectedIndex = index)}
											class="pointer-events-auto relative z-20 inline-flex max-w-full cursor-pointer items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 hover:bg-brand-soft hover:text-brand-main"
										>
											{#if copiedXyzAnnotation === map.annotation}
												<Check class="h-3 w-3 flex-none" />
												<span>{config.layers.copiedXyzTileUrl}</span>
											{:else}
												<Copy class="h-3 w-3 flex-none" />
												<span>{config.layers.copyXyzTileUrl}</span>
											{/if}
										</button>
									</div>
								</div>

								<button
									type="button"
									aria-label={favorites.includes(map.annotation)
										? `${config.layers.removeFavorite} ${map.label} (${getMapYearLabel(map)}, ${map.institution})`
										: `${config.layers.addFavorite} ${map.label} (${getMapYearLabel(map)}, ${map.institution})`}
									aria-pressed={favorites.includes(map.annotation)}
									onclick={() => toggleFavorite(map.annotation)}
									onmouseenter={() => (selectedIndex = index)}
									class="pointer-events-auto relative z-20 flex w-12 flex-none cursor-pointer items-center justify-center border-l border-gray-100 text-gray-400 hover:bg-white hover:text-yellow-500"
								>
									<Star
										class="h-4 w-4 {favorites.includes(map.annotation)
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
					{config.layers.noResults}
				</p>
			{/if}

			<div class="border-t border-gray-200 px-4 py-3 text-xs leading-4 font-light text-gray-600">
				<p class="break-words">
					{config.layers.basemap}:
					<a
						class="hover:text-brand-main"
						href="https://github.com/protomaps/basemaps"
						target="_blank"
						rel="external noreferrer"
					>
						{config.layers.protomaps}
					</a>
					<span aria-hidden="true"> | </span>
					<a
						class="hover:text-brand-main"
						href="https://www.openstreetmap.org/copyright"
						target="_blank"
						rel="external noreferrer"
					>
						{config.layers.openStreetMap}
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

	.layers-carousel-track,
	.layers-carousel-dots {
		scrollbar-width: none;
	}

	.layers-carousel-track {
		touch-action: pan-x;
	}

	.layers-carousel-track::-webkit-scrollbar,
	.layers-carousel-dots::-webkit-scrollbar {
		display: none;
	}
</style>
