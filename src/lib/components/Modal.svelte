<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { fly } from 'svelte/transition';

	type ModalPlacement = 'top' | 'center';

	let {
		onClose,
		ariaLabel,
		ariaLabelledby,
		panelClass = '',
		placement = 'top',
		onKeydown,
		children
	}: {
		onClose: () => void;
		ariaLabel?: string;
		ariaLabelledby?: string;
		panelClass?: string;
		placement?: ModalPlacement;
		onKeydown?: (event: KeyboardEvent) => void;
		children: Snippet;
	} = $props();

	let dialogElement: HTMLDivElement | undefined = $state();
	let firstFocusableElement: HTMLElement | undefined = $state();
	let lastFocusableElement: HTMLElement | undefined = $state();

	$effect(() => {
		tick().then(updateFocusableElements);
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
			return;
		}

		onKeydown?.(event);
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
	class="fixed inset-0 z-[1000] flex justify-center bg-black/45 {placement === 'center'
		? 'items-center p-4'
		: 'items-start px-3 pt-14 md:pt-24'}"
	role="dialog"
	aria-modal="true"
	aria-label={ariaLabel}
	aria-labelledby={ariaLabelledby}
	tabindex="-1"
	onkeydown={handleKeydown}
>
	<button
		type="button"
		class="absolute inset-0 cursor-default cursor-pointer"
		aria-hidden="true"
		tabindex="-1"
		onclick={onClose}
		transition:fly={{ y: -4, duration: 150 }}
	></button>

	<div
		class="relative z-10 flex w-full max-w-xl touch-auto flex-col overflow-hidden overscroll-contain rounded-lg border border-gray-200 bg-white text-gray-900 shadow-2xl {panelClass}"
		transition:fly={{ y: placement === 'center' ? 12 : -16, duration: 180 }}
	>
		{@render children()}
	</div>
</div>
