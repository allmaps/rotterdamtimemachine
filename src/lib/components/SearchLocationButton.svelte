<script lang="ts">
	import { liveUserLocationTracking } from '$lib/app-state.svelte.js';
	import { toggleLiveUserLocationTracking } from '$lib/services/live-location.svelte.js';
	import { LocateFixed } from '@lucide/svelte';
	import type { AppConfig } from '$lib/types';

	let {
		config,
		onLocated
	}: {
		config: AppConfig['search'];
		onLocated?: () => void;
	} = $props();

	let previousStatus = liveUserLocationTracking.status;
	let active = $derived(liveUserLocationTracking.status !== 'off');
	let locating = $derived(liveUserLocationTracking.status === 'locating');
	let label = $derived(
		locating ? config.locating : active ? config.stopLocation : config.useLocation
	);

	$effect(() => {
		const status = liveUserLocationTracking.status;
		if (previousStatus === 'locating' && status === 'active') {
			onLocated?.();
		}
		previousStatus = status;
	});
</script>

<button
	type="button"
	aria-label={label}
	title={label}
	aria-pressed={active}
	class="cursor-pointer rounded p-1 transition hover:bg-gray-100 hover:text-brand-main {active
		? 'bg-brand-soft text-brand-main'
		: 'text-gray-500'}"
	onclick={() => toggleLiveUserLocationTracking(config)}
>
	<LocateFixed class="h-5 w-5 {locating ? 'animate-pulse' : ''}" />
</button>
