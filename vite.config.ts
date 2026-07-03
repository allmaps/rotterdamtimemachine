import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import ViteYaml from '@modyfi/vite-plugin-yaml';
import { defineConfig, loadEnv } from 'vite';
import { generateAnnotations } from './scripts/generate-annotations.ts';
import type { Plugin, ViteDevServer } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const configFile = env.CONFIG || 'config.yml';

	return {
		define: {
			__APP_CONFIG_FILE__: JSON.stringify(configFile)
		},
		plugins: [generateAnnotationsPlugin(configFile), ViteYaml(), tailwindcss(), sveltekit()],
		server: {
			host: 'localhost'
		}
	};
});

function generateAnnotationsPlugin(configFile: string): Plugin {
	let watchedFiles = new Set<string>();
	let pendingGeneration: Promise<void> | undefined;
	let generated = false;

	async function runGenerator(force = false) {
		if (generated && !force) return;

		pendingGeneration ??= generateAnnotations({ configFile })
			.then((result) => {
				watchedFiles = new Set(
					result.watchedFiles.filter((file: unknown): file is string => typeof file === 'string')
				);
				generated = true;
			})
			.finally(() => {
				pendingGeneration = undefined;
			});

		return pendingGeneration;
	}

	return {
		name: 'rotterdam-tijdmachine:generate-annotations',
		async buildStart() {
			await runGenerator();
		},
		async configureServer(server: ViteDevServer) {
			await runGenerator();
			server.watcher.add([...watchedFiles]);

			server.watcher.on('change', async (file: string) => {
				if (!watchedFiles.has(file)) return;

				await runGenerator(true);
				server.watcher.add([...watchedFiles]);
				server.ws.send({ type: 'full-reload' });
			});
		}
	};
}
