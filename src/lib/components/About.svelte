<script lang="ts">
	import { X } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';

	let { onClose }: { onClose: () => void } = $props();

	let dialogElement: HTMLDivElement | undefined = $state();
	let closeButton: HTMLButtonElement | undefined = $state();
	let firstFocusableElement: HTMLElement | undefined = $state();
	let lastFocusableElement: HTMLElement | undefined = $state();

	$effect(() => {
		tick().then(() => {
			closeButton?.focus();
			updateFocusableElements();
		});
	});

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
	aria-labelledby="about-title"
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
		class="relative z-10 flex max-h-[calc(100vh-7rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-2xl"
		transition:fly={{ y: -16, duration: 180 }}
	>
		<div class="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
			<h2 id="about-title" class="text-xl leading-none font-bold md:text-2xl">
				Over Roffa reis door de tijd
			</h2>
			<button
				bind:this={closeButton}
				type="button"
				onclick={onClose}
				aria-label="Sluit over"
				class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<div class="overflow-y-auto px-5 py-5">
			<p class="mb-4 leading-relaxed text-gray-700">
				Roffa reis door de tijd maakt het mogelijk om ruim 150 jaar aan Rotterdamse
				stadsgeschiedenis te ontdekken. Vanaf de negentiende eeuw is er veel veranderd in de manier
				waarop Rotterdam zich heeft ontwikkeld als stad en haven.
			</p>
			<p class="mb-4 leading-relaxed text-gray-700">
				De historische kaarten laten zien hoe Rotterdam groeide van een kleine handelsstad tot een
				van de grootste havens ter wereld. Je ziet hoe wijken verschoven, nieuwe gebieden werden
				aangelegd en oude structuren verdwenen.
			</p>
			<p class="leading-relaxed text-gray-700">
				Deze cultuurhistorische tijdreis geeft inzicht in de keuzes die hebben geleid tot het
				Rotterdam van nu, en kan inspireren om historische kennis opnieuw te benutten.
			</p>
		</div>
	</div>
</div>
