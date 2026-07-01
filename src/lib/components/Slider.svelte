<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { getExpandedMapYears, mapIncludesYear } from '$lib/map-years';
	import type { MapMetadata } from '$lib/types';

	type AvailabilitySegment = {
		start: number;
		end: number;
	};

	type ScrollMode = 'auto' | 'smooth';

	const yearRowHeight = 40;
	const scrollSettleDelay = 140;
	const snapScrollDuration = 640;
	const programmaticScrollReleaseDelay = scrollSettleDelay + 40;

	let {
		maps,
		selectedYear = $bindable(),
		inViewOnly = $bindable(false),
		navPosition = 'left',
		showMapYearTicks = false,
		showOnlyAvailableYears = false,
		snapToAvailableYear = false,
		scaleInterval = 25,
		enableKeyboardShortcut = false,
		annotationsInView = []
	}: {
		maps: MapMetadata[];
		selectedYear: number;
		inViewOnly?: boolean;
		navPosition?: 'left' | 'right';
		showMapYearTicks?: boolean;
		showOnlyAvailableYears?: boolean;
		snapToAvailableYear?: boolean;
		scaleInterval?: number;
		enableKeyboardShortcut?: boolean;
		annotationsInView?: string[];
	} = $props();

	let container = $state<HTMLDivElement>();
	let containerHeight = $state(0);
	let isInteracting = $state(false);
	let previewYear = $state<number | undefined>();
	let isProgrammaticScroll = false;
	let hasInitializedScroll = false;
	let scrollFrame: number | undefined;
	let scrollAnimationFrame: number | undefined;
	let scrollSettleTimeout: ReturnType<typeof setTimeout> | undefined;
	let programmaticScrollTimeout: ReturnType<typeof setTimeout> | undefined;

	let availableYears = $derived(getExpandedMapYears(maps));
	let earliestYear = $derived(availableYears[0] ?? selectedYear);
	let latestYear = $derived(availableYears.at(-1) ?? selectedYear);
	let sliderMinYear = $derived(Math.floor(earliestYear / scaleInterval) * scaleInterval);
	let sliderMaxYear = $derived(Math.ceil(latestYear / scaleInterval) * scaleInterval);

	let spacerHeight = $derived(Math.max(0, containerHeight / 2 - yearRowHeight / 2));
	let pickerSurfaceClass = $derived(navPosition === 'right' ? 'right-0' : 'left-0');
	let availabilityRailClass = $derived(navPosition === 'right' ? 'right-3' : 'left-3');
	let annotationsInViewSet = $derived(new Set(annotationsInView));
	let inViewMaps = $derived(maps.filter((map) => annotationsInViewSet.has(map.annotation)));
	let inViewAvailableYears = $derived(getExpandedMapYears(inViewMaps));
	let selectableMaps = $derived(inViewOnly && inViewAvailableYears.length > 0 ? inViewMaps : maps);
	let selectableYears = $derived(
		inViewOnly && inViewAvailableYears.length > 0 ? inViewAvailableYears : availableYears
	);
	let pickerYears = $derived(
		showOnlyAvailableYears ? selectableYears : getPickerYears(sliderMinYear, sliderMaxYear)
	);
	let availableYearSet = $derived(new Set(selectableYears));
	let mapYearTickYears = $derived(inViewOnly ? inViewAvailableYears : availableYears);
	let mapYearAvailabilitySegments = $derived(getAvailabilitySegments(mapYearTickYears));
	let showAvailabilityRail = $derived(
		showMapYearTicks && !showOnlyAvailableYears && mapYearAvailabilitySegments.length > 0
	);
	let displayedYear = $derived(previewYear ?? selectedYear);

	onMount(() => {
		updateContainerHeight();

		const resizeObserver = new ResizeObserver(updateContainerHeight);
		if (container) {
			resizeObserver.observe(container);
		}

		return () => {
			resizeObserver.disconnect();
			clearScrollFrame();
			clearScrollAnimation();
			clearScrollSettleTimeout();
			clearProgrammaticScrollTimeout();
		};
	});

	$effect(() => {
		if (
			(snapToAvailableYear || showOnlyAvailableYears) &&
			selectableYears.length > 0 &&
			!selectableYears.includes(selectedYear)
		) {
			selectedYear = closestYear(selectedYear, selectableYears);
		}
	});

	$effect(() => {
		if (pickerYears.length === 0) return;

		const targetYear = getClosestPickerYear(selectedYear);
		if (targetYear !== selectedYear) {
			selectedYear = targetYear;
		}
	});

	$effect(() => {
		if (!container || containerHeight <= 0 || pickerYears.length === 0 || isInteracting) return;

		const yearToScroll = selectedYear;
		const currentSpacerHeight = spacerHeight;

		tick().then(() => {
			if (currentSpacerHeight !== spacerHeight || yearToScroll !== selectedYear) return;

			scrollToYear(yearToScroll, hasInitializedScroll ? 'smooth' : 'auto');
		});
	});

	function isScaleYear(year: number) {
		return (year - sliderMinYear) % scaleInterval === 0;
	}

	function isCenturyYear(year: number) {
		return year % 100 === 0;
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

	function updateContainerHeight() {
		containerHeight = container?.clientHeight ?? 0;
	}

	function getPickerYears(minYear: number, maxYear: number) {
		const start = Math.min(minYear, maxYear);
		const end = Math.max(minYear, maxYear);

		return Array.from({ length: end - start + 1 }, (_, index) => start + index);
	}

	function hasOpenModal() {
		return (
			document.body.classList.contains('driver-active') ||
			!!document.querySelector('[role="dialog"][aria-modal="true"]')
		);
	}

	function selectRelativeYear(direction: -1 | 1) {
		if (selectableYears.length === 0) return;

		const currentAnnotationKey = getAnnotationKeyForYear(selectedYear);
		const candidateYears =
			direction === 1
				? selectableYears.filter((year) => year > selectedYear)
				: selectableYears.filter((year) => year < selectedYear).reverse();
		const boundaryYear = direction === 1 ? selectableYears.at(-1) : selectableYears[0];
		const nextYear =
			candidateYears.find((year) => getAnnotationKeyForYear(year) !== currentAnnotationKey) ??
			boundaryYear ??
			selectedYear;

		if (nextYear !== undefined) {
			previewYear = getCenteredYear();
			selectedYear = nextYear;
		}
	}

	function selectYear(year: number) {
		isInteracting = false;
		previewYear = getCenteredYear();
		selectedYear =
			(snapToAvailableYear || showOnlyAvailableYears) && selectableYears.length > 0
				? closestYear(year, selectableYears)
				: year;
		scrollToYear(selectedYear, 'smooth');
	}

	function getAnnotationKeyForYear(year: number) {
		return [
			...new Set(
				selectableMaps.filter((map) => mapIncludesYear(map, year)).map((map) => map.annotation)
			)
		]
			.sort()
			.join('\n');
	}

	function getAvailabilitySegments(years: number[]): AvailabilitySegment[] {
		const sortedYears = [...new Set(years)].sort((a, b) => a - b);
		const segments: AvailabilitySegment[] = [];

		for (const year of sortedYears) {
			const previousSegment = segments.at(-1);
			if (previousSegment && year === previousSegment.end + 1) {
				previousSegment.end = year;
			} else {
				segments.push({ start: year, end: year });
			}
		}

		return segments;
	}

	function getAvailabilitySegmentStyle(segment: AvailabilitySegment) {
		const startIndex = Math.max(0, segment.start - sliderMinYear);
		const endIndex = Math.max(startIndex, segment.end - sliderMinYear);
		const top = spacerHeight + startIndex * yearRowHeight;
		const height = Math.max((endIndex - startIndex + 1) * yearRowHeight, 3);

		return `top: ${top}px; height: ${height}px;`;
	}

	function closestYear(year: number, years: number[]) {
		return years.reduce((closest, candidate) =>
			Math.abs(candidate - year) < Math.abs(closest - year) ? candidate : closest
		);
	}

	function getClosestPickerYear(year: number) {
		if (pickerYears.length === 0) return year;
		if (pickerYears.includes(year)) return year;

		return closestYear(year, pickerYears);
	}

	function getCenteredYear() {
		if (!container || pickerYears.length === 0) return selectedYear;

		const index = Math.round(container.scrollTop / yearRowHeight);
		const clampedIndex = Math.min(Math.max(index, 0), pickerYears.length - 1);

		return pickerYears[clampedIndex] ?? selectedYear;
	}

	function prefersReducedMotion() {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function easeOutCubic(progress: number) {
		return 1 - Math.pow(1 - progress, 3);
	}

	function scrollToYear(year: number, behavior: ScrollMode) {
		if (!container || pickerYears.length === 0) return;

		const targetYear = getClosestPickerYear(year);
		const index = pickerYears.indexOf(targetYear);
		if (index < 0) return;

		const top = index * yearRowHeight;

		hasInitializedScroll = true;
		if (Math.abs(container.scrollTop - top) < 1) return;

		isProgrammaticScroll = true;
		clearScrollAnimation();
		clearProgrammaticScrollTimeout();

		if (behavior === 'auto' || prefersReducedMotion()) {
			container.scrollTop = top;
			releaseProgrammaticScroll();
			return;
		}

		animateScrollTo(top);
	}

	function animateScrollTo(targetTop: number) {
		if (!container) return;

		const startTop = container.scrollTop;
		const distance = targetTop - startTop;
		const startTime = performance.now();

		const step = (timestamp: number) => {
			if (!container) {
				scrollAnimationFrame = undefined;
				isProgrammaticScroll = false;
				return;
			}

			const progress = Math.min((timestamp - startTime) / snapScrollDuration, 1);

			container.scrollTop = startTop + distance * easeOutCubic(progress);

			if (progress < 1) {
				scrollAnimationFrame = requestAnimationFrame(step);
				return;
			}

			container.scrollTop = targetTop;
			scrollAnimationFrame = undefined;
			releaseProgrammaticScroll();
		};

		scrollAnimationFrame = requestAnimationFrame(step);
	}

	function releaseProgrammaticScroll() {
		clearProgrammaticScrollTimeout();
		programmaticScrollTimeout = setTimeout(() => {
			isProgrammaticScroll = false;
		}, programmaticScrollReleaseDelay);
	}

	function updatePreviewYearFromScroll() {
		const year = getCenteredYear();

		if (year !== previewYear) {
			previewYear = year;
		}
	}

	function handlePickerInteraction() {
		isInteracting = true;
		previewYear = getCenteredYear();
		isProgrammaticScroll = false;
		clearScrollAnimation();
		clearProgrammaticScrollTimeout();
	}

	function handleScroll() {
		clearScrollFrame();
		scrollFrame = requestAnimationFrame(() => {
			scrollFrame = undefined;

			updatePreviewYearFromScroll();
		});

		clearScrollSettleTimeout();
		scrollSettleTimeout = setTimeout(handleScrollSettled, scrollSettleDelay);
	}

	function handleScrollSettled() {
		const centeredYear = getCenteredYear();
		const nextYear =
			(snapToAvailableYear || showOnlyAvailableYears) && selectableYears.length > 0
				? closestYear(centeredYear, selectableYears)
				: centeredYear;

		isInteracting = false;

		if (nextYear !== selectedYear) {
			selectedYear = nextYear;
		}

		if (!isProgrammaticScroll) {
			previewYear = nextYear === centeredYear ? undefined : centeredYear;
			scrollToYear(nextYear, 'smooth');
		} else {
			previewYear = undefined;
		}
	}

	function clearScrollFrame() {
		if (scrollFrame === undefined) return;

		cancelAnimationFrame(scrollFrame);
		scrollFrame = undefined;
	}

	function clearScrollAnimation() {
		if (scrollAnimationFrame === undefined) return;

		cancelAnimationFrame(scrollAnimationFrame);
		scrollAnimationFrame = undefined;
	}

	function clearScrollSettleTimeout() {
		if (!scrollSettleTimeout) return;

		clearTimeout(scrollSettleTimeout);
		scrollSettleTimeout = undefined;
	}

	function clearProgrammaticScrollTimeout() {
		if (!programmaticScrollTimeout) return;

		clearTimeout(programmaticScrollTimeout);
		programmaticScrollTimeout = undefined;
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (!enableKeyboardShortcut || event.repeat) return;
		if (hasOpenModal()) return;
		if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
		if (isEditableTarget(event.target)) return;

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			event.stopImmediatePropagation();
			selectRelativeYear(-1);
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			event.stopImmediatePropagation();
			selectRelativeYear(1);
		}
	}
</script>

<svelte:window onkeydowncapture={handleGlobalKeydown} />

<aside class="time-slider z-20 flex h-full flex-none flex-col font-bolder text-gray-800">
	<div class="year-picker-shell relative min-h-0 w-28 flex-1">
		<div
			data-time-slider-surface
			class="year-picker-surface pointer-events-none absolute inset-y-0 z-0 w-full bg-transparent {pickerSurfaceClass}"
			aria-hidden="true"
		></div>

		<div
			class="year-picker-center pointer-events-none absolute top-1/2 right-1.5 left-1.5 z-10 h-10 -translate-y-1/2 rounded-sm border border-gray-800 bg-brand-main shadow-md"
			aria-hidden="true"
		></div>

		<div
			bind:this={container}
			data-tour="time-slider"
			class="year-picker-scroll relative z-20 h-full overflow-y-auto overscroll-contain pr-1 pl-1 select-none"
			role="listbox"
			aria-label="Year picker"
			tabindex="-1"
			onscroll={handleScroll}
			onpointerdown={handlePickerInteraction}
			onwheel={handlePickerInteraction}
			ontouchstart={handlePickerInteraction}
		>
			<div class="year-picker-content relative">
				<div style:height={`${spacerHeight}px`} aria-hidden="true"></div>
				{#if showAvailabilityRail}
					<div
						class="year-picker-availability-rail pointer-events-none absolute top-0 z-0 w-1.5 {availabilityRailClass}"
						aria-hidden="true"
					>
						{#each mapYearAvailabilitySegments as segment (`${segment.start}-${segment.end}`)}
							<span
								class="absolute left-0 w-full rounded-full bg-brand-main/70"
								style={getAvailabilitySegmentStyle(segment)}
							></span>
						{/each}
					</div>
				{/if}

				{#each pickerYears as year (year)}
					<button
						type="button"
						role="option"
						aria-selected={year === displayedYear}
						aria-label={`${year}${availableYearSet.has(year) ? ', map available' : ''}`}
						tabindex={year === displayedYear ? 0 : -1}
						onclick={() => selectYear(year)}
						class="year-picker-row relative z-10 flex w-full cursor-pointer items-center justify-center rounded-sm px-3 text-center leading-none transition {year ===
						displayedYear
							? 'text-white'
							: availableYearSet.has(year)
								? 'text-gray-900'
								: 'text-gray-500'}"
						class:year-picker-selected={year === displayedYear}
						class:year-picker-available={availableYearSet.has(year)}
						class:year-picker-scale-year={!showOnlyAvailableYears && isScaleYear(year)}
						class:year-picker-century={!showOnlyAvailableYears && isCenturyYear(year)}
						style:height={`${yearRowHeight}px`}
					>
						<span>{year}</span>
					</button>
				{/each}
				<div style:height={`${spacerHeight}px`} aria-hidden="true"></div>
			</div>
		</div>
	</div>
</aside>

<style>
	.time-slider {
		padding-bottom: 5rem;
		transition: padding-bottom 240ms ease;
		will-change: padding-bottom;
	}

	.year-picker-scroll {
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-y;
		mask-image: linear-gradient(to bottom, transparent 0%, black 26%, black 74%, transparent 100%);
	}

	.year-picker-scroll::-webkit-scrollbar {
		display: none;
	}

	.year-picker-row {
		font-family: var(--font-noto);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0;
		transition:
			color 160ms ease,
			font-size 160ms ease,
			text-shadow 160ms ease;
	}

	.year-picker-row.year-picker-available {
		font-weight: 700;
	}

	.year-picker-row.year-picker-scale-year {
		font-family: var(--font-noto);
		font-size: 0.82rem;
	}

	.year-picker-row.year-picker-century {
		font-family: var(--font-heading);
		font-size: 0.95rem;
		font-weight: 700;
	}

	.year-picker-row.year-picker-selected {
		font-family: var(--font-heading);
		font-size: 1.25rem;
		font-weight: 700;
		text-shadow: 0 1px 1px rgb(0 0 0 / 0.18);
	}

	.year-picker-surface {
		background-color: rgb(255 255 255 / 0.8);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 240ms ease,
			visibility 0s linear 240ms;
	}

	.year-picker-availability-rail {
		display: none;
	}

	@container map-pane (min-width: 48rem) {
		.time-slider {
			padding-bottom: 0;
		}

		.year-picker-surface {
			opacity: 1;
			visibility: visible;
			transition: opacity 240ms ease;
		}

		.year-picker-availability-rail {
			display: block;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.time-slider,
		.year-picker-surface,
		.year-picker-row {
			transition: none;
		}
	}
</style>
