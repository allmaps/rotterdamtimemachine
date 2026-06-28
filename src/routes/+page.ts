import type { AppConfig, MapMetadata } from '$lib/types';
import config from '../../config.yml';
import collection from '../../collection.yml';

export function load() {
	return {
		config: config as AppConfig,
		collection: collection as MapMetadata[]
	};
}
