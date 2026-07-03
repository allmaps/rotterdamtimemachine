<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { ExternalLink, X, Info } from '@lucide/svelte';
	import { tick } from 'svelte';
	import type { AppConfig, MapMetadata } from '$lib/types';

	let {
		config,
		maps,
		onClose
	}: {
		config: AppConfig;
		maps: MapMetadata[];
		onClose: () => void;
	} = $props();

	let closeButton: HTMLButtonElement | undefined = $state();
	let institutions = $derived(getInstitutions(maps, config.site.locale));
	const keyClass =
		'inline-flex min-w-7 items-center justify-center rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-heading text-xs font-bold text-gray-800 shadow-sm';
	const wideKeyClass =
		'inline-flex min-w-16 items-center justify-center rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-heading text-xs font-bold text-gray-800 shadow-sm';

	$effect(() => {
		tick().then(() => {
			closeButton?.focus();
		});
	});

	function getInstitutions(maps: MapMetadata[], locale: string) {
		const institutions = maps
			.map((map) => map.institution.trim())
			.filter((institution, index, allInstitutions) => {
				return institution && allInstitutions.indexOf(institution) === index;
			});

		return institutions.toSorted(new Intl.Collator(locale).compare);
	}
</script>

<Modal {onClose} ariaLabelledby="about-title" panelClass="max-h-[calc(100dvh-7rem)]">
	<div class="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
		<Info class="h-5 w-5 flex-none text-brand-main" />
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
		{#each config.about.paragraphs as paragraph, index (index)}
			<p
				class="{index === config.about.paragraphs.length - 1
					? ''
					: 'mb-4'} leading-relaxed text-gray-700"
			>
				{paragraph}
			</p>
		{/each}

		{#if config.about.standards}
			<section class="mt-6 border-t border-gray-200 pt-5">
				<h3 class="mb-3 text-sm font-bold text-gray-900">{config.about.standards.title}</h3>
				{#each config.about.standards.paragraphs as paragraph, index (index)}
					<p
						class="{index === (config.about.standards?.paragraphs.length ?? 0) - 1
							? ''
							: 'mb-3'} text-sm leading-relaxed text-gray-700"
					>
						{paragraph}
					</p>
				{/each}

				{#if config.about.standards.links?.length}
					<div class="mt-3 flex flex-wrap gap-2">
						{#each config.about.standards.links as link (link.url)}
							<a
								href={link.url}
								target="_blank"
								rel="external noopener noreferrer"
								class="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-brand-soft hover:text-brand-main"
							>
								<span>{link.label}</span>
								<ExternalLink class="h-3 w-3 flex-none" />
							</a>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if institutions.length > 0}
			<section class="mt-6 border-t border-gray-200 pt-5">
				<h3 class="mb-3 text-sm font-bold text-gray-900">{config.about.institutionsTitle}</h3>
				<ul class="flex flex-wrap gap-2 text-sm text-gray-700">
					{#each institutions as institution (institution)}
						<li class="rounded bg-gray-100 px-2.5 py-1 font-medium">
							{institution}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if config.about.source}
			<section class="mt-6 border-t border-gray-200 pt-5">
				<h3 class="mb-2 text-sm font-bold text-gray-900">{config.about.source.title}</h3>
				<p class="text-sm leading-relaxed text-gray-700">
					{config.about.source.description}
				</p>
				{#if config.about.source.links?.length}
					<div class="mt-3 flex flex-wrap gap-2">
						{#each config.about.source.links as link (link.url)}
							<a
								href={link.url}
								target="_blank"
								rel="external noopener noreferrer"
								class="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-brand-soft hover:text-brand-main"
							>
								<span>{link.label}</span>
								<ExternalLink class="h-3 w-3 flex-none" />
							</a>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		<section class="mt-6 border-t border-gray-200 pt-5">
			<h3 class="mb-3 text-sm font-bold text-gray-900">{config.about.shortcutsTitle}</h3>
			<dl class="space-y-3 text-sm text-gray-700">
				{#each config.about.shortcuts as shortcut (shortcut.description)}
					<div class="grid grid-cols-[auto_1fr] items-center gap-3">
						<dt class="flex flex-wrap items-center gap-1.5">
							{#each shortcut.keys as key, keyIndex (keyIndex)}
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
