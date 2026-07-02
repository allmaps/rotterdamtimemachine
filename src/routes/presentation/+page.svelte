<script lang="ts">
	import TimeMachineApp from '$lib/components/TimeMachineApp.svelte';
	import type { PageData } from './$types';

	let {
		data
	}: {
		data: PageData;
	} = $props();
</script>

<TimeMachineApp config={data.config} collection={data.collection} startInPresentation />
