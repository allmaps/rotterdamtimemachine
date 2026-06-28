<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { Check, Copy, X, Share2 } from '@lucide/svelte';
	import { onMount, tick } from 'svelte';

	let { onClose }: { onClose: () => void } = $props();

	let url = $state('');
	let copied = $state(false);
	let inputElement: HTMLInputElement | undefined = $state();
	let copiedTimer: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		url = getCurrentUrl();
	});

	$effect(() => {
		tick().then(() => {
			if (!shouldAutoSelectInput()) return;

			inputElement?.focus({ preventScroll: true });
			inputElement?.select();
		});
	});

	function shouldAutoSelectInput() {
		if (typeof window === 'undefined') return false;

		return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
	}

	function getCurrentUrl() {
		return typeof window === 'undefined' ? '' : window.location.href;
	}

	async function copyUrl() {
		url = getCurrentUrl();

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
		<Share2 class="h-5 w-5 flex-none text-green-700" />
		<h2 id="share-title" class="text-xl leading-none font-bold md:text-xl">Deel jouw tijdreis</h2>
		<button
			type="button"
			onclick={onClose}
			aria-label="Sluit delen"
			class="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
		>
			<X class="h-5 w-5" />
		</button>
	</div>

	<div class="px-5 py-5">
		<p class="mb-4 text-gray-500">Deel het kaartgedeelte dat jij nu bekijkt.</p>
		<div class="flex flex-col gap-2 sm:flex-row">
			<input
				bind:this={inputElement}
				type="text"
				readonly
				value={url}
				class="m-0 min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-base text-gray-700 outline-none focus:border-green-700"
			/>
			<button
				type="button"
				onclick={copyUrl}
				class="flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold text-white transition-colors {copied
					? 'bg-green-600'
					: 'bg-gray-800 hover:bg-gray-700'}"
			>
				{#if copied}
					<Check class="h-4 w-4" />
					Gekopieerd
				{:else}
					<Copy class="h-4 w-4" />
					Kopieer
				{/if}
			</button>
		</div>
	</div>
</Modal>
