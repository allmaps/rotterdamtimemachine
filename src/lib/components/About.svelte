<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { X, Info } from '@lucide/svelte';
	import { tick } from 'svelte';

	let { onClose }: { onClose: () => void } = $props();

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
			Over Rotterdam Tijdmachine
		</h2>
		<button
			bind:this={closeButton}
			type="button"
			onclick={onClose}
			aria-label="Sluit over"
			class="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
		>
			<X class="h-5 w-5" />
		</button>
	</div>

	<div class="overflow-y-auto px-5 py-5">
		<p class="mb-4 leading-relaxed text-gray-700">
			Rotterdam Tijdmachine maakt het mogelijk om ruim 150 jaar aan Rotterdamse stadsgeschiedenis te
			ontdekken. Vanaf de negentiende eeuw is er veel veranderd in de manier waarop Rotterdam zich
			heeft ontwikkeld als stad en haven.
		</p>
		<p class="mb-4 leading-relaxed text-gray-700">
			De historische kaarten laten zien hoe Rotterdam groeide van een kleine handelsstad tot een van
			de grootste havens ter wereld. Je ziet hoe wijken verschoven, nieuwe gebieden werden aangelegd
			en oude structuren verdwenen.
		</p>
		<p class="leading-relaxed text-gray-700">
			Deze cultuurhistorische tijdreis geeft inzicht in de keuzes die hebben geleid tot het
			Rotterdam van nu, en kan inspireren om historische kennis opnieuw te benutten.
		</p>

		<section class="mt-6 border-t border-gray-200 pt-5">
			<h3 class="mb-3 text-sm font-bold text-gray-900">Sneltoetsen</h3>
			<dl class="space-y-3 text-sm text-gray-700">
				<div class="grid grid-cols-[auto_1fr] items-center gap-3">
					<dt class="flex flex-wrap items-center gap-1.5">
						<kbd class={keyClass}>⌘</kbd>
						<kbd class={keyClass}>K</kbd>
						<span class="text-xs text-gray-400">/</span>
						<kbd class={keyClass}>Ctrl</kbd>
						<kbd class={keyClass}>K</kbd>
					</dt>
					<dd>Kaartlagen openen</dd>
				</div>

				<div class="grid grid-cols-[auto_1fr] items-center gap-3">
					<dt class="flex items-center gap-1.5">
						<kbd class={keyClass}>[</kbd>
						<kbd class={keyClass}>]</kbd>
					</dt>
					<dd>Door kaarten van hetzelfde jaar bladeren</dd>
				</div>

				<div class="grid grid-cols-[auto_1fr] items-center gap-3">
					<dt class="flex items-center gap-1.5">
						<kbd class={keyClass}>Shift</kbd>
						<kbd class={keyClass}>↑</kbd>
						<kbd class={keyClass}>↓</kbd>
					</dt>
					<dd>Naar het volgende of vorige beschikbare kaartjaar</dd>
				</div>

				<div class="grid grid-cols-[auto_1fr] items-center gap-3">
					<dt class="flex items-center gap-1.5">
						<kbd class={keyClass}>←</kbd>
						<kbd class={keyClass}>↑</kbd>
						<kbd class={keyClass}>↓</kbd>
						<kbd class={keyClass}>→</kbd>
					</dt>
					<dd>Kaartbeeld verschuiven</dd>
				</div>

				<div class="grid grid-cols-[auto_1fr] items-center gap-3">
					<dt class="flex items-center gap-1.5">
						<kbd class={keyClass}>+</kbd>
						<kbd class={keyClass}>=</kbd>
						<kbd class={keyClass}>-</kbd>
					</dt>
					<dd>In- en uitzoomen</dd>
				</div>

				<div class="grid grid-cols-[auto_1fr] items-center gap-3">
					<dt class="flex items-center gap-1.5">
						<kbd class={keyClass}>Shift</kbd>
						<kbd class={keyClass}>←</kbd>
						<kbd class={keyClass}>→</kbd>
					</dt>
					<dd>Kaartbeeld draaien</dd>
				</div>

				<div class="grid grid-cols-[auto_1fr] items-center gap-3">
					<dt class="flex items-center gap-1.5">
						<kbd class={keyClass}>F</kbd>
					</dt>
					<dd>Filter op kaarten in beeld aan- of uitzetten</dd>
				</div>

				<div class="grid grid-cols-[auto_1fr] items-center gap-3">
					<dt class="flex items-center gap-1.5">
						<kbd class={keyClass}>R</kbd>
					</dt>
					<dd>Kaartoriëntatie volgen aan- of uitzetten</dd>
				</div>

				<div class="grid grid-cols-[auto_1fr] items-center gap-3">
					<dt class="flex items-center gap-1.5">
						<kbd class={keyClass}>Z</kbd>
					</dt>
					<dd>Kaartlaagfocus volgen aan- of uitzetten</dd>
				</div>

				<div class="grid grid-cols-[auto_1fr] items-center gap-3">
					<dt class="flex items-center gap-1.5">
						<kbd class={wideKeyClass}>Spatie</kbd>
					</dt>
					<dd>Historische kaartlagen tijdelijk verbergen</dd>
				</div>
			</dl>
		</section>
	</div>
</Modal>
