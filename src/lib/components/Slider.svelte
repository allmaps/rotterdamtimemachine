<script lang="ts">
	import { Slider as BitsSlider } from 'bits-ui';
	import { ChevronsUpDown } from '@lucide/svelte';
	import { getExpandedMapYears, mapIncludesYear } from '$lib/map-years';
	import type { MapMetadata } from '$lib/types';

	type AvailabilitySegment = {
		start: number;
		end: number;
	};

	const sliderTrackPadding = 5;

	let {
		maps,
		selectedYear = $bindable(),
		inViewOnly = $bindable(false),
		navPosition = 'left',
		showMapYearTicks = false,
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
		snapToAvailableYear?: boolean;
		scaleInterval?: number;
		enableKeyboardShortcut?: boolean;
		annotationsInView?: string[];
	} = $props();

	let availableYears = $derived(getExpandedMapYears(maps));
	let earliestYear = $derived(availableYears[0] ?? selectedYear);
	let latestYear = $derived(availableYears.at(-1) ?? selectedYear);
	let sliderMinYear = $derived(Math.floor(earliestYear / scaleInterval) * scaleInterval);
	let sliderMaxYear = $derived(Math.ceil(latestYear / scaleInterval) * scaleInterval);

	let thumbClass = $derived(
		navPosition === 'right' ? 'right-0 rounded-l-sm border-r-0' : 'left-0 rounded-r-sm border-l-0'
	);
	let sliderSurfaceClass = $derived(navPosition === 'right' ? 'right-0' : 'left-0');
	let availabilityRailClass = $derived(navPosition === 'right' ? 'right-3' : 'left-3');
	let yearLabelClass = $derived(navPosition === 'right' ? 'mr-10' : 'ml-10');
	let annotationsInViewSet = $derived(new Set(annotationsInView));
	let inViewMaps = $derived(maps.filter((map) => annotationsInViewSet.has(map.annotation)));
	let inViewAvailableYears = $derived(getExpandedMapYears(inViewMaps));
	let selectableMaps = $derived(inViewOnly && inViewAvailableYears.length > 0 ? inViewMaps : maps);
	let selectableYears = $derived(
		inViewOnly && inViewAvailableYears.length > 0 ? inViewAvailableYears : availableYears
	);
	let mapYearTickYears = $derived(inViewOnly ? inViewAvailableYears : availableYears);
	let mapYearAvailabilitySegments = $derived(getAvailabilitySegments(mapYearTickYears));

	$effect(() => {
		if (
			snapToAvailableYear &&
			selectableYears.length > 0 &&
			!selectableYears.includes(selectedYear)
		) {
			selectedYear = closestYear(selectedYear, selectableYears);
		}
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
			selectedYear = nextYear;
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

	function getYearTopPositionPercent(year: number) {
		const range = sliderMaxYear - sliderMinYear;
		if (range <= 0) return 50;

		const trackRange = 100 - sliderTrackPadding * 2;
		const bottomPosition = sliderTrackPadding + ((year - sliderMinYear) / range) * trackRange;

		return 100 - bottomPosition;
	}

	function getAvailabilitySegmentStyle(segment: AvailabilitySegment) {
		const top = getYearTopPositionPercent(segment.end);
		const bottom = getYearTopPositionPercent(segment.start);
		const height = Math.max(0, bottom - top);
		const minHeightOffset = height === 0 ? '1.5px' : '0px';

		return `top: calc(${top}% - ${minHeightOffset}); height: max(${height}%, 3px);`;
	}

	function closestYear(year: number, years: number[]) {
		return years.reduce((closest, candidate) =>
			Math.abs(candidate - year) < Math.abs(closest - year) ? candidate : closest
		);
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (!enableKeyboardShortcut || event.repeat) return;
		if (hasOpenModal()) return;
		if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
		if (isEditableTarget(event.target)) return;

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			event.stopImmediatePropagation();
			selectRelativeYear(1);
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			event.stopImmediatePropagation();
			selectRelativeYear(-1);
		}
	}
</script>

<svelte:window onkeydowncapture={handleGlobalKeydown} />

<aside class="time-slider z-20 flex h-full flex-none flex-col pb-20 font-bolder text-gray-800">
	<div class="relative min-h-0 flex-1">
		<BitsSlider.Root
			type="single"
			bind:value={selectedYear}
			min={sliderMinYear}
			max={sliderMaxYear}
			step={1}
			orientation="vertical"
			class="relative flex h-full w-full touch-none flex-col select-none"
			trackPadding={sliderTrackPadding}
		>
			{#snippet children({ tickItems })}
				<span
					data-time-slider-surface
					class="time-slider-surface absolute z-5 h-full w-24 cursor-pointer overflow-hidden bg-transparent {sliderSurfaceClass}"
				>
					<BitsSlider.Range class="absolute w-full" />
				</span>

				<BitsSlider.Thumb
					index={0}
					data-tour="time-slider"
					class="absolute z-20 grid h-9 w-26 cursor-pointer justify-items-center border border-gray-800 bg-brand-main text-white shadow-md focus-visible:outline-none {thumbClass}"
				>
					<div class="flex items-center text-lg font-bold">
						{selectedYear}
						<ChevronsUpDown class="ml-1" size={16} />
					</div>
				</BitsSlider.Thumb>

				{#if showMapYearTicks && mapYearAvailabilitySegments.length > 0}
					<div
						class="time-slider-availability-rail pointer-events-none absolute top-0 bottom-0 z-10 w-1.5 {availabilityRailClass}"
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

				{#each tickItems as { index, value } (index)}
					{#if isScaleYear(value)}
						<BitsSlider.TickLabel
							{index}
							position={navPosition === 'right' ? 'left' : 'right'}
							class="time-slider-label z-5 leading-none {isCenturyYear(value)
								? 'font-heading text-sm font-bold text-gray-950'
								: 'font-noto text-xs font-semibold text-gray-500'} {yearLabelClass}"
						>
							{value}
						</BitsSlider.TickLabel>
					{/if}
				{/each}
			{/snippet}
		</BitsSlider.Root>
	</div>
</aside>

<style>
	.time-slider-surface,
	.time-slider-availability-rail,
	:global(.time-slider-label) {
		display: none;
	}

	@container map-pane (min-width: 48rem) {
		.time-slider {
			padding-bottom: 0;
		}

		.time-slider-surface {
			display: inline;
			background-color: rgb(255 255 255 / 0.8);
		}

		.time-slider-availability-rail {
			display: block;
		}

		:global(.time-slider-label) {
			display: flex;
		}
	}
</style>
