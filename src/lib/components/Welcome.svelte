<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { Columns2, Layers, Clock10, X } from '@lucide/svelte';
	import { onMount, tick } from 'svelte';
	import type { AppConfig, WelcomeConfig } from '$lib/types';

	let {
		config
	}: {
		config: AppConfig;
	} = $props();

	let open = $state(false);
	let closeButton: HTMLButtonElement | undefined = $state();
	let welcome = $derived(
		isEnabledWelcome(config.welcome) ? config.welcome : undefined
	);
	let sections = $derived(welcome?.sections ?? []);
	let storageKey = $derived(
		welcome?.storageKey ||
			`time-machine-welcome:${config.site.url || config.site.name || 'default'}`
	);

	onMount(() => {
		if (!welcome) return;

		try {
			if (localStorage.getItem(storageKey) === 'dismissed') return;
		} catch {
			// If storage is blocked, show the introduction for this session.
		}

		open = true;
	});

	$effect(() => {
		if (open) {
			tick().then(() => closeButton?.focus());
		}
	});

	function closeWelcome() {
		open = false;

		try {
			localStorage.setItem(storageKey, 'dismissed');
		} catch {
			// The modal still closes even when storage is unavailable.
		}
	}

	function getSectionIcon(index: number) {
		return [Clock10, Layers, Columns2][index] ?? Map;
	}

	function isEnabledWelcome(
		welcome: AppConfig['welcome']
	): welcome is Extract<WelcomeConfig, { enabled?: true }> {
		return !!welcome && welcome.enabled !== false;
	}
</script>

{#if open && welcome}
	<Modal
		onClose={closeWelcome}
		ariaLabelledby="welcome-title"
		panelClass="max-h-[calc(100dvh-4rem)] max-w-2xl md:max-h-[calc(100dvh-8rem)]"
	>
		<div class="flex items-start justify-between gap-4 px-5 py-4">
			<div class="min-w-0">
				<h2 id="welcome-title" class="text-xl leading-6 font-bold">{welcome.title}</h2>
				<p class="mt-1 text-sm leading-5 text-gray-500">{welcome.description}</p>
			</div>
			<button
				bind:this={closeButton}
				type="button"
				onclick={closeWelcome}
				aria-label={welcome.closeLabel}
				class="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<div class="overflow-y-auto px-5">
			<div class="grid gap-3 md:grid-cols-3">
				{#each sections as section, index (section.title)}
					{@const Icon = getSectionIcon(index)}
					<section class="rounded border border-gray-200 bg-gray-50 p-3">
						<Icon class="mb-3 h-5 w-5 text-brand-main" />
						<h3 class="text-sm font-bold text-gray-900">{section.title}</h3>
						<p class="mt-1 text-sm leading-5 text-gray-600">{section.description}</p>
					</section>
				{/each}
			</div>

			<div class=" px-5 py-4">
				<button
					type="button"
					onclick={closeWelcome}
					class="flex w-full cursor-pointer items-center justify-center rounded bg-brand-main px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-hover"
				>
					{welcome.dismissLabel}
				</button>
			</div>
		</div></Modal
	>
{/if}
