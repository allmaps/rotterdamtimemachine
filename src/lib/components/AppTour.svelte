<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { driver } from 'driver.js';
	import 'driver.js/dist/driver.css';
	import type { AppConfig, TourConfig } from '$lib/types';
	import type { Driver, DriveStep } from 'driver.js';

	let {
		config,
		enabled = false
	}: {
		config: AppConfig;
		enabled?: boolean;
	} = $props();

	let mounted = $state(false);
	let tour = $derived(isEnabledTour(config.tour) ? config.tour : undefined);
	let storageKey = $derived(
		tour?.storageKey || `time-machine-tour:${config.site.url || config.site.name || 'default'}`
	);
	let tourDriver: Driver | undefined;
	let startTimeout: number | undefined;
	let hasStarted = false;
	let persistOnDestroy = true;

	onMount(() => {
		mounted = true;

		return () => {
			persistOnDestroy = false;
			clearStartTimeout();
			tourDriver?.destroy();
		};
	});

	$effect(() => {
		if (!mounted || !enabled || !tour || hasStarted || wasDismissed(storageKey)) return;

		scheduleStart();
	});

	function scheduleStart(delay = 180) {
		if (startTimeout !== undefined) return;

		startTimeout = window.setTimeout(() => {
			startTimeout = undefined;
			startTour();
		}, delay);
	}

	async function startTour() {
		if (!tour || hasStarted || wasDismissed(storageKey)) return;

		await tick();
		await nextFrame();

		if (hasBlockingOverlay()) {
			scheduleStart(500);
			return;
		}

		const steps = getTourSteps(tour);
		if (steps.length === 0) return;

		hasStarted = true;
		persistOnDestroy = true;
		tourDriver = driver({
			steps,
			animate: true,
			smoothScroll: true,
			allowClose: true,
			allowScroll: false,
			allowKeyboardControl: true,
			disableActiveInteraction: true,
			overlayOpacity: 0.58,
			stagePadding: 8,
			stageRadius: 8,
			popoverClass: 'time-machine-tour',
			showButtons: ['previous', 'next', 'close'],
			showProgress: true,
			progressText: tour.progressText,
			nextBtnText: tour.nextLabel,
			prevBtnText: tour.previousLabel,
			doneBtnText: tour.doneLabel,
			onPopoverRender: (popover) => {
				popover.closeButton.setAttribute('aria-label', tour?.closeLabel ?? '');
				popover.closeButton.setAttribute('title', tour?.closeLabel ?? '');
			},
			onDestroyed: () => {
				if (persistOnDestroy) {
					markDismissed(storageKey);
				}

				tourDriver = undefined;
			}
		});

		tourDriver.drive();
	}

	function getTourSteps(activeTour: Extract<TourConfig, { enabled?: true }>): DriveStep[] {
		return activeTour.steps.flatMap((step) => {
			const element = getTourTarget(step.target);
			if (!element) return [];

			return [
				{
					element,
					popover: {
						title: step.title,
						description: step.description,
						side: step.side,
						align: step.align
					}
				}
			];
		});
	}

	function getTourTarget(target: string) {
		return document.querySelector<HTMLElement>(`[data-tour="${target}"]`) ?? undefined;
	}

	function hasBlockingOverlay() {
		return (
			document.body.classList.contains('driver-active') ||
			!!document.querySelector('[role="dialog"][aria-modal="true"]')
		);
	}

	function wasDismissed(key: string) {
		try {
			return localStorage.getItem(key) === 'dismissed';
		} catch {
			return false;
		}
	}

	function markDismissed(key: string) {
		try {
			localStorage.setItem(key, 'dismissed');
		} catch {
			// The tour still closes when storage is unavailable.
		}
	}

	function clearStartTimeout() {
		if (startTimeout === undefined) return;

		window.clearTimeout(startTimeout);
		startTimeout = undefined;
	}

	function nextFrame() {
		return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	}

	function isEnabledTour(
		tourConfig: AppConfig['tour']
	): tourConfig is Extract<TourConfig, { enabled?: true }> {
		return !!tourConfig && tourConfig.enabled !== false;
	}
</script>

<style>
	:global(.driver-popover.time-machine-tour),
	:global(.driver-popover.time-machine-tour *) {
		font-family: var(--font-sans);
	}

	:global(.driver-popover.time-machine-tour) {
		width: min(20rem, calc(100vw - 2rem));
		max-width: min(20rem, calc(100vw - 2rem));
		border: 1px solid rgb(229 231 235);
		border-radius: 0.5rem;
		background: white;
		color: rgb(17 24 39);
		box-shadow:
			0 18px 40px rgb(15 23 42 / 0.18),
			0 4px 12px rgb(15 23 42 / 0.12);
		padding: 1rem;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-title) {
		padding-right: 2rem;
		font-family: var(--font-heading);
		font-size: 1rem;
		font-weight: 700;
		line-height: 1.35;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-description) {
		margin-top: 0.35rem;
		color: rgb(75 85 99);
		font-size: 0.875rem;
		line-height: 1.45;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-close-btn) {
		top: 0.4rem;
		right: 0.4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.25rem;
		color: rgb(107 114 128);
		font-size: 1.25rem;
		line-height: 1;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-close-btn:hover),
	:global(.driver-popover.time-machine-tour .driver-popover-close-btn:focus) {
		background: rgb(243 244 246);
		color: rgb(17 24 39);
	}

	:global(.driver-popover.time-machine-tour .driver-popover-footer) {
		margin-top: 1rem;
		gap: 1rem;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-progress-text) {
		color: rgb(107 114 128);
		font-family: var(--font-heading);
		font-size: 0.75rem;
		font-weight: 700;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-navigation-btns) {
		gap: 0.35rem;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-navigation-btns button + button) {
		margin-left: 0;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-footer-btn) {
		border: 1px solid rgb(209 213 219);
		border-radius: 0.25rem;
		background: white;
		color: rgb(31 41 55);
		font-size: 0.8125rem;
		font-weight: 700;
		line-height: 1.2;
		padding: 0.5rem 0.65rem;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-footer-btn:hover),
	:global(.driver-popover.time-machine-tour .driver-popover-footer-btn:focus) {
		background: rgb(249 250 251);
		border-color: var(--color-brand-main);
	}

	:global(.driver-popover.time-machine-tour .driver-popover-next-btn) {
		border-color: var(--color-brand-main);
		background: var(--color-brand-main);
		color: white;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-next-btn:hover),
	:global(.driver-popover.time-machine-tour .driver-popover-next-btn:focus) {
		background: var(--color-brand-hover);
		border-color: var(--color-brand-hover);
		color: white;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-arrow) {
		border-color: white;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-arrow-side-left) {
		border-top-color: transparent;
		border-right-color: transparent;
		border-bottom-color: transparent;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-arrow-side-right) {
		border-top-color: transparent;
		border-bottom-color: transparent;
		border-left-color: transparent;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-arrow-side-top) {
		border-right-color: transparent;
		border-bottom-color: transparent;
		border-left-color: transparent;
	}

	:global(.driver-popover.time-machine-tour .driver-popover-arrow-side-bottom) {
		border-top-color: transparent;
		border-right-color: transparent;
		border-left-color: transparent;
	}
</style>
