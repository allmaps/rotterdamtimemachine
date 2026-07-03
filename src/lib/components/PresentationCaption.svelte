<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { fly } from 'svelte/transition';

	let {
		yearLabel,
		title,
		slideKey,
		slideDirection = 1,
		transitionDuration = 0
	}: {
		yearLabel: string;
		title: string;
		slideKey: string;
		slideDirection?: 1 | -1;
		transitionDuration?: number;
	} = $props();

	let titleViewport = $state<HTMLSpanElement>();
	let titleText = $state<HTMLSpanElement>();
	let titleMeasure = $state<HTMLSpanElement>();
	let titleOverflows = $state(false);
	let titleScrollDistance = $state(0);
	let resizeObserver: ResizeObserver | undefined;
	let measureRequest = 0;
	let measureFrame: number | undefined;
	let titleScrollDuration = $derived(Math.min(11, Math.max(4, titleScrollDistance / 54)));

	$effect(() => {
		const viewport = titleViewport;
		const measure = titleMeasure;
		if (!viewport || !measure) return;

		resizeObserver?.disconnect();
		resizeObserver = new ResizeObserver(() => scheduleTitleMeasure());
		resizeObserver.observe(viewport);
		resizeObserver.observe(measure);
		scheduleTitleMeasure();

		return () => {
			resizeObserver?.disconnect();
			resizeObserver = undefined;
		};
	});

	$effect(() => {
		const measuredTitle = title;
		titleOverflows = false;
		titleScrollDistance = 0;
		scheduleTitleMeasure(measuredTitle);
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		if (measureFrame !== undefined) cancelAnimationFrame(measureFrame);
	});

	function scheduleTitleMeasure(expectedTitle = title) {
		measureRequest += 1;
		const request = measureRequest;

		if (measureFrame !== undefined) cancelAnimationFrame(measureFrame);

		tick().then(async () => {
			await document.fonts?.ready.catch(() => undefined);

			measureFrame = requestAnimationFrame(() => {
				measureFrame = requestAnimationFrame(() => {
					if (request !== measureRequest || expectedTitle !== title) return;
					measureTitleOverflow();
				});
			});
		});
	}

	function measureTitleOverflow() {
		if (!titleViewport || !titleText || !titleMeasure) return;
		if (titleText.textContent !== title || titleMeasure.textContent !== title) {
			scheduleTitleMeasure(title);
			return;
		}

		const visibleWidth = titleViewport.clientWidth;
		const titleWidth = titleMeasure.getBoundingClientRect().width || titleMeasure.scrollWidth;
		const overflowDistance = titleWidth - visibleWidth;

		titleScrollDistance = Math.max(0, Math.ceil(overflowDistance));
		titleOverflows = overflowDistance > 4;
	}
</script>

<div data-map-layers-panel class="w-full overflow-visible text-white">
	<div class="relative min-h-10 overflow-visible md:min-h-16">
		{#key yearLabel}
			<span
				in:fly={{
					x: slideDirection > 0 ? 44 : -44,
					duration: transitionDuration
				}}
				out:fly={{
					x: slideDirection > 0 ? -44 : 44,
					duration: transitionDuration
				}}
				class="presentation-caption-text absolute inset-x-0 top-0 block font-heading text-4xl leading-[1.05] font-bold text-white md:text-6xl"
			>
				{yearLabel}
			</span>
		{/key}
	</div>

	<div class="relative mt-1 min-h-10 overflow-visible md:min-h-16">
		{#key slideKey}
			<span
				bind:this={titleViewport}
				in:fly={{
					x: slideDirection > 0 ? 44 : -44,
					duration: transitionDuration
				}}
				out:fly={{
					x: slideDirection > 0 ? -44 : 44,
					duration: transitionDuration
				}}
				class="presentation-caption-text presentation-caption-title-viewport absolute inset-x-0 top-0 block text-2xl leading-[1.25] font-bold whitespace-nowrap text-white md:text-5xl md:leading-[1.22]"
				{title}
			>
				<span
					bind:this={titleText}
					class="presentation-caption-title-line"
					class:is-scrolling={titleOverflows}
					style="--title-scroll-distance: {titleScrollDistance}px; --title-scroll-duration: {titleScrollDuration}s;"
				>
					{title}
				</span>
				<span
					bind:this={titleMeasure}
					aria-hidden="true"
					class="presentation-caption-title-measure"
				>
					{title}
				</span>
			</span>
		{/key}
	</div>
</div>

<style>
	.presentation-caption-text {
		text-shadow:
			0 2px 6px rgb(0 0 0 / 0.68),
			0 0 8px rgb(0 0 0 / 0.32);
	}

	.presentation-caption-title-line {
		display: inline-block;
		width: max-content;
		max-width: 100%;
		margin-block: -0.08em;
		overflow: visible;
		padding-block: 0.08em;
		text-overflow: clip;
		white-space: nowrap;
	}

	.presentation-caption-title-line.is-scrolling {
		max-width: none;
		overflow: visible;
		text-overflow: clip;
		animation: presentation-title-pan var(--title-scroll-duration) ease-in-out 0.45s infinite
			alternate;
		will-change: transform;
	}

	.presentation-caption-title-viewport {
		--caption-bleed-x: 1.25rem;
		--caption-bleed-y: 1rem;

		clip-path: inset(
			calc(var(--caption-bleed-y) * -1) calc(var(--caption-bleed-x) * -1)
				calc(var(--caption-bleed-y) * -1) calc(var(--caption-bleed-x) * -1)
		);
	}

	.presentation-caption-title-measure {
		position: absolute;
		top: 0;
		left: 0;
		display: inline-block;
		width: max-content;
		max-width: none;
		visibility: hidden;
		white-space: nowrap;
		pointer-events: none;
	}

	@keyframes presentation-title-pan {
		from {
			transform: translateX(0);
		}

		to {
			transform: translateX(calc(var(--title-scroll-distance) * -1));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.presentation-caption-title-line.is-scrolling {
			max-width: 100%;
			overflow: visible;
			text-overflow: clip;
			animation: none;
		}
	}

	@media (min-width: 768px) {
		.presentation-caption-title-viewport {
			--caption-bleed-x: 1.75rem;
			--caption-bleed-y: 1.25rem;
		}
	}
</style>
