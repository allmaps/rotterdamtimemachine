import collectionData from '$lib/generated/collection.json';
import configData from '$lib/generated/config.json';
import type { AppConfig, MapMetadata } from '$lib/types';

export const config = configData as unknown as AppConfig;
export const collection = collectionData as unknown as MapMetadata[];
