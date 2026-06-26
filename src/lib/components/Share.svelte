<script lang="ts">
	import { page } from '$app/state';
	import { Check, Copy, X } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';

	let { onClose }: { onClose: () => void } = $props();

	let url = $derived(page.url.href);
	let copied = $state(false);
	let dialogElement: HTMLDivElement | undefined = $state();
	let inputElement: HTMLInputElement | undefined = $state();
	let firstFocusableElement: HTMLElement | undefined = $state();
	let lastFocusableElement: HTMLElement | undefined = $state();
	let copiedTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		tick().then(() => {
			inputElement?.focus();
			inputElement?.select();
			updateFocusableElements();
		});
	});

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

	function updateFocusableElements() {
		if (!dialogElement) return;

		const focusableElements = dialogElement.querySelectorAll<HTMLElement>(
			'button:not([tabindex="-1"]), input:not([tabindex="-1"]), [href]:not([tabindex="-1"]), select:not([tabindex="-1"]), textarea:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
		);

		firstFocusableElement = focusableElements[0];
		lastFocusableElement = focusableElements[focusableElements.length - 1];
	}

	function handleKeydown(event: KeyboardEvent) {
		event.stopPropagation();

		if (event.key === 'Escape') {
			onClose();
		}
	}

	function trapFocus(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;

		if (event.shiftKey && document.activeElement === firstFocusableElement) {
			event.preventDefault();
			lastFocusableElement?.focus();
		} else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
			event.preventDefault();
			firstFocusableElement?.focus();
		}
	}
</script>

<svelte:document onkeydown={trapFocus} />

<div
	bind:this={dialogElement}
	class="fixed inset-0 z-[1000] flex items-start justify-center bg-black/45 px-3 pt-14 md:pt-24"
	role="dialog"
	aria-modal="true"
	aria-labelledby="share-title"
	tabindex="-1"
	onkeydown={handleKeydown}
>
	<button
		type="button"
		class="absolute inset-0 cursor-default"
		aria-hidden="true"
		tabindex="-1"
		onclick={onClose}
		transition:fly={{ y: -4, duration: 150 }}
	></button>

	<div
		class="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-2xl"
		transition:fly={{ y: -16, duration: 180 }}
	>
		<div class="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
			<h2 id="share-title" class="text-xl leading-none font-bold md:text-2xl">
				Deel jouw Rotterdam Tijdmachine
			</h2>
			<button
				type="button"
				onclick={onClose}
				aria-label="Sluit delen"
				class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
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
					class="m-0 min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none focus:border-green-700"
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
	</div>
</div>
