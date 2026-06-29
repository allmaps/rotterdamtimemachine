import { WarpedMapList } from '@allmaps/render';
import { parseAnnotation } from '@allmaps/annotation';
import { collection } from '$lib/content';
import { getAnnotationFetchUrl } from '$lib/annotation-urls';

import type { WebGL2WarpedMap } from '@allmaps/render/webgl2';

export const mapIdsByAnnotation = new Map<string, Set<string>>();
export const annotationsByMapId = new Map<string, string>();

const annotationUrls = collection.map((map) => map.annotation);

const georeferencedMaps = await Promise.all(
	annotationUrls.map(async (url) => {
		try {
			const data = await loadAnnotation(url);
			const parsedAnnotations = parseAnnotation(data);
			const ids = parsedAnnotations.flatMap(({ id }) => (id ? [id] : []));
			mapIdsByAnnotation.set(url, new Set(ids));
			ids.forEach((id) => annotationsByMapId.set(id, url));
			return parsedAnnotations;
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

async function loadAnnotation(url: string) {
	const fetchUrl = getAnnotationFetchUrl(url);
	const resp = await fetch(fetchUrl);
	if (!resp.ok) {
		throw new Error(`Annotation request failed with status ${resp.status}`);
	}

	return resp.json();
}
