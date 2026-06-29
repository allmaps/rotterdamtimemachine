import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import ViteYaml from '@modyfi/vite-plugin-yaml';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');

	return {
		define: {
			__APP_CONFIG_FILE__: JSON.stringify(env.CONFIG || 'config.yml')
		},
		plugins: [ViteYaml(), tailwindcss(), sveltekit()],
		server: {
			host: 'localhost'
		}
	};
});
