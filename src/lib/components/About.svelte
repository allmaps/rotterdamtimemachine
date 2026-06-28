<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { X, Info } from '@lucide/svelte';
	import { tick } from 'svelte';
	import type { AppConfig } from '$lib/types';

	let {
		config,
		onClose
	}: {
		config: AppConfig;
		onClose: () => void;
	} = $props();

	let closeButton: HTMLButtonElement | undefined = $state();
	const keyClass =
		'inline-flex min-w-7 items-center justify-center rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-heading text-xs font-bold text-gray-800 shadow-sm';
	const wideKeyClass =
		'inline-flex min-w-16 items-center justify-center rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-heading text-xs font-bold text-gray-800 shadow-sm';

	$effect(() => {
		tick().then(() => {
			closeButton?.focus();
		});
	});
</script>

<Modal {onClose} ariaLabelledby="about-title" panelClass="max-h-[calc(100dvh-7rem)]">
	<div class="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
		<Info class="h-5 w-5 flex-none text-green-700" />
		<h2 id="about-title" class="text-xl leading-none font-bold md:text-xl">
			{config.about.title}
		</h2>
		<button
			bind:this={closeButton}
			type="button"
			onclick={onClose}
			aria-label={config.about.closeLabel}
			class="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
		>
			<X class="h-5 w-5" />
		</button>
	</div>

	<div class="overflow-y-auto px-5 py-5">
		{#each config.about.paragraphs as paragraph, index}
			<p class="{index === config.about.paragraphs.length - 1 ? '' : 'mb-4'} leading-relaxed text-gray-700">
				{paragraph}
			</p>
		{/each}

		<section class="mt-6 border-t border-gray-200 pt-5">
			<h3 class="mb-3 text-sm font-bold text-gray-900">{config.about.shortcutsTitle}</h3>
			<dl class="space-y-3 text-sm text-gray-700">
				{#each config.about.shortcuts as shortcut}
					<div class="grid grid-cols-[auto_1fr] items-center gap-3">
						<dt class="flex flex-wrap items-center gap-1.5">
							{#each shortcut.keys as key}
								{#if key === '/'}
									<span class="text-xs text-gray-400">/</span>
								{:else}
									<kbd class={shortcut.wide ? wideKeyClass : keyClass}>{key}</kbd>
								{/if}
							{/each}
						</dt>
						<dd>{shortcut.description}</dd>
					</div>
				{/each}
			</dl>
		</section>
	</div>
</Modal>
