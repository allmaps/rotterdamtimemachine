import path from 'node:path';
import {
	DEFAULT_CONFIG_FILE,
	normalizeContentFileName,
	readYamlFileSync
} from './content-files.ts';

type AppConfig = {
	site?: {
		url?: string;
	};
};

export function resolveSvelteKitBasePath() {
	const configFile = normalizeContentFileName(process.env.CONFIG, DEFAULT_CONFIG_FILE);
	const config = readConfigSync(process.cwd(), configFile);

	return getSiteUrlPath(config.site?.url);
}

function normalizeBasePath(value: string) {
	const trimmed = value.trim();
	if (!trimmed || trimmed === '/') return '';

	const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	return withLeadingSlash.replace(/\/+$/, '');
}

function getSiteUrlPath(siteUrl: string | undefined) {
	const url = parseSiteUrl(siteUrl);
	if (!url) return '';

	return normalizeBasePath(url.pathname);
}

function readConfigSync(root: string, configFile: string) {
	const parsed = readYamlFileSync<AppConfig>(path.join(root, configFile));
	if (!parsed || typeof parsed !== 'object') {
		throw new Error(`${configFile} must contain a YAML object`);
	}

	return parsed;
}

function parseSiteUrl(siteUrl: string | undefined) {
	if (!siteUrl?.trim()) return undefined;

	try {
		return new URL(siteUrl);
	} catch {
		throw new Error(`site.url must be a valid URL: ${siteUrl}`);
	}
}
