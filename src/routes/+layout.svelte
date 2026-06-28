<script lang="ts">
	import './layout.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { AppConfig } from '$lib/types';

	let {
		data,
		children
	}: {
		data: { config: AppConfig };
		children: import('svelte').Snippet;
	} = $props();

	let config = $derived(data.config);
	let siteName = $derived(config.site.name);
	let siteUrl = $derived(config.site.url);
	let description = $derived(config.site.description);
</script>

<svelte:head>
	<title>{siteName}</title>
	<meta name="description" content={description} />
	<meta name="application-name" content={siteName} />
	<meta name="apple-mobile-web-app-title" content={siteName} />
	<meta name="theme-color" content={config.site.themeColor} />
	<meta name="color-scheme" content="light" />
	<meta name="robots" content="index, follow" />
	<meta name="format-detection" content="telephone=no" />

	<meta property="og:type" content="website" />
	<meta property="og:locale" content={config.site.locale} />
	<meta property="og:site_name" content={siteName} />
	<meta property="og:url" content={siteUrl} />
	<meta property="og:title" content={siteName} />
	<meta property="og:description" content={description} />

	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={siteName} />
	<meta name="twitter:description" content={description} />

	<link rel="canonical" href={siteUrl} />
	<link rel="icon" href={favicon} />
</svelte:head>
{@render children()}
