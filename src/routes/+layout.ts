import type { AppConfig } from '$lib/types';
import config from '../../config.yml';

export const prerender = true;
export const trailingSlash = 'always';

export function load() {
	return {
		config: config as AppConfig
	};
}
