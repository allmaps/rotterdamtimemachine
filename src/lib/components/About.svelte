<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { BookOpen, ExternalLink, Globe, Landmark, X, Info } from '@lucide/svelte';
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

	type Contact = NonNullable<AppConfig['about']['contact']>['contacts'][number];
	type ContactEmail = NonNullable<Contact['email']>;
	type SourceType = NonNullable<
		NonNullable<AppConfig['about']['sources']>['items'][number]['type']
	>;
	type SourceItem = NonNullable<AppConfig['about']['sources']>['items'][number];
	type SourceGroup = {
		type: SourceType;
		items: SourceItem[];
	};

	let closeButton: HTMLButtonElement | undefined = $state();
	let revealedEmailKeys = $state<string[]>([]);
	let copiedEmailKey = $state<string>();
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

	function getContactKey(contact: Contact, index: number) {
		return `${index}-${contact.title}`;
	}

	function getContactEmailAddress(email: ContactEmail) {
		return email.address;
	}

	function getSourceGroups(): SourceGroup[] {
		return (['book', 'website'] as const)
			.map((type) => ({
				type,
				items: getSourceItemsByType(type)
			}))
			.filter((group) => group.items.length > 0);
	}

	function getSourceItemsByType(type: SourceType) {
		const items = config.about.sources?.items ?? [];
		return items.filter((item) =>
			type === 'website' ? item.type === 'website' || !item.type : item.type === type
		);
	}

	function getSourceGroupLabel(type: SourceType) {
		return type === 'book'
			? (config.about.sources?.bookLabel ?? 'Books')
			: (config.about.sources?.websiteLabel ?? 'Websites');
	}

	function revealContactEmail(contact: Contact, index: number) {
		const key = getContactKey(contact, index);
		if (!revealedEmailKeys.includes(key)) {
			revealedEmailKeys = [...revealedEmailKeys, key];
		}
	}

	async function copyContactEmail(contact: Contact, index: number) {
		if (!contact.email) return;

		const key = getContactKey(contact, index);
		revealContactEmail(contact, index);

		try {
			await navigator.clipboard.writeText(getContactEmailAddress(contact.email));
			copiedEmailKey = key;
			setTimeout(() => {
				if (copiedEmailKey === key) copiedEmailKey = undefined;
			}, 1600);
		} catch {
			copiedEmailKey = undefined;
		}
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

		{#if config.about.credits}
			<section class="mt-6 border-t border-gray-200 pt-5">
				<h3 class="mb-2 text-sm font-bold text-gray-900">{config.about.credits.title}</h3>
				{#if config.about.credits.description}
					<p class="text-sm leading-relaxed text-gray-700">
						{config.about.credits.description}
					</p>
				{/if}
				{#if config.about.credits.people?.length}
					<ul class="mt-3 space-y-2 text-sm text-gray-700">
						{#each config.about.credits.people as person (person.name)}
							<li class="grid gap-0.5 sm:grid-cols-[minmax(0,12rem)_1fr] sm:gap-3">
								<span>
									{#if person.url}
										<a
											href={person.url}
											target="_blank"
											rel="external noopener noreferrer"
											class="inline-flex items-center gap-1 font-semibold text-gray-900 hover:text-brand-main"
										>
											<span>{person.name}</span>
											<ExternalLink class="h-3 w-3 flex-none" />
										</a>
									{:else}
										<span class="block font-semibold text-gray-900">{person.name}</span>
									{/if}
									{#if person.affiliation}
										<span class="block text-xs text-gray-500">{person.affiliation}</span>
									{/if}
								</span>
								<span>{person.role}</span>
							</li>
						{/each}
					</ul>
				{/if}
				{#if config.about.credits.links?.length}
					<div class="mt-3 flex flex-wrap gap-2">
						{#each config.about.credits.links as link (link.url)}
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

		{#if config.about.contact?.contacts.length}
			<section class="mt-6 border-t border-gray-200 pt-5">
				<h3 class="mb-3 text-sm font-bold text-gray-900">{config.about.contact.title}</h3>
				<ul class="space-y-4 text-sm text-gray-700">
					{#each config.about.contact.contacts as contact, index (contact.title)}
						{@const contactKey = getContactKey(contact, index)}
						<li>
							<h4 class="font-semibold text-gray-900">{contact.title}</h4>
							{#if contact.description}
								<p class="mt-1 leading-relaxed">{contact.description}</p>
							{/if}
							<div class="mt-2 flex flex-wrap items-center gap-2">
								{#if contact.email}
									{#if revealedEmailKeys.includes(contactKey)}
										<span class="font-medium text-gray-900">
											{getContactEmailAddress(contact.email)}
										</span>
										<button
											type="button"
											onclick={() => copyContactEmail(contact, index)}
											class="cursor-pointer rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-brand-soft hover:text-brand-main"
										>
											{copiedEmailKey === contactKey
												? (contact.email.copiedLabel ?? 'Copied')
												: (contact.email.copyLabel ?? 'Copy')}
										</button>
									{:else}
										<button
											type="button"
											onclick={() => revealContactEmail(contact, index)}
											class="cursor-pointer rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-brand-soft hover:text-brand-main"
										>
											{contact.email.revealLabel}
										</button>
									{/if}
								{/if}

								{#if contact.url && contact.urlLabel}
									<a
										href={contact.url}
										target="_blank"
										rel="external noopener noreferrer"
										class="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-brand-soft hover:text-brand-main"
									>
										<span>{contact.urlLabel}</span>
										<ExternalLink class="h-3 w-3 flex-none" />
									</a>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if institutions.length > 0 || config.about.sources?.items.length}
			<section class="mt-6 border-t border-gray-200 pt-5">
				{#if config.about.sources?.title}
					<h3 class="mb-3 text-sm font-bold text-gray-900">
						{config.about.sources?.title}
					</h3>
				{/if}
				<div class="space-y-4">
					{#each getSourceGroups() as group (group.type)}
						<div>
							<h4 class="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-700">
								{#if group.type === 'book'}
									<BookOpen class="h-3.5 w-3.5" aria-hidden="true" />
								{:else}
									<Globe class="h-3.5 w-3.5" aria-hidden="true" />
								{/if}
								<span>{getSourceGroupLabel(group.type)}</span>
							</h4>
							<ul class="list-disc space-y-2 pl-5 text-sm text-gray-700">
								{#each group.items as item (item.url ?? item.label)}
									<li>
										{#if item.url}
											<a
												href={item.url}
												target="_blank"
												rel="external noopener noreferrer"
												class="font-medium text-gray-700 hover:text-brand-main"
											>
												<!-- eslint-disable-next-line svelte/no-at-html-tags -->
												{@html item.label}<ExternalLink
													class="ml-1 inline-block h-3.5 w-3.5 align-[-0.125em]"
												/>
											</a>
										{:else}
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											<span class="font-medium text-gray-700">{@html item.label}</span>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/each}
					{#if institutions.length > 0}
						<div>
							<h4 class="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-700">
								<Landmark class="h-3.5 w-3.5" aria-hidden="true" />
								<span>{config.about.sources?.institutionsLabel}</span>
							</h4>
							<ul class="list-disc space-y-2 pl-5 text-sm text-gray-700">
								{#each institutions as institution (institution)}
									<li class="font-medium">{institution}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
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
