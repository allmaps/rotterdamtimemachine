<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { Check, Copy, X, Share2 } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { mapView, viewState } from '$lib/app-state.svelte.js';
	import { idByAnnotation } from '$lib/warped-map-list';
	import { tick } from 'svelte';
	import type { AppConfig } from '$lib/types';

	let {
		config,
		onClose
	}: {
		config: AppConfig;
		onClose: () => void;
	} = $props();

	let includeLocation = $state(false);
	let includeCurrentMap = $state(false);
	let includePresentation = $state(false);
	let url = $derived(getShareUrl());
	let copied = $state(false);
	let inputElement: HTMLInputElement | undefined = $state();
	let copiedTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const selectedUrl = url;
		tick().then(() => {
			if (!shouldAutoSelectInput()) return;
			if (inputElement?.value !== selectedUrl) return;

			inputElement?.focus({ preventScroll: true });
			inputElement?.select();
		});
	});

	function shouldAutoSelectInput() {
		if (typeof window === 'undefined') return false;

		return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
	}

	function getShareBaseUrl() {
		const path = includePresentation ? '/presentation/' : '/';

		if (typeof window === 'undefined') {
			return new URL(resolve(path), config.site.url).href;
		}

		return new URL(resolve(path), window.location.origin).href;
	}

	function getShareUrl() {
		const viewUrl = new URL(getShareBaseUrl());
		const [lng, lat] = mapView.center;

		if (includeLocation && Number.isFinite(lat) && Number.isFinite(lng)) {
			viewUrl.searchParams.set('lat', lat.toFixed(5));
			viewUrl.searchParams.set('lng', lng.toFixed(5));

			if (Number.isFinite(mapView.zoom)) {
				viewUrl.searchParams.set('zoom', mapView.zoom.toFixed(2));
			}

			if (Number.isFinite(mapView.bearing) && Math.abs(mapView.bearing) >= 0.005) {
				viewUrl.searchParams.set('bearing', mapView.bearing.toFixed(2));
			}
		}

		if (includeCurrentMap) {
			const annotationId = idByAnnotation.get(viewState.annotation);
			if (annotationId) {
				viewUrl.searchParams.set('map', annotationId);
			}
		}

		return viewUrl.href;
	}

	function toggleLocation() {
		includeLocation = !includeLocation;
		resetCopiedState();
	}

	function toggleCurrentMap() {
		includeCurrentMap = !includeCurrentMap;
		resetCopiedState();
	}

	function togglePresentationMode() {
		includePresentation = !includePresentation;
		resetCopiedState();
	}

	function getToggleClass(active: boolean) {
		return [
			'flex cursor-pointer items-center justify-between gap-2 rounded border px-2.5 py-2 text-left text-xs font-semibold transition-colors',
			active
				? 'border-brand-main bg-brand-soft text-gray-900'
				: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
		].join(' ');
	}

	function resetCopiedState() {
		if (copiedTimer) clearTimeout(copiedTimer);
		copied = false;
	}

	async function copyUrl() {
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			inputElement?.select();
			document.execCommand('copy');
		}

		if (copiedTimer) clearTimeout(copiedTimer);
		copied = true;
		copiedTimer = setTimeout(() => (copied = false), 2000);
	}
</script>

<Modal {onClose} ariaLabelledby="share-title">
	<div class="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
		<Share2 class="h-5 w-5 flex-none text-brand-main" />
		<h2 id="share-title" class="text-xl leading-none font-bold md:text-xl">{config.share.title}</h2>
		<button
			type="button"
			onclick={onClose}
			aria-label={config.share.closeLabel}
			class="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
		>
			<X class="h-5 w-5" />
		</button>
	</div>

	<div class="px-5 py-5">
		<p class="mb-4 text-gray-500">{config.share.description}</p>
		<div class="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
			<button
				type="button"
				aria-pressed={includeLocation}
				onclick={toggleLocation}
				class={getToggleClass(includeLocation)}
			>
				<span>{config.share.location}</span>
				<span
					aria-hidden="true"
					class="relative h-4 w-7 flex-none rounded-full transition-colors {includeLocation
						? 'bg-brand-main'
						: 'bg-gray-300'}"
				>
					<span
						class="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform {includeLocation
							? 'translate-x-3.5'
							: 'translate-x-0.5'}"
					></span>
				</span>
			</button>
			<button
				type="button"
				aria-pressed={includeCurrentMap}
				onclick={toggleCurrentMap}
				class={getToggleClass(includeCurrentMap)}
			>
				<span>{config.share.currentMap}</span>
				<span
					aria-hidden="true"
					class="relative h-4 w-7 flex-none rounded-full transition-colors {includeCurrentMap
						? 'bg-brand-main'
						: 'bg-gray-300'}"
				>
					<span
						class="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform {includeCurrentMap
							? 'translate-x-3.5'
							: 'translate-x-0.5'}"
					></span>
				</span>
			</button>
			<button
				type="button"
				aria-pressed={includePresentation}
				onclick={togglePresentationMode}
				class={getToggleClass(includePresentation)}
			>
				<span>{config.share.presentationMode}</span>
				<span
					aria-hidden="true"
					class="relative h-4 w-7 flex-none rounded-full transition-colors {includePresentation
						? 'bg-brand-main'
						: 'bg-gray-300'}"
				>
					<span
						class="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform {includePresentation
							? 'translate-x-3.5'
							: 'translate-x-0.5'}"
					></span>
				</span>
			</button>
		</div>
		<div class="flex flex-col gap-2 sm:flex-row">
			<input
				bind:this={inputElement}
				type="text"
				readonly
				value={url}
				class="m-0 min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-base text-gray-700 outline-none focus:border-brand-main"
			/>
			<button
				type="button"
				onclick={copyUrl}
				class="flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold text-white transition-colors {copied
					? 'bg-brand-secondary'
					: 'bg-gray-800 hover:bg-gray-700'}"
			>
				{#if copied}
					<Check class="h-4 w-4" />
					{config.share.copied}
				{:else}
					<Copy class="h-4 w-4" />
					{config.share.copy}
				{/if}
			</button>
		</div>
	</div>
</Modal>
