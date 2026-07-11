import { WarpedMapList } from '@allmaps/render';
import mapsUrl from '$lib/generated/maps.json?url';
import { collection } from '$lib/content';

import type { GeoreferencedMap } from '@allmaps/annotation';
import type { WebGL2WarpedMap } from '@allmaps/render/webgl2';

type GeneratedMaps = {
	maps: GeoreferencedMap[];
};

export const mapIdsByAnnotation = new Map<string, Set<string>>();
export const annotationsByMapId = new Map<string, Set<string>>();
export const earliestAnnotationByMapId = new Map<string, string>();
export const annotationById = new Map<string, string>();
export const idByAnnotation = new Map<string, string>();

let georeferencedMaps: GeoreferencedMap[] = [];
let loaded = false;
let loadPromise: Promise<void> | undefined;

export function loadWarpedMapData() {
	loadPromise ??= loadGeneratedAnnotations();
	return loadPromise;
}

export function isWarpedMapDataLoaded() {
	return loaded;
}

export const getWarpedMapList = () => {
	if (!loaded) {
		throw new Error('Warped map data has not been loaded yet');
	}

	const warpedMapList = new WarpedMapList<WebGL2WarpedMap>();
	warpedMapList.addGeoreferencedMaps(georeferencedMaps);
	return warpedMapList;
};

async function loadGeneratedAnnotations() {
	const mapsData = await fetchGeneratedJson<GeneratedMaps>(mapsUrl, 'Generated maps');

	mapIdsByAnnotation.clear();
	annotationsByMapId.clear();
	earliestAnnotationByMapId.clear();
	annotationById.clear();
	idByAnnotation.clear();

	georeferencedMaps = mapsData.maps ?? [];

	for (const map of collection) {
		const ids = map.mapIds.filter(Boolean);

		annotationById.set(map.id, map.annotation);
		idByAnnotation.set(map.annotation, map.id);
		mapIdsByAnnotation.set(map.annotation, new Set(ids));

		for (const id of ids) {
			if (!earliestAnnotationByMapId.has(id)) {
				earliestAnnotationByMapId.set(id, map.annotation);
			}

			const annotations = annotationsByMapId.get(id) ?? new Set<string>();
			annotations.add(map.annotation);
			annotationsByMapId.set(id, annotations);
		}
	}

	loaded = true;
}

async function fetchGeneratedJson<T>(url: string, label: string) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${label} request failed with status ${response.status}`);
	}

	return (await response.json()) as T;
}
