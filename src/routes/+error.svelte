<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { LoaderCircle } from '@lucide/svelte';

	const homeHref = resolve('/');
	const redirectDelay = 1200;

	let redirecting = $state(false);

	onMount(() => {
		if (!browser || page.status !== 404) return;

		redirecting = true;

		const redirectTimer = window.setTimeout(() => {
			const search = window.location.search;
			const hash = window.location.hash;

			window.location.replace(`${homeHref}${search}${hash}`);
		}, redirectDelay);

		return () => window.clearTimeout(redirectTimer);
	});
</script>

<svelte:head>
	<title>{page.status === 404 ? 'Pagina niet gevonden' : 'Er ging iets mis'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="grid min-h-[100dvh] place-items-center bg-brand-main px-4 py-10 text-white">
	<section class="w-full max-w-md text-center">
		<p class="font-heading text-sm font-bold tracking-wide uppercase opacity-70">{page.status}</p>
		<h1 class="mt-3 font-heading text-3xl font-bold">
			{#if page.status === 404}
				Pagina niet gevonden
			{:else}
				Er ging iets mis
			{/if}
		</h1>

		<p class="mt-4 text-sm leading-6 opacity-85">
			{#if page.status === 404}
				Deze pagina bestaat niet. Je wordt automatisch teruggebracht naar de tijdmachine.
			{:else}
				{page.error?.message ?? 'Probeer de pagina opnieuw te laden.'}
			{/if}
		</p>

		<div class="mt-6 flex items-center justify-center gap-3">
			{#if redirecting}
				<LoaderCircle class="h-5 w-5 animate-spin" />
			{/if}
			<a
				href={homeHref}
				class="rounded border border-white/40 px-4 py-2 text-sm font-semibold hover:bg-white hover:text-brand-main"
			>
				Naar de tijdmachine
			</a>
		</div>
	</section>
</main>
