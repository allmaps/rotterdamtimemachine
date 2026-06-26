<script lang="ts">
	import { MapCollection } from '$lib/models/MapCollection';
	import { favorites, toggleFavorite, loadedAnnotations } from '$lib/store.svelte';

	let {
		annotation = $bindable()
	}: {
		annotation?: string;
	} = $props();

	const collection = new MapCollection();
	const maps = collection.getAllMaps();

	$effect(() => {
		if (!annotation && maps[0]) {
			annotation = maps[0].metadata.annotation;
		}
	});

	function select(map: (typeof maps)[0]) {
		annotation = map.metadata.annotation;
	}

	let activeAnnotation = $derived(annotation ?? maps[0]?.metadata.annotation);
	let toonAlleen = $state(false);
	let periodeFilter = $state('alle');

	let zichtbareKaarten = $derived(
		maps.filter((m) => {
			const beschikbaar =
				loadedAnnotations.size === 0 || loadedAnnotations.has(m.metadata.annotation);
			if (!beschikbaar) return false;
			const favorietOk = toonAlleen ? favorites.includes(m.metadata.annotation) : true;
			const periodeOk =
				periodeFilter === 'alle'
					? true
					: periodeFilter === 'voor1850'
						? m.metadata.year < 1850
						: periodeFilter === '1850-1900'
							? m.metadata.year >= 1850 && m.metadata.year < 1900
							: periodeFilter === '1900-1940'
								? m.metadata.year >= 1900 && m.metadata.year < 1940
								: periodeFilter === 'na1940'
									? m.metadata.year >= 1940
									: true;
			return favorietOk && periodeOk;
		})
	);
</script>

<aside class="h-full w-72 flex-none overflow-y-auto bg-gray-50 p-4">
	<h2 class="mb-3 text-sm font-bold tracking-widest text-gray-500 uppercase">Kaartcollectie</h2>

	<div class="mb-3 flex gap-2">
		<button
			onclick={() => (toonAlleen = false)}
			class="flex-1 rounded py-1 text-xs font-bold {!toonAlleen
				? 'bg-gray-800 text-white'
				: 'bg-gray-200 text-gray-600'}"
		>
			Alle kaarten
		</button>
		<button
			onclick={() => (toonAlleen = true)}
			class="flex-1 rounded py-1 text-xs font-bold {toonAlleen
				? 'bg-red-500 text-white'
				: 'bg-gray-200 text-gray-600'}"
		>
			❤️ Favorieten
		</button>
	</div>

	<p class="mb-1 text-xs font-bold tracking-widest text-gray-500 uppercase">Tijdperiode</p>
	<select
		bind:value={periodeFilter}
		class="mb-3 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:ring-1 focus:ring-green-700 focus:outline-none"
	>
		<option value="alle">Alle periodes</option>
		<option value="voor1850">Voor 1850</option>
		<option value="1850-1900">1850 – 1900</option>
		<option value="1900-1940">1900 – 1940</option>
		<option value="na1940">Na 1940</option>
	</select>

	<ul class="mt-6 flex flex-col divide-y divide-gray-200">
		{#each zichtbareKaarten as map (map.metadata.annotation)}
			<li class="flex items-center">
				<button
					onclick={() => select(map)}
					class="flex flex-1 items-center gap-3 px-3 py-2 {activeAnnotation ===
					map.metadata.annotation
						? 'bg-gray-800 text-white'
						: 'hover:bg-gray-200'}"
				>
					<span class="text-xs font-bold {map.getYearColor()}">{map.metadata.year}</span>
					<span class="text-sm">{map.metadata.label}</span>
				</button>
				<button
					onclick={() => toggleFavorite(map.metadata.annotation)}
					class="px-2 py-2 text-gray-400 hover:text-red-500"
					title="Favoriet"
				>
					{favorites.includes(map.metadata.annotation) ? '❤️' : '🤍'}
				</button>
			</li>
		{/each}
	</ul>
</aside>
