<script lang="ts">
	import { MapCollection } from '$lib/models/MapCollection';
	import { viewState, favorites, toggleFavorite } from '$lib/store.svelte';

	let {
		onSelect = null,
		opacity = null,
		onOpacityChange = null
	}: {
		onSelect?: ((annotation: string) => void) | null;
		opacity?: number | null;
		onOpacityChange?: ((value: number) => void) | null;
	} = $props();

	const collection = new MapCollection();
	const maps = collection.getAllMaps();

	let activeYear = $state(maps[0]?.metadata.year);

	$effect(() => {
		if (!onSelect) {
			viewState.annotation = maps[0]?.metadata.annotation;
		}
	});

	function select(map: (typeof maps)[0]) {
		activeYear = map.metadata.year;
		if (onSelect) {
			onSelect(map.metadata.annotation);
		} else {
			viewState.annotation = map.metadata.annotation;
		}
	}

	function handleOpacity(e: Event) {
		const value = Number((e.target as HTMLInputElement).value);
		if (onOpacityChange) {
			onOpacityChange(value);
		} else {
			viewState.opacity = value;
		}
	}

	let currentOpacity = $derived(onSelect ? (opacity ?? 100) : viewState.opacity);
	let toonAlleen = $state(false);
	let periodeFilter = $state('alle');

	let zichtbareKaarten = $derived(
		maps.filter((m) => {
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

<aside
	class="w-56 flex-none overflow-y-auto bg-gray-50 p-4"
	style="font-family: 'Barlow Condensed', sans-serif;"
>
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
	<div class="mb-3 flex flex-wrap gap-1">
		<button
			onclick={() => (periodeFilter = 'alle')}
			class="rounded px-2 py-1 text-xs font-bold {periodeFilter === 'alle'
				? 'bg-gray-800 text-white'
				: 'bg-gray-200 text-gray-600'}"
		>
			Alle
		</button>
		<button
			onclick={() => (periodeFilter = 'voor1850')}
			class="rounded px-2 py-1 text-xs font-bold {periodeFilter === 'voor1850'
				? 'bg-orange-500 text-white'
				: 'bg-gray-200 text-gray-600'}"
		>
			&lt; 1850
		</button>
		<button
			onclick={() => (periodeFilter = '1850-1900')}
			class="rounded px-2 py-1 text-xs font-bold {periodeFilter === '1850-1900'
				? 'bg-yellow-500 text-white'
				: 'bg-gray-200 text-gray-600'}"
		>
			1850-1900
		</button>
		<button
			onclick={() => (periodeFilter = '1900-1940')}
			class="rounded px-2 py-1 text-xs font-bold {periodeFilter === '1900-1940'
				? 'bg-blue-500 text-white'
				: 'bg-gray-200 text-gray-600'}"
		>
			1900-1940
		</button>
		<button
			onclick={() => (periodeFilter = 'na1940')}
			class="rounded px-2 py-1 text-xs font-bold {periodeFilter === 'na1940'
				? 'bg-green-600 text-white'
				: 'bg-gray-200 text-gray-600'}"
		>
			&gt; 1940
		</button>
	</div>

	<ul class="flex flex-col divide-y divide-gray-200">
		{#each zichtbareKaarten as map}
			<li class="flex items-center">
				<button
					onclick={() => select(map)}
					class="flex flex-1 items-center gap-3 px-3 py-2 {activeYear === map.metadata.year
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

	<div class="mt-6 border-t border-gray-200 pt-4">
		<p class="mb-3 text-xs font-bold tracking-widest text-gray-500 uppercase">Transparantie</p>
		<input
			value={currentOpacity}
			oninput={handleOpacity}
			type="range"
			min="0"
			max="100"
			class="w-full accent-green-700"
		/>
		<div class="mt-1 flex justify-between text-xs text-gray-400">
			<span>0%</span>
			<span class="font-bold text-gray-700">{currentOpacity}%</span>
			<span>100%</span>
		</div>
	</div>

	<div class="mt-6 border-t border-gray-200 pt-4">
		<p class="mb-3 text-xs font-bold tracking-widest text-gray-500 uppercase">Kaartinfo</p>
		{#each maps as map}
			{#if map.metadata.year === activeYear}
				<dl class="flex flex-col gap-1 text-xs text-gray-700">
					<div class="flex justify-between border-b border-gray-100 py-1">
						<dt class="text-gray-500">Jaar</dt>
						<dd class="font-semibold">{map.metadata.year}</dd>
					</div>
					<div class="flex justify-between border-b border-gray-100 py-1">
						<dt class="text-gray-500">Bron</dt>
						<dd class="text-right font-semibold">{map.metadata.institution}</dd>
					</div>
					<div class="flex justify-between border-b border-gray-100 py-1">
						<dt class="text-gray-500">Formaat</dt>
						<dd class="font-semibold">{map.metadata.iiif ? 'IIIF / GeoRef' : 'GeoRef'}</dd>
					</div>
				</dl>

				<a
					href={map.metadata.iiif?.type === 'image'
						? map.metadata.iiif.url + '/full/full/0/default.jpg'
						: map.metadata.url}
					target="_blank"
					download
					class="mt-2 flex w-full items-center justify-center gap-2 rounded border border-green-700 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 15V3"
						/>
					</svg>
					Download kaart
				</a>
			{/if}
		{/each}
	</div>
</aside>
