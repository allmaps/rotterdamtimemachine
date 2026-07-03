import { readFileSync } from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';

const DEFAULT_CONFIG_FILE = 'config.yml';

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

export function normalizeContentFileName(fileName: string | undefined, fallback: string) {
	const normalized = (fileName?.trim() || fallback)
		.replace(/\\/g, '/')
		.replace(/^\.\//, '')
		.replace(/^\/+/, '');

	if (normalized.startsWith('../')) {
		throw new Error(`Content file paths must stay inside the project: ${normalized}`);
	}

	return normalized;
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
	return parseConfig(readFileSync(path.join(root, configFile), 'utf8'), configFile);
}

function parseConfig(source: string, configFile: string) {
	const parsed = parseYaml(source) as AppConfig;
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
