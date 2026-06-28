import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import ViteYaml from '@modyfi/vite-plugin-yaml';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [ViteYaml(), tailwindcss(), sveltekit()],
	server: {
		host: 'localhost'
	}
});
