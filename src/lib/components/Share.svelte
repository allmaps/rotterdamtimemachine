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

	type ShareMode = 'simple' | 'view';

	let shareMode = $state<ShareMode>('simple');
	let sharePresentation = $state(isPresentationRoute());
	let url = $derived(shareMode === 'view' ? getViewUrl() : getSimpleUrl());
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

	function isPresentationRoute() {
		if (typeof window === 'undefined') return false;

		const presentationPath = resolve('/presentation/').replace(/\/$/, '');
		const currentPath = window.location.pathname.replace(/\/$/, '');

		return currentPath === presentationPath;
	}

	function getShareBaseUrl() {
		const path = sharePresentation ? '/presentation/' : '/';

		if (typeof window === 'undefined') {
			return new URL(resolve(path), config.site.url).href;
		}

		return new URL(resolve(path), window.location.origin).href;
	}

	function getSimpleUrl() {
		return getShareBaseUrl();
	}

	function getViewUrl() {
		const viewUrl = new URL(getShareBaseUrl());
		const [lng, lat] = mapView.center;

		if (Number.isFinite(lat) && Number.isFinite(lng)) {
			viewUrl.searchParams.set('lat', lat.toFixed(5));
			viewUrl.searchParams.set('lng', lng.toFixed(5));
		}

		if (Number.isFinite(mapView.zoom)) {
			viewUrl.searchParams.set('zoom', mapView.zoom.toFixed(2));
		}

		const annotationId = idByAnnotation.get(viewState.annotation);
		if (annotationId) {
			viewUrl.searchParams.set('map', annotationId);
		}

		if (Number.isFinite(mapView.bearing) && Math.abs(mapView.bearing) >= 0.005) {
			viewUrl.searchParams.set('bearing', mapView.bearing.toFixed(2));
		}

		return viewUrl.href;
	}

	function selectShareMode(mode: ShareMode) {
		shareMode = mode;
		if (copiedTimer) clearTimeout(copiedTimer);
		copied = false;
	}

	function togglePresentationMode() {
		sharePresentation = !sharePresentation;
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
		<div
			class="mb-3 grid grid-cols-2 overflow-hidden rounded border border-gray-200 text-sm font-semibold"
		>
			<button
				type="button"
				aria-pressed={shareMode === 'simple'}
				onclick={() => selectShareMode('simple')}
				class="cursor-pointer px-3 py-2 {shareMode === 'simple'
					? 'bg-brand-main text-white'
					: 'bg-white text-gray-700 hover:bg-gray-100'}"
			>
				{config.share.simpleLink}
			</button>
			<button
				type="button"
				aria-pressed={shareMode === 'view'}
				onclick={() => selectShareMode('view')}
				class="cursor-pointer border-l border-gray-200 px-3 py-2 {shareMode === 'view'
					? 'bg-brand-main text-white'
					: 'bg-white text-gray-700 hover:bg-gray-100'}"
			>
				{config.share.viewLink}
			</button>
		</div>
		<button
			type="button"
			aria-pressed={sharePresentation}
			onclick={togglePresentationMode}
			class="mb-3 flex w-full cursor-pointer items-center justify-between gap-3 rounded border px-3 py-2 text-left text-sm font-semibold transition-colors {sharePresentation
				? 'border-brand-main bg-brand-soft text-gray-900'
				: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'}"
		>
			<span>{config.share.presentationLink}</span>
			<span
				aria-hidden="true"
				class="relative h-5 w-9 rounded-full transition-colors {sharePresentation
					? 'bg-brand-main'
					: 'bg-gray-300'}"
			>
				<span
					class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform {sharePresentation
						? 'translate-x-4'
						: 'translate-x-0.5'}"
				></span>
			</span>
		</button>
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
