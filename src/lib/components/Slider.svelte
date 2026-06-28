<script lang="ts">
	import { Slider as BitsSlider } from 'bits-ui';
	import { ChevronsUpDown } from '@lucide/svelte';
	import { MapCollection } from '$lib/models/MapCollection';

	let {
		selectedYear = $bindable(),
		inViewOnly = $bindable(false),
		navPosition = 'left',
		showMapYearTicks = false,
		snapToAvailableYear = true,
		enableKeyboardShortcut = false,
		annotationsInView = []
	}: {
		selectedYear: number;
		inViewOnly?: boolean;
		navPosition?: 'left' | 'right';
		showMapYearTicks?: boolean;
		snapToAvailableYear?: boolean;
		enableKeyboardShortcut?: boolean;
		annotationsInView?: string[];
	} = $props();

	const collection = new MapCollection();
	const maps = collection.getAllMaps();
	const availableYears = [...new Set(maps.map((map) => map.metadata.year))].sort((a, b) => a - b);
	const earliestYear = availableYears[0] ?? selectedYear;
	const latestYear = availableYears.at(-1) ?? selectedYear;
	const scaleInterval = 25;
	const sliderMinYear = Math.floor(earliestYear / scaleInterval) * scaleInterval;
	const sliderMaxYear = Math.ceil(latestYear / scaleInterval) * scaleInterval;

	let thumbClass = $derived(
		navPosition === 'right' ? 'right-0 rounded-l-sm border-r-0' : 'left-0 rounded-r-sm border-l-0'
	);
	let sliderSurfaceClass = $derived(navPosition === 'right' ? 'right-0' : 'left-0');
	let tickClass = $derived(navPosition === 'right' ? 'right-3' : 'left-3');
	let yearLabelClass = $derived(navPosition === 'right' ? 'mr-10' : 'ml-10');
	let annotationsInViewSet = $derived(new Set(annotationsInView));
	let inViewAvailableYears = $derived(
		[
			...new Set(
				maps
					.filter((map) => annotationsInViewSet.has(map.metadata.annotation))
					.map((map) => map.metadata.year)
			)
		].sort((a, b) => a - b)
	);
	let selectableYears = $derived(
		inViewOnly && inViewAvailableYears.length > 0 ? inViewAvailableYears : availableYears
	);
	let mapYearTickYears = $derived(inViewOnly ? inViewAvailableYears : availableYears);

	$effect(() => {
		if (
			snapToAvailableYear &&
			selectableYears.length > 0 &&
			!selectableYears.includes(selectedYear)
		) {
			selectedYear = closestYear(selectedYear, selectableYears);
		}
	});

	function isAvailableYear(year: number) {
		return mapYearTickYears.includes(year);
	}

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

	function selectRelativeYear(direction: -1 | 1) {
		if (selectableYears.length === 0) return;

		const nextYear =
			direction === 1
				? (selectableYears.find((year) => year > selectedYear) ?? selectableYears.at(-1))
				: ([...selectableYears].reverse().find((year) => year < selectedYear) ??
					selectableYears[0]);

		if (nextYear !== undefined) {
			selectedYear = nextYear;
		}
	}

	function closestYear(year: number, years: number[]) {
		return years.reduce((closest, candidate) =>
			Math.abs(candidate - year) < Math.abs(closest - year) ? candidate : closest
		);
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (!enableKeyboardShortcut || event.repeat) return;
		if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
		if (isEditableTarget(event.target)) return;

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectRelativeYear(1);
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectRelativeYear(-1);
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

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
			trackPadding={5}
		>
			{#snippet children({ tickItems })}
				<span
					class="time-slider-surface absolute z-5 h-full w-24 cursor-pointer overflow-hidden bg-transparent {sliderSurfaceClass}"
				>
					<BitsSlider.Range class="absolute w-full" />
				</span>

				<BitsSlider.Thumb
					index={0}
					class="absolute z-20 grid h-9 w-26 cursor-pointer justify-items-center border border-gray-800 bg-green-700 text-white shadow-md focus-visible:outline-none {thumbClass}"
				>
					<div class="flex items-center text-lg font-bold">
						{selectedYear}
						<ChevronsUpDown class="ml-1" size={16} />
					</div>
				</BitsSlider.Thumb>

				{#each tickItems as { index, value } (index)}
					{#if value % 5 === 0}
						<BitsSlider.Tick
							{index}
							class="time-slider-tick absolute z-10 h-0.5 w-2 bg-gray-400 {tickClass}"
						/>
					{/if}

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

				{#if showMapYearTicks}
					{#each tickItems as { index, value } (index)}
						{#if isAvailableYear(value)}
							<BitsSlider.Tick
								{index}
								class="time-slider-map-year-tick absolute z-10 h-1 w-12 bg-green-700/25 {tickClass}"
							/>
						{/if}
					{/each}
				{/if}
			{/snippet}
		</BitsSlider.Root>
	</div>
</aside>

<style>
	.time-slider-surface,
	:global(.time-slider-tick),
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

		:global(.time-slider-tick),
		:global(.time-slider-label) {
			display: flex;
		}

		:global(.time-slider-map-year-tick) {
			width: 4rem;
		}
	}
</style>
