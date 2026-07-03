import { WarpedMapList } from '@allmaps/render';
import annotationsUrl from '$lib/generated/maps.json?url';

import type { GeoreferencedMap } from '@allmaps/annotation';
import type { WebGL2WarpedMap } from '@allmaps/render/webgl2';

type GeneratedAnnotationEntry = {
	id: string;
	annotation: string;
	maps: GeoreferencedMap[];
};

type GeneratedAnnotations = {
	annotations: GeneratedAnnotationEntry[];
};

export const mapIdsByAnnotation = new Map<string, Set<string>>();
export const annotationsByMapId = new Map<string, string>();
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
	const response = await fetch(annotationsUrl);
	if (!response.ok) {
		throw new Error(`Generated annotations request failed with status ${response.status}`);
	}

	const data = (await response.json()) as GeneratedAnnotations;
	const entries = data.annotations ?? [];

	mapIdsByAnnotation.clear();
	annotationsByMapId.clear();
	annotationById.clear();
	idByAnnotation.clear();

	georeferencedMaps = entries.flatMap((entry) => {
		const ids = entry.maps.flatMap(({ id }) => (id ? [id] : []));

		annotationById.set(entry.id, entry.annotation);
		idByAnnotation.set(entry.annotation, entry.id);
		mapIdsByAnnotation.set(entry.annotation, new Set(ids));
		ids.forEach((id) => annotationsByMapId.set(id, entry.annotation));
		return entry.maps;
	});

	loaded = true;
}
