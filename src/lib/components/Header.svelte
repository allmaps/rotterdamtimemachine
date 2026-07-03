<script lang="ts">
	import { comparison } from '$lib/app-state.svelte.js';
	import Search from '$lib/components/Search.svelte';
	import {
		Columns2,
		Info,
		Maximize2,
		Minimize2,
		Pause,
		Play,
		Share2,
		Square
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { AppConfig, GeocoderBounds } from '$lib/types';

	type FullscreenDocument = Document & {
		webkitExitFullscreen?: () => Promise<void> | void;
		webkitFullscreenElement?: Element | null;
		webkitFullscreenEnabled?: boolean;
	};
	type FullscreenElement = HTMLElement & {
		webkitRequestFullscreen?: () => Promise<void> | void;
	};

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
	let headerElement = $state<HTMLElement>();
	let fullscreenActive = $state(false);
	let fullscreenSupported = $state(false);
	let presentationToolbarClass = $derived(
		fullscreenSupported
			? 'grid-cols-[repeat(3,2.25rem)_4rem]'
			: 'grid-cols-[repeat(2,2.25rem)_4rem]'
	);
	const presentationControlButtonClass =
		'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center transition hover:bg-gray-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-main disabled:cursor-not-allowed disabled:opacity-45';

	onMount(() => {
		fullscreenSupported = getFullscreenSupported();
		syncFullscreenState();

		document.addEventListener('fullscreenchange', syncFullscreenState);
		document.addEventListener('webkitfullscreenchange', syncFullscreenState);

		return () => {
			document.removeEventListener('fullscreenchange', syncFullscreenState);
			document.removeEventListener('webkitfullscreenchange', syncFullscreenState);
		};
	});

	function toggleCompare() {
		comparison.active = !comparison.active;
	}

	function getFullscreenSupported() {
		const fullscreenDocument = document as FullscreenDocument;
		const fullscreenElement = getFullscreenElement();
		const supportsStandardFullscreen =
			document.fullscreenEnabled && typeof fullscreenElement.requestFullscreen === 'function';
		const supportsWebkitFullscreen =
			fullscreenDocument.webkitFullscreenEnabled &&
			typeof fullscreenElement.webkitRequestFullscreen === 'function';

		return !!(supportsStandardFullscreen || supportsWebkitFullscreen);
	}

	function getFullscreenElement() {
		return (
			(headerElement?.closest('[data-app-shell]') as FullscreenElement | null) ??
			(document.documentElement as FullscreenElement)
		);
	}

	function getCurrentFullscreenElement() {
		const fullscreenDocument = document as FullscreenDocument;
		return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
	}

	function syncFullscreenState() {
		fullscreenActive = getCurrentFullscreenElement() === getFullscreenElement();
		requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
	}

	async function toggleFullscreen() {
		if (!fullscreenSupported) return;

		if (fullscreenActive) {
			const fullscreenDocument = document as FullscreenDocument;
			if (document.exitFullscreen) {
				await document.exitFullscreen();
			} else {
				await fullscreenDocument.webkitExitFullscreen?.();
			}
			return;
		}

		const fullscreenElement = getFullscreenElement();
		if (fullscreenElement.requestFullscreen) {
			await fullscreenElement.requestFullscreen();
		} else {
			await fullscreenElement.webkitRequestFullscreen?.();
		}
	}
</script>

<header
	bind:this={headerElement}
	class="font-bolder {autoplayActive ? 'absolute inset-x-0 top-0 z-50' : ''}"
>
	<nav
		aria-label="Global"
		class="relative flex flex-none items-center justify-between gap-2 border-b text-white transition-colors {autoplayActive
			? 'border-transparent bg-transparent p-2'
			: 'border-brand-hover/20 bg-brand-main p-2 lg:px-8'}"
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
					class="flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-sm font-semibold hover:bg-brand-hover lg:px-3 {comparison.active
						? 'bg-brand-hover'
						: ''}"
				>
					<Columns2 class="h-4 w-4" />
					<span class="hidden lg:inline"
						>{comparison.active ? config.header.closeCompare : config.header.compare}</span
					>
				</button>
			</div>

			<div
				class="relative flex min-w-0 flex-none justify-center px-1 text-center"
				transition:fly={{ y: -48, duration: 180 }}
			>
				<h1
					class="max-w-[44vw] truncate font-heading text-lg leading-none font-bold select-none lg:max-w-none lg:text-2xl"
				>
					{config.site.name}
				</h1>
			</div>

			<div class="flex flex-1 justify-end gap-1 lg:gap-2" transition:fly={{ x: 48, duration: 180 }}>
				<button
					onclick={onAboutOpen}
					aria-label={config.header.about}
					class="flex h-8 cursor-pointer items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-brand-hover lg:px-3"
				>
					<Info class="h-4 w-4" />
					<span class="hidden lg:inline">{config.header.about}</span>
				</button>

				{#if autoplayEnabled}
					<button
						onclick={onAutoplayStart}
						disabled={autoplayDisabled}
						aria-label={config.header.play}
						title={config.header.play}
						class="flex h-8 cursor-pointer items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-45 lg:px-3"
					>
						<Play class="h-4 w-4" />
						<span class="hidden lg:inline">{config.header.play}</span>
					</button>
				{/if}

				<button
					onclick={onShareOpen}
					aria-label={config.header.share}
					class="flex h-8 cursor-pointer items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-brand-hover lg:px-3"
				>
					<Share2 class="h-4 w-4" />
					<span class="hidden lg:inline">{config.header.share}</span>
				</button>
			</div>
		{:else if autoplayEnabled}
			<div
				class="ml-auto grid h-9 {presentationToolbarClass} divide-x divide-gray-200 overflow-hidden rounded-md border border-gray-200 bg-white text-gray-800 shadow-lg"
			>
				<button
					onclick={onAutoplayPauseToggle}
					disabled={autoplayDisabled}
					aria-label={autoplayPlaying ? config.header.pause : config.header.play}
					title={autoplayPlaying ? config.header.pause : config.header.play}
					aria-pressed={autoplayPlaying}
					class={presentationControlButtonClass}
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
					class={presentationControlButtonClass}
				>
					<Square class="h-3.5 w-3.5 fill-current" />
				</button>

				{#if fullscreenSupported}
					<button
						onclick={toggleFullscreen}
						aria-label={fullscreenActive
							? config.header.exitFullscreen
							: config.header.enterFullscreen}
						title={fullscreenActive ? config.header.exitFullscreen : config.header.enterFullscreen}
						aria-pressed={fullscreenActive}
						class={presentationControlButtonClass}
					>
						{#if fullscreenActive}
							<Minimize2 class="h-4 w-4" />
						{:else}
							<Maximize2 class="h-4 w-4" />
						{/if}
					</button>
				{/if}

				<span
					aria-live="polite"
					class="flex h-9 w-full flex-col items-center justify-center gap-0.5 px-2 font-heading text-xs font-bold tabular-nums"
				>
					<span class="leading-4"
						>{autoplayTotal > 0 ? autoplayCurrentPosition : 0}/{autoplayTotal}</span
					>
					<span class="block h-0.5 w-full overflow-hidden rounded-full bg-gray-200">
						{#key autoplayCurrentPosition}
							<span
								class="autoplay-progress block h-full origin-left bg-brand-main"
								class:autoplay-progress-paused={!autoplayPlaying || autoplayTotal === 0}
								style:animation-duration={`${autoplayProgressDuration}s`}
							></span>
						{/key}
					</span>
				</span>
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
