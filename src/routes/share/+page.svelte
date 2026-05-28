<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		const params = window.location.search;
		goto('/' + params);
	});
</script>
