export function isAbsoluteUrl(value: string) {
	const url = value.trim();
	return /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//');
}

export function getPublicAssetPath(value: string) {
	if (isAbsoluteUrl(value)) return undefined;

	const publicPath = value
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\.\//, '')
		.replace(/^\/+/, '')
		.replace(/^static\//, '');

	return publicPath || undefined;
}

export function resolvePublicAssetUrl(value: string, basePath = '') {
	const url = value.trim();
	if (!url || isAbsoluteUrl(url)) return url;

	const publicPath = getPublicAssetPath(url);
	if (!publicPath) return url;

	return withBasePath(publicPath, basePath);
}

export function resolveAbsolutePublicAssetUrl(value: string, origin: string, basePath = '') {
	const url = resolvePublicAssetUrl(value, basePath);
	return isAbsoluteUrl(url) ? url : new URL(url, origin).href;
}

function withBasePath(path: string, basePath: string) {
	const normalizedBasePath = basePath === '/' ? '' : basePath.replace(/\/$/, '');
	const normalizedPath = path.replace(/^\/+/, '');

	if (
		normalizedBasePath &&
		(normalizedPath === normalizedBasePath.slice(1) ||
			normalizedPath.startsWith(`${normalizedBasePath.slice(1)}/`))
	) {
		return `/${normalizedPath}`;
	}

	return `${normalizedBasePath}/${normalizedPath}`;
}
