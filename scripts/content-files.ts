import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { load as parseYaml } from 'js-yaml';

export const DEFAULT_CONFIG_FILE = 'config.yml';
export const DEFAULT_COLLECTION_FILE = 'collection.yml';

export function normalizeContentFileName(fileName: string | undefined, fallback: string): string {
	const normalized = String(fileName || fallback)
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\.\//, '')
		.replace(/^\/+/, '');

	if (!normalized || normalized.split('/').includes('..')) {
		throw new Error(`Content file paths must stay inside the project: ${normalized}`);
	}

	return normalized;
}

export function resolveReferencedContentFile(
	fileName: string | undefined,
	fallback: string,
	referenceFileName: string
): string {
	const normalized = normalizeContentFileName(fileName, fallback);
	if (!fileName?.trim() || normalized.includes('/')) return normalized;

	const referenceDirectory = getDirectoryName(referenceFileName);
	return referenceDirectory ? `${referenceDirectory}/${normalized}` : normalized;
}

export async function readYamlFile<T = unknown>(filePath: string): Promise<T> {
	return parseYaml(await readFile(filePath, 'utf8')) as T;
}

export function readYamlFileSync<T = unknown>(filePath: string): T {
	return parseYaml(readFileSync(filePath, 'utf8')) as T;
}

function getDirectoryName(fileName: string) {
	const lastSlashIndex = fileName.lastIndexOf('/');
	return lastSlashIndex === -1 ? '' : fileName.slice(0, lastSlashIndex);
}
