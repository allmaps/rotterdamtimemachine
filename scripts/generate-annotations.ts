import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnnotation } from '@allmaps/annotation';
import { load as parseYaml } from 'js-yaml';
import type { GeoreferencedMap } from '@allmaps/annotation';

const DEFAULT_CONFIG_FILE = 'config.yml';
const DEFAULT_COLLECTION_FILE = 'collection.yml';
const GENERATED_FILE = 'src/lib/generated/maps.json';
const CACHE_DIRECTORY = '.cache/annotations';
const FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 20_000;
const FETCH_CONCURRENCY = 6;

type GenerateAnnotationsOptions = {
	root?: string;
	configFile?: string;
	refreshRemoteAnnotations?: boolean;
};

type AppConfig = {
	collection?: string;
};

type MapRecord = {
	annotation?: string;
};

type GeneratedAnnotationEntry = {
	id: string;
	annotation: string;
	maps: GeoreferencedMap[];
};

type GeneratedAnnotations = {
	config: string;
	collection: string;
	annotations: GeneratedAnnotationEntry[];
};

type GenerateAnnotationsResult = {
	generatedPath: string;
	watchedFiles: string[];
	annotationCount: number;
	mapCount: number;
};

export async function generateAnnotations(
	options: GenerateAnnotationsOptions = {}
): Promise<GenerateAnnotationsResult> {
	const root = options.root ? path.resolve(options.root) : process.cwd();
	const refreshRemoteAnnotations =
		options.refreshRemoteAnnotations ?? isTruthy(process.env.REFRESH_ANNOTATIONS);
	const configFileName = normalizeContentFileName(
		options.configFile ?? process.env.CONFIG,
		DEFAULT_CONFIG_FILE
	);
	const configPath = path.join(root, configFileName);
	const config = (await readYamlFile(configPath)) as AppConfig;
	const collectionFileName = resolveReferencedContentFile(
		config.collection,
		DEFAULT_COLLECTION_FILE,
		configFileName
	);
	const collectionPath = path.join(root, collectionFileName);
	const collection = (await readYamlFile(collectionPath)) as MapRecord[];

	if (!Array.isArray(collection)) {
		throw new Error(`${collectionFileName} must contain an array of map records`);
	}

	const annotationUrls = [
		...new Set(collection.map((map) => String(map?.annotation ?? '').trim()).filter(Boolean))
	];
	const entries = await mapWithConcurrency(annotationUrls, FETCH_CONCURRENCY, async (annotation) =>
		generateAnnotationEntry(annotation, root, refreshRemoteAnnotations)
	);
	validateUniqueAnnotationIds(entries);
	const generatedPath = path.join(root, GENERATED_FILE);
	const output: GeneratedAnnotations = {
		config: configFileName,
		collection: collectionFileName,
		annotations: entries
	};

	await mkdir(path.dirname(generatedPath), { recursive: true });
	await writeFile(generatedPath, `${JSON.stringify(output)}\n`);

	const watchedFiles = [
		configPath,
		collectionPath,
		...annotationUrls
			.map((url) => getLocalAnnotationPath(url, root))
			.filter((filePath): filePath is string => Boolean(filePath))
	];
	const mapCount = entries.reduce((total, entry) => total + entry.maps.length, 0);

	console.log(
		`Generated ${path.relative(root, generatedPath)} with ${mapCount} georeferenced maps from ${entries.length} annotations`
	);

	return {
		generatedPath,
		watchedFiles,
		annotationCount: entries.length,
		mapCount
	};
}

async function generateAnnotationEntry(
	annotation: string,
	root: string,
	refreshRemoteAnnotations: boolean
): Promise<GeneratedAnnotationEntry> {
	const data = await loadAnnotation(annotation, root, refreshRemoteAnnotations);
	const maps = parseAnnotation(data);

	return {
		id: getAnnotationId(annotation),
		annotation,
		maps
	};
}

async function loadAnnotation(
	annotation: string,
	root: string,
	refreshRemoteAnnotations: boolean
): Promise<unknown> {
	const localPath = getLocalAnnotationPath(annotation, root);
	if (localPath) {
		return JSON.parse(await readFile(localPath, 'utf8'));
	}

	if (!isAbsoluteUrl(annotation)) {
		throw new Error(
			`Annotation "${annotation}" does not exist in static/. Use a valid static path or an absolute URL.`
		);
	}

	return loadRemoteAnnotation(annotation, root, refreshRemoteAnnotations);
}

async function loadRemoteAnnotation(
	url: string,
	root: string,
	refreshRemoteAnnotations: boolean
): Promise<unknown> {
	const cachePath = getCachePath(url, root);

	if (!refreshRemoteAnnotations) {
		const cachedData = await readCachedJson(cachePath, url);
		if (cachedData) return cachedData;
	}

	try {
		const data = await fetchJsonWithRetry(url);
		await mkdir(path.dirname(cachePath), { recursive: true });
		await writeFile(cachePath, JSON.stringify(data));
		return data;
	} catch (error) {
		const cachedData = await readCachedJson(cachePath, url, false);
		if (cachedData) {
			console.warn(`Fetch failed for ${url}; using cached annotation`);
			return cachedData;
		}

		throw error;
	}
}

async function readCachedJson(
	cachePath: string,
	url: string,
	warnOnFailure = true
): Promise<unknown | undefined> {
	if (!existsSync(cachePath)) return undefined;

	try {
		return JSON.parse(await readFile(cachePath, 'utf8'));
	} catch {
		if (warnOnFailure) {
			console.warn(`Could not read cached annotation for ${url}; fetching it again`);
		}
		return undefined;
	}
}

async function fetchJsonWithRetry(url: string): Promise<unknown> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
		try {
			return await fetchJson(url);
		} catch (error) {
			lastError = error;
			if (attempt < FETCH_ATTEMPTS) {
				await sleep(300 * attempt);
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error(`Annotation request failed for ${url}`);
}

async function fetchJson(url: string): Promise<unknown> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			headers: {
				accept: 'application/json'
			},
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`Annotation request failed with status ${response.status} for ${url}`);
		}

		return response.json();
	} finally {
		clearTimeout(timeout);
	}
}

function getLocalAnnotationPath(annotation: string, root: string): string | undefined {
	if (isAbsoluteUrl(annotation)) return undefined;

	const publicPath = normalizePublicPath(annotation);
	if (!publicPath) return undefined;

	const localPath = path.join(root, 'static', publicPath);
	return existsSync(localPath) ? localPath : undefined;
}

function getCachePath(url: string, root: string): string {
	const hash = createHash('sha256').update(url).digest('hex');
	return path.join(root, CACHE_DIRECTORY, `${hash}.json`);
}

function getAnnotationId(annotation: string): string {
	const value = annotation.trim();

	if (isAbsoluteUrl(value)) {
		const allmapsId = getAllmapsAnnotationId(value);
		return allmapsId ?? createHash('sha1').update(value).digest('hex');
	}

	return createHash('sha1').update(normalizePublicPath(value)).digest('hex').slice(0, 16);
}

function getAllmapsAnnotationId(value: string): string | undefined {
	try {
		const url = new URL(value);
		if (url.hostname !== 'annotations.allmaps.org') return undefined;

		const segments = url.pathname.split('/').filter(Boolean);
		const typeIndex = segments.findIndex((segment) =>
			['maps', 'manifests', 'images'].includes(segment)
		);
		const idSegment = typeIndex >= 0 ? segments[typeIndex + 1] : undefined;
		const id = idSegment?.split('@')[0];

		return id || undefined;
	} catch {
		return undefined;
	}
}

function validateUniqueAnnotationIds(entries: GeneratedAnnotationEntry[]) {
	const seenIds = new Map<string, string>();

	for (const entry of entries) {
		const existingAnnotation = seenIds.get(entry.id);
		if (existingAnnotation) {
			throw new Error(
				`Annotation identifier collision for "${entry.id}": ${existingAnnotation} and ${entry.annotation}`
			);
		}

		seenIds.set(entry.id, entry.annotation);
	}
}

async function readYamlFile(filePath: string): Promise<unknown> {
	return parseYaml(await readFile(filePath, 'utf8'));
}

function normalizeContentFileName(fileName: string | undefined, fallback: string): string {
	const normalized = String(fileName || fallback)
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\.\//, '')
		.replace(/^\/+/, '');

	if (!normalized || normalized.startsWith('../')) {
		throw new Error(`Content file paths must stay inside the project: ${normalized}`);
	}

	return normalized;
}

function resolveReferencedContentFile(
	fileName: string | undefined,
	fallback: string,
	referenceFileName: string
): string {
	const normalized = normalizeContentFileName(fileName, fallback);
	if (!fileName?.trim() || normalized.includes('/')) return normalized;

	const referenceDirectory = path.posix.dirname(referenceFileName);
	return referenceDirectory === '.' ? normalized : `${referenceDirectory}/${normalized}`;
}

function normalizePublicPath(value: string): string {
	return value
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\.\//, '')
		.replace(/^\/+/, '')
		.replace(/^static\//, '');
}

function isAbsoluteUrl(value: string): boolean {
	const url = value.trim();
	return /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//');
}

function isTruthy(value: string | undefined): boolean {
	return value === '1' || value?.toLowerCase() === 'true';
}

async function mapWithConcurrency<T, U>(
	values: T[],
	concurrency: number,
	callback: (value: T, index: number) => Promise<U>
): Promise<U[]> {
	const results: U[] = new Array(values.length);
	let index = 0;

	async function worker(): Promise<void> {
		while (index < values.length) {
			const currentIndex = index;
			index += 1;
			results[currentIndex] = await callback(values[currentIndex], currentIndex);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));

	return results;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
	generateAnnotations().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
