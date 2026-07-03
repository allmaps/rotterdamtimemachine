import type { AppConfig } from '$lib/types';
import { config } from '$lib/content';

export const prerender = true;
export const trailingSlash = 'always';

export function load() {
	return {
		config: config as AppConfig
	};
}
