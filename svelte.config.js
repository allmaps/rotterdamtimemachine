import adapter from '@sveltejs/adapter-static';
import { resolveSvelteKitBasePath } from './scripts/build-options.ts';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			fallback: '404.html'
		}),
		paths: {
			base: process.argv.includes('dev') ? '' : resolveSvelteKitBasePath()
		}
	}
};

export default config;
