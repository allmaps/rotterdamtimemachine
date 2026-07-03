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
	const snapScrollDuration = 260;
	const keyboardScrollDuration = 260;
	const programmaticScrollReleaseDelay = scrollSettleDelay + 40;
	const dragClickThreshold = 4;

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
	let isDraggingScale = $state(false);
	let isProgrammaticScroll = false;
	let hasInitializedScroll = false;
	let activeDragPointerId: number | undefined;
	let dragStartY = 0;
	let dragStartScrollTop = 0;
	let hasDraggedScale = false;
	let suppressNextYearClick = false;
	let pendingTargetYear: number | undefined;
	let pendingSelectionId = 0;
	let scrollAnimationFrame: number | undefined;
	let finishInteractionFrame: number | undefined;
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
	let visuallySelectedYear = $derived(isInteracting ? undefined : selectedYear);

	onMount(() => {
		updateContainerHeight();

		const resizeObserver = new ResizeObserver(updateContainerHeight);
		if (container) {
			resizeObserver.observe(container);
		}

		return () => {
			resizeObserver.disconnect();
			clearScrollAnimation();
			clearFinishInteractionFrame();
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

	function getRelativeYear(year: number, direction: -1 | 1) {
		if (selectableYears.length === 0) return;

		const currentAnnotationKey = getAnnotationKeyForYear(year);
		const candidateYears =
			direction === 1
				? selectableYears.filter((selectableYear) => selectableYear > year)
				: selectableYears.filter((selectableYear) => selectableYear < year).reverse();
		const boundaryYear = direction === 1 ? selectableYears.at(-1) : selectableYears[0];

		return (
			candidateYears.find((year) => getAnnotationKeyForYear(year) !== currentAnnotationKey) ??
			boundaryYear ??
			year
		);
	}

	function selectRelativeYear(direction: -1 | 1) {
		const currentYear = pendingTargetYear ?? selectedYear;
		const nextYear = getRelativeYear(currentYear, direction);

		if (nextYear !== undefined && nextYear !== currentYear) {
			selectYearAfterScroll(nextYear, keyboardScrollDuration);
		}
	}

	function blurFocusedYear() {
		const activeElement = document.activeElement;

		if (activeElement instanceof HTMLElement && container?.contains(activeElement)) {
			activeElement.blur();
		}
	}

	function selectYear(year: number, event?: MouseEvent) {
		if (suppressNextYearClick) {
			event?.preventDefault();
			event?.stopPropagation();
			suppressNextYearClick = false;
			return;
		}

		const targetYear =
			(snapToAvailableYear || showOnlyAvailableYears) && selectableYears.length > 0
				? closestYear(year, selectableYears)
				: year;

		selectYearAfterScroll(targetYear, snapScrollDuration);
	}

	function selectYearAfterScroll(year: number, duration: number) {
		const selectionId = ++pendingSelectionId;

		pendingTargetYear = year;
		isInteracting = true;
		scrollToYear(
			year,
			'smooth',
			() => {
				if (selectionId !== pendingSelectionId || pendingTargetYear !== year) return;

				selectedYear = year;
				pendingTargetYear = undefined;
				finishPickerInteraction();
			},
			duration
		);
	}

	function selectSettledYear(year: number) {
		if (year !== selectedYear) {
			selectedYear = year;
		}
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

	function scrollToYear(
		year: number,
		behavior: ScrollMode,
		onComplete?: () => void,
		duration = snapScrollDuration
	) {
		if (!container || pickerYears.length === 0) {
			onComplete?.();
			return;
		}

		const targetYear = getClosestPickerYear(year);
		const index = pickerYears.indexOf(targetYear);
		if (index < 0) {
			onComplete?.();
			return;
		}

		const top = index * yearRowHeight;

		hasInitializedScroll = true;
		if (Math.abs(container.scrollTop - top) < 1) {
			onComplete?.();
			return;
		}

		isProgrammaticScroll = true;
		clearScrollAnimation();
		clearScrollSettleTimeout();
		clearProgrammaticScrollTimeout();

		if (behavior === 'auto' || prefersReducedMotion()) {
			container.scrollTop = top;
			onComplete?.();
			releaseProgrammaticScroll();
			return;
		}

		animateScrollTo(top, onComplete, duration);
	}

	function animateScrollTo(
		targetTop: number,
		onComplete?: () => void,
		duration = snapScrollDuration
	) {
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

			const progress = Math.min((timestamp - startTime) / duration, 1);

			container.scrollTop = startTop + distance * easeOutCubic(progress);

			if (progress < 1) {
				scrollAnimationFrame = requestAnimationFrame(step);
				return;
			}

			container.scrollTop = targetTop;
			scrollAnimationFrame = undefined;
			onComplete?.();
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

	function handlePickerInteraction() {
		pendingTargetYear = undefined;
		pendingSelectionId += 1;
		isInteracting = true;
		isProgrammaticScroll = false;
		clearFinishInteractionFrame();
		clearScrollAnimation();
		clearProgrammaticScrollTimeout();
	}

	function finishPickerInteraction() {
		clearFinishInteractionFrame();
		finishInteractionFrame = requestAnimationFrame(() => {
			isInteracting = false;
			finishInteractionFrame = undefined;
		});
	}

	function queueScrollSettled() {
		clearScrollSettleTimeout();
		scrollSettleTimeout = setTimeout(handleScrollSettled, scrollSettleDelay);
	}

	function handlePickerWheel() {
		handlePickerInteraction();
		queueScrollSettled();
	}

	function handlePickerTouchEnd() {
		queueScrollSettled();
	}

	function handlePickerPointerDown(event: PointerEvent) {
		handlePickerInteraction();

		if (!container || event.pointerType === 'touch' || event.button !== 0) return;

		activeDragPointerId = event.pointerId;
		dragStartY = event.clientY;
		dragStartScrollTop = container.scrollTop;
		hasDraggedScale = false;
	}

	function handlePickerPointerMove(event: PointerEvent) {
		if (!container || activeDragPointerId !== event.pointerId) return;

		const offsetY = event.clientY - dragStartY;
		if (Math.abs(offsetY) > dragClickThreshold) {
			hasDraggedScale = true;
			isDraggingScale = true;

			if (!container.hasPointerCapture(event.pointerId)) {
				container.setPointerCapture(event.pointerId);
			}
		}

		if (!hasDraggedScale) return;

		event.preventDefault();
		container.scrollTop = dragStartScrollTop - offsetY;
	}

	function handlePickerPointerEnd(event: PointerEvent) {
		if (activeDragPointerId !== event.pointerId) return;

		if (container?.hasPointerCapture(event.pointerId)) {
			container.releasePointerCapture(event.pointerId);
		}

		activeDragPointerId = undefined;
		isDraggingScale = false;

		if (!hasDraggedScale) {
			isInteracting = false;
			return;
		}

		event.preventDefault();
		suppressNextYearClick = true;
		window.setTimeout(() => {
			suppressNextYearClick = false;
		}, 0);

		clearScrollSettleTimeout();
		queueScrollSettled();
	}

	function handleScroll() {
		queueScrollSettled();
	}

	function handleScrollSettled() {
		if (isProgrammaticScroll) return;

		const centeredYear = getCenteredYear();
		const nextYear =
			(snapToAvailableYear || showOnlyAvailableYears) && selectableYears.length > 0
				? closestYear(centeredYear, selectableYears)
				: centeredYear;

		selectSettledYear(nextYear);

		scrollToYear(nextYear, 'smooth', finishPickerInteraction);
	}

	function clearScrollAnimation() {
		if (scrollAnimationFrame === undefined) return;

		cancelAnimationFrame(scrollAnimationFrame);
		scrollAnimationFrame = undefined;
	}

	function clearFinishInteractionFrame() {
		if (finishInteractionFrame === undefined) return;

		cancelAnimationFrame(finishInteractionFrame);
		finishInteractionFrame = undefined;
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
		if (!enableKeyboardShortcut) return;
		if (hasOpenModal()) return;
		if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
		if (isEditableTarget(event.target)) return;

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			event.stopImmediatePropagation();
			blurFocusedYear();
			selectRelativeYear(-1);
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			event.stopImmediatePropagation();
			blurFocusedYear();
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
			class="year-picker-scroll relative z-20 h-full overflow-y-auto overscroll-contain pr-1 pl-1 select-none {isDraggingScale
				? 'year-picker-dragging'
				: ''}"
			role="listbox"
			aria-label="Year picker"
			tabindex="-1"
			onscroll={handleScroll}
			onpointerdown={handlePickerPointerDown}
			onpointermove={handlePickerPointerMove}
			onpointerup={handlePickerPointerEnd}
			onpointercancel={handlePickerPointerEnd}
			onwheel={handlePickerWheel}
			ontouchstart={handlePickerInteraction}
			ontouchend={handlePickerTouchEnd}
			ontouchcancel={handlePickerTouchEnd}
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
						aria-selected={year === selectedYear}
						aria-label={`${year}${availableYearSet.has(year) ? ', map available' : ''}`}
						tabindex={year === selectedYear ? 0 : -1}
						onclick={(event) => selectYear(year, event)}
						class="year-picker-row relative z-10 flex w-full cursor-pointer items-center justify-center rounded-sm px-3 text-center leading-none transition {year ===
						visuallySelectedYear
							? 'text-white'
							: availableYearSet.has(year)
								? 'text-gray-900'
								: 'text-gray-500'}"
						class:year-picker-selected={year === visuallySelectedYear}
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
		cursor: grab;
		mask-image: linear-gradient(to bottom, transparent 0%, black 26%, black 74%, transparent 100%);
	}

	.year-picker-scroll.year-picker-dragging {
		cursor: grabbing;
	}

	.year-picker-scroll::-webkit-scrollbar {
		display: none;
	}

	.year-picker-row {
		font-family: var(--font-noto);
		font-size: 0.82rem;
		font-weight: 600;
		letter-spacing: 0;
		cursor: inherit;
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
		font-size: 0.9rem;
	}

	.year-picker-row.year-picker-century {
		font-family: var(--font-heading);
		font-size: 1rem;
		font-weight: 700;
	}

	.year-picker-row:not(.year-picker-selected) {
		text-shadow:
			0 0 2px rgb(255 255 255 / 0.95),
			0 1px 4px rgb(255 255 255 / 0.75);
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

		.year-picker-row:not(.year-picker-selected) {
			text-shadow: none;
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
