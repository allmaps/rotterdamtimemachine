<script lang="ts">
	import { Slider as BitsSlider } from 'bits-ui';
	import { ChevronsUpDown } from '@lucide/svelte';
	import { MapCollection } from '$lib/models/MapCollection';

	let {
		selectedYear = $bindable(),
		navPosition = 'left',
		showMapYearTicks = false
	}: {
		selectedYear: number;
		navPosition?: 'left' | 'right';
		showMapYearTicks?: boolean;
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

	function isAvailableYear(year: number) {
		return availableYears.includes(year);
	}

	function isScaleYear(year: number) {
		return (year - sliderMinYear) % scaleInterval === 0;
	}

	function isCenturyYear(year: number) {
		return year % 100 === 0;
	}
</script>

<aside class="z-20 flex h-full flex-none flex-col font-bolder text-gray-800">
	<div class="relative min-h-0 flex-1 pb-20 md:pb-0">
		<BitsSlider.Root
			type="single"
			bind:value={selectedYear}
			min={sliderMinYear}
			max={sliderMaxYear}
			step={1}
			orientation="vertical"
			class="relative flex h-full w-full touch-none flex-col select-none"
			trackPadding={3}
		>
			{#snippet children({ tickItems })}
				<span
					class="absolute z-5 h-full w-24 cursor-pointer overflow-hidden bg-transparent md:bg-white/80 {sliderSurfaceClass}"
				>
					<BitsSlider.Range class="w-ful absolute" />
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
							class="absolute z-10 hidden h-0.5 w-2 bg-gray-400 md:flex {tickClass}"
						/>
					{/if}

					{#if isScaleYear(value)}
						<BitsSlider.TickLabel
							{index}
							position={navPosition === 'right' ? 'left' : 'right'}
							class="z-5 hidden leading-none md:flex {isCenturyYear(value)
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
								class="absolute z-10 h-1 w-12 bg-green-700/25 md:w-16 {tickClass}"
							/>
						{/if}
					{/each}
				{/if}
			{/snippet}
		</BitsSlider.Root>
	</div>
</aside>
