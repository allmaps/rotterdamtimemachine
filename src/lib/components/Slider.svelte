<script lang="ts">
	import { Slider as BitsSlider } from 'bits-ui';
	import { ChevronsUpDown } from '@lucide/svelte';
	import { MapCollection } from '$lib/models/MapCollection';

	let {
		selectedYear = $bindable(),
		navPosition = 'left'
	}: {
		selectedYear: number;
		navPosition?: 'left' | 'right';
	} = $props();

	const collection = new MapCollection();
	const maps = collection.getAllMaps();
	const availableYears = [...new Set(maps.map((map) => map.metadata.year))].sort((a, b) => a - b);
	const earliestYear = availableYears[0] ?? selectedYear;
	const latestYear = availableYears.at(-1) ?? selectedYear;

	let borderClass = $derived(
		navPosition === 'right' ? 'border-l border-r-0' : 'border-r border-l-0'
	);
	let thumbClass = $derived(
		navPosition === 'right'
			? 'right-0 rounded-l-sm border-r-0 pr-4'
			: 'left-0 rounded-r-sm border-l-0 pl-4'
	);
	let tickClass = $derived(navPosition === 'right' ? 'right-2' : 'left-2');
	let yearLabelClass = $derived(navPosition === 'right' ? '-mr-13' : '-ml-13');

	function isAvailableYear(year: number) {
		return availableYears.includes(year);
	}
</script>

<aside
	class="z-20 flex h-full w-22 flex-none flex-col bg-transparent font-bolder text-gray-800 md:w-28 md:bg-gray-50 {borderClass} border-transparent md:border-gray-200"
>
	<div class="hidden border-b border-gray-200 px-2 py-2 text-center md:block">
		<p class="text-[0.65rem] leading-none font-bold tracking-widest text-gray-500 uppercase">
			Jaar
		</p>
	</div>

	<div class="relative min-h-0 flex-1">
		<BitsSlider.Root
			type="single"
			bind:value={selectedYear}
			min={earliestYear}
			max={latestYear}
			step={1}
			orientation="vertical"
			class="relative flex h-full w-full touch-none flex-col select-none"
			trackPadding={3}
		>
			{#snippet children({ tickItems })}
				<span
					class="absolute z-5 hidden h-full w-full cursor-pointer overflow-hidden bg-gray-100 md:flex"
				>
					<BitsSlider.Range class="absolute w-full bg-green-700/15" />
				</span>

				<BitsSlider.Thumb
					index={0}
					class="absolute z-20 flex h-9 w-22 cursor-pointer items-center border border-gray-800 bg-green-700 text-white shadow-md focus-visible:outline-none md:w-24 {thumbClass}"
				>
					<span class="flex items-center text-lg font-bold">
						{selectedYear}
						<ChevronsUpDown class="ml-1" size={16} />
					</span>
				</BitsSlider.Thumb>

				{#each tickItems as { index, value } (index)}
					{#if value % 5 === 0}
						<BitsSlider.Tick
							{index}
							class="absolute z-10 hidden h-0.5 w-2 bg-gray-400 md:flex {tickClass}"
						/>
					{/if}

					{#if value % 25 === 0 || value === latestYear || value === earliestYear}
						<BitsSlider.TickLabel
							{index}
							position={navPosition === 'right' ? 'left' : 'right'}
							class="z-5 hidden text-xs leading-none font-semibold text-gray-500 md:flex {yearLabelClass}"
						>
							{value}
						</BitsSlider.TickLabel>
					{/if}
				{/each}

				{#each tickItems as { index, value } (index)}
					{#if isAvailableYear(value)}
						<BitsSlider.Tick
							{index}
							class="absolute z-10 h-1 w-16 bg-green-700/25 md:w-22 {tickClass}"
						/>
					{/if}
				{/each}
			{/snippet}
		</BitsSlider.Root>
	</div>
</aside>
