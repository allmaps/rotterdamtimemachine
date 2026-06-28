<script lang="ts">
	import { comparison } from '$lib/store.svelte';
	import Search from '$lib/components/Search.svelte';
	import { Columns2, Info, Share2 } from '@lucide/svelte';

	let {
		onOverOpen,
		onShareOpen
	}: {
		onOverOpen: () => void;
		onShareOpen: () => void;
	} = $props();

	function toggleCompare() {
		comparison.active = !comparison.active;
	}
</script>

<header class="font-bolder">
	<nav
		aria-label="Global"
		class="flex flex-none items-center justify-between gap-2 border-b border-green-900/20 bg-green-700 p-2 text-white md:px-8"
	>
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<Search />

			<button
				onclick={toggleCompare}
				aria-label="Vergelijkmodus"
				aria-pressed={comparison.active}
				class="flex h-8 items-center gap-2 rounded px-2 text-sm font-semibold hover:bg-green-800 md:px-3 {comparison.active
					? 'bg-green-800'
					: ''}"
			>
				<Columns2 class="h-4 w-4" />
				<span class="hidden md:inline">{comparison.active ? 'Sluiten' : 'Vergelijken'}</span>
			</button>
		</div>

		<div class="relative flex flex-none justify-center px-1 text-center">
			<h1 class="font-heading text-lg leading-none font-bold select-none md:text-2xl">
				Rotterdam Tijdmachine
			</h1>
		</div>

		<div class="flex flex-1 justify-end gap-1 md:gap-2">
			<button
				onclick={onOverOpen}
				aria-label="Over"
				class="flex h-8 items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-green-800 md:px-3"
			>
				<Info class="h-4 w-4" />
				<span class="hidden sm:inline">Over</span>
			</button>
			<button
				onclick={onShareOpen}
				aria-label="Delen"
				class="flex h-8 items-center gap-1 rounded px-2 text-sm font-semibold hover:bg-green-800 md:px-3"
			>
				<Share2 class="h-4 w-4" />
				<span class="hidden sm:inline">Delen</span>
			</button>
		</div>
	</nav>
</header>
