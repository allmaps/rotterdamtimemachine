<script lang="ts">
	import { comparison } from '$lib/app-state.svelte.js';
	import Search from '$lib/components/Search.svelte';
	import { Columns2, Info, Pause, Play, Share2, Square } from '@lucide/svelte';
	import { fly } from 'svelte/transition';
	import type { AppConfig, GeocoderBounds } from '$lib/types';

	let {
		searchBounds,
		config,
		autoplayActive = false,
		autoplayPlaying = false,
		autoplayDisabled = false,
		autoplayCurrentPosition = 0,
		autoplayTotal = 0,
		autoplayIntervalSeconds = 0,
		onAboutOpen,
		onShareOpen,
		onAutoplayStart,
		onAutoplayPauseToggle,
		onAutoplayStop
	}: {
		searchBounds?: GeocoderBounds;
		config: AppConfig;
		autoplayActive?: boolean;
		autoplayPlaying?: boolean;
		autoplayDisabled?: boolean;
		autoplayCurrentPosition?: number;
		autoplayTotal?: number;
		autoplayIntervalSeconds?: number;
		onAboutOpen: () => void;
		onShareOpen: () => void;
		onAutoplayStart: () => void;
		onAutoplayPauseToggle: () => void;
		onAutoplayStop: () => void;
	} = $props();

	let autoplayEnabled = $derived(
		!!config.autoplay?.intervalSeconds && config.autoplay.intervalSeconds > 0
	);
	let autoplayProgressDuration = $derived(Math.max(0.1, autoplayIntervalSeconds));

	function toggleCompare() {
		comparison.active = !comparison.active;
	}
</script>

<header class="font-bolder {autoplayActive ? 'absolute inset-x-0 top-0 z-50' : ''}">
	<nav
		aria-label="Global"
		class="relative flex flex-none items-center justify-between gap-2 border-b text-white transition-colors {autoplayActive
			? 'border-transparent bg-transparent p-2'
			: 'border-brand-hover/20 bg-brand-main p-2 md:px-8'}"
	>
		{#if !autoplayActive}
			<div
				class="flex min-w-0 flex-1 items-center gap-2"
				transition:fly={{ x: -48, duration: 180 }}
			>
				<Search bounds={searchBounds} {config} />

				<button
					onclick={toggleCompare}
					data-tour="compare"
					aria-label={config.header.compareMode}
					aria-pressed={comparison.active}
					class="flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-sm font-semibold hover:bg-brand-hover md:px-3 {comparison.active
						? 'bg-brand-hover'
						: ''}"
				>
					<Columns2 class="h-4 w-4" />
					<span class="hidden md:inline"
						>{comparison.active ? config.header.closeCompare : config.header.compare}</span
					>
				</button>
			</div>

			<div
				class="relative flex flex-none justify-center px-1 text-center"
				transition:fly={{ y: -48, duration: 180 }}
			>
				<h1 class="font-heading text-lg leading-none font-bold select-none md:text-2xl">
					{config.site.name}
				</h1>
			</div>

			<div class="flex flex-1 justify-end gap-1 md:gap-2" transition:fly={{ x: 48, duration: 180 }}>
				<button
					onclick={onAboutOpen}
					aria-label={config.header.about}
					class="flex h-8 cursor-pointer items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-brand-hover md:px-3"
				>
					<Info class="h-4 w-4" />
					<span class="hidden sm:inline">{config.header.about}</span>
				</button>

				{#if autoplayEnabled}
					<button
						onclick={onAutoplayStart}
						disabled={autoplayDisabled}
						aria-label={config.header.play}
						title={config.header.play}
						class="flex h-8 cursor-pointer items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-45 md:px-3"
					>
						<Play class="h-4 w-4" />
						<span class="hidden sm:inline">{config.header.play}</span>
					</button>
				{/if}

				<button
					onclick={onShareOpen}
					aria-label={config.header.share}
					class="flex h-8 cursor-pointer items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-brand-hover md:px-3"
				>
					<Share2 class="h-4 w-4" />
					<span class="hidden sm:inline">{config.header.share}</span>
				</button>
			</div>
		{:else if autoplayEnabled}
			<div
				class="ml-auto flex h-9 overflow-hidden rounded-md border border-gray-200 bg-white text-gray-800 shadow-lg"
			>
				<button
					onclick={onAutoplayPauseToggle}
					disabled={autoplayDisabled}
					aria-label={autoplayPlaying ? config.header.pause : config.header.play}
					title={autoplayPlaying ? config.header.pause : config.header.play}
					aria-pressed={autoplayPlaying}
					class="flex h-9 w-9 cursor-pointer items-center justify-center border-r border-gray-200 transition hover:bg-gray-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-main disabled:cursor-not-allowed disabled:opacity-45"
				>
					{#if autoplayPlaying}
						<Pause class="h-4 w-4" />
					{:else}
						<Play class="h-4 w-4" />
					{/if}
				</button>

				<button
					onclick={onAutoplayStop}
					aria-label={config.header.stop}
					title={config.header.stop}
					class="flex h-9 w-9 cursor-pointer items-center justify-center border-r border-gray-200 transition hover:bg-gray-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-main"
				>
					<Square class="h-3.5 w-3.5 fill-current" />
				</button>

				{#if autoplayTotal > 0}
					<span
						aria-live="polite"
						class="flex h-9 min-w-14 flex-col items-center justify-center gap-0.5 px-2 font-heading text-xs font-bold tabular-nums"
					>
						<span class="leading-4">{autoplayCurrentPosition}/{autoplayTotal}</span>
						<span class="block h-0.5 w-full overflow-hidden rounded-full bg-gray-200">
							{#key autoplayCurrentPosition}
								<span
									class="autoplay-progress block h-full origin-left bg-brand-main"
									class:autoplay-progress-paused={!autoplayPlaying}
									style:animation-duration={`${autoplayProgressDuration}s`}
								></span>
							{/key}
						</span>
					</span>
				{/if}
			</div>
		{/if}
	</nav>
</header>

<style>
	.autoplay-progress {
		animation-name: autoplay-progress;
		animation-timing-function: linear;
		animation-fill-mode: forwards;
	}

	.autoplay-progress-paused {
		animation-play-state: paused;
	}

	@keyframes autoplay-progress {
		from {
			transform: scaleX(0);
		}

		to {
			transform: scaleX(1);
		}
	}
</style>
