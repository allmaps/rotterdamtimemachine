import { WarpedMapList } from '@allmaps/render';
import { parseAnnotation } from '@allmaps/annotation';
import collection from '../../collection.yml';

import type { WebGL2WarpedMap } from '@allmaps/render/webgl2';
import type { MapMetadata } from '$lib/types';

export const mapIdsByAnnotation = new Map<string, Set<string>>();
export const annotationsByMapId = new Map<string, string>();

const maps = collection as MapMetadata[];
const annotationUrls = maps.map((map) => map.annotation);

const georeferencedMaps = await Promise.all(
	annotationUrls.map(async (url) => {
		try {
			const resp = await fetch(url);
			if (resp.ok) {
				const data = await resp.json();
				const parsedAnnotations = parseAnnotation(data);
				const ids = parsedAnnotations.flatMap(({ id }) => (id ? [id] : []));
				mapIdsByAnnotation.set(url, new Set(ids));
				ids.forEach((id) => annotationsByMapId.set(id, url));
				return parsedAnnotations;
			}

			console.warn('Fetch failed for', url, resp);
			return [];
		} catch {
			console.warn('Fetch failed for', url);
			return [];
		}
	})
);

export const getWarpedMapList = () => {
	const warpedMapList = new WarpedMapList<WebGL2WarpedMap>();
	warpedMapList.addGeoreferencedMaps(georeferencedMaps.flat());
	return warpedMapList;
};
