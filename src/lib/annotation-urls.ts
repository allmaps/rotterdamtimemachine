import { base } from '$app/paths';

export function isAbsoluteAnnotationUrl(annotation: string) {
	try {
		new URL(annotation);
		return true;
	} catch {
		return false;
	}
}

export function getAnnotationPublicPath(annotation: string) {
	if (isAbsoluteAnnotationUrl(annotation)) return undefined;

	const publicPath = annotation
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\.\//, '')
		.replace(/^\/+/, '')
		.replace(/^static\//, '');

	return publicPath || undefined;
}

export function getAnnotationFetchUrl(annotation: string) {
	if (isAbsoluteAnnotationUrl(annotation)) return annotation;

	const publicPath = getAnnotationPublicPath(annotation);
	return publicPath ? withBasePath(publicPath) : annotation;
}

export function getAnnotationPublicUrl(annotation: string, origin: string) {
	if (isAbsoluteAnnotationUrl(annotation)) return annotation;

	return new URL(getAnnotationFetchUrl(annotation), origin).href;
}

function withBasePath(path: string) {
	const normalizedBase = base === '/' ? '' : base;
	return `${normalizedBase}/${path}`;
}
