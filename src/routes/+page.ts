import type { AppConfig, MapMetadata } from '$lib/types';
import { collection, config } from '$lib/content';

export function load() {
	return {
		config: config as AppConfig,
		collection: collection as MapMetadata[]
	};
}
