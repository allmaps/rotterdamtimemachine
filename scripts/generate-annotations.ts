import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnnotation } from '@allmaps/annotation';
import {
	DEFAULT_COLLECTION_FILE,
	DEFAULT_CONFIG_FILE,
	normalizeContentFileName,
	readYamlFile,
	resolveReferencedContentFile
} from './content-files.ts';
import type { GeoreferencedMap } from '@allmaps/annotation';

const GENERATED_CONFIG_FILE = 'src/lib/generated/config.json';
const GENERATED_COLLECTION_FILE = 'src/lib/generated/collection.json';
const GENERATED_MAPS_FILE = 'src/lib/generated/maps.json';
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

type MapRecord = Record<string, unknown> & {
	year?: number | string;
	annotation?: string;
};

type MapSeriesRecord = Record<string, unknown> & {
	id?: string;
	seriesId?: string;
	seriesLabel?: string;
	seriesTitle?: string;
	label?: string;
	title?: string;
	items: MapRecord[];
};

type ParsedAnnotationEntry = {
	id: string;
	annotation: string;
	mapIds: string[];
	maps: GeoreferencedMap[];
};

type GeneratedMaps = {
	config: string;
	collection: string;
	maps: GeoreferencedMap[];
};

type GeneratedMapRecord = MapRecord & {
	id: string;
	mapIds: string[];
	seriesId?: string;
	seriesLabel?: string;
	seriesTitle?: string;
	seriesIndex?: number;
	seriesTotal?: number;
};

type GenerateAnnotationsResult = {
	generatedPath: string;
	generatedPaths: string[];
	watchedFiles: string[];
	annotationCount: number;
	mapCount: number;
	mapReferenceCount: number;
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
	const collection = (await readYamlFile(collectionPath)) as Array<MapRecord | MapSeriesRecord>;

	if (!Array.isArray(collection)) {
		throw new Error(`${collectionFileName} must contain an array of map records`);
	}

	const sortedCollection = sortCollection(expandCollection(collection));
	const annotationUrls = [
		...new Set(sortedCollection.map((map) => String(map?.annotation ?? '').trim()).filter(Boolean))
	];
	const entries = await mapWithConcurrency(annotationUrls, FETCH_CONCURRENCY, async (annotation) =>
		generateAnnotationEntry(annotation, root, refreshRemoteAnnotations)
	);
	validateUniqueAnnotationIds(entries);
	const maps = getUniqueMaps(entries);
	const entriesByAnnotation = new Map(entries.map((entry) => [entry.annotation, entry]));
	const generatedCollection = sortedCollection.map((map) =>
		addAnnotationDataToCollectionRecord(map, entriesByAnnotation)
	);
	const generatedConfigPath = path.join(root, GENERATED_CONFIG_FILE);
	const generatedCollectionPath = path.join(root, GENERATED_COLLECTION_FILE);
	const generatedMapsPath = path.join(root, GENERATED_MAPS_FILE);
	const generatedMaps: GeneratedMaps = {
		config: configFileName,
		collection: collectionFileName,
		maps
	};

	await mkdir(path.dirname(generatedConfigPath), { recursive: true });
	await Promise.all([
		writeFile(generatedConfigPath, `${JSON.stringify(config)}\n`),
		writeFile(generatedCollectionPath, `${JSON.stringify(generatedCollection)}\n`),
		writeFile(generatedMapsPath, `${JSON.stringify(generatedMaps)}\n`)
	]);

	const watchedFiles = [
		configPath,
		collectionPath,
		...annotationUrls
			.map((url) => getLocalAnnotationPath(url, root))
			.filter((filePath): filePath is string => Boolean(filePath))
	];
	const mapReferenceCount = entries.reduce((total, entry) => total + entry.mapIds.length, 0);

	console.log(
		`Generated content and annotation data in ${path.relative(
			root,
			path.dirname(generatedConfigPath)
		)} with ${generatedCollection.length} collection records, ${maps.length} unique georeferenced maps (${mapReferenceCount} map references) from ${entries.length} annotations`
	);

	return {
		generatedPath: generatedMapsPath,
		generatedPaths: [generatedConfigPath, generatedCollectionPath, generatedMapsPath],
		watchedFiles,
		annotationCount: entries.length,
		mapCount: maps.length,
		mapReferenceCount
	};
}

function expandCollection(collection: Array<MapRecord | MapSeriesRecord>): MapRecord[] {
	const maps: MapRecord[] = [];

	for (const [index, record] of collection.entries()) {
		if (isSeriesRecord(record)) {
			maps.push(...expandSeriesRecord(record, index));
		} else {
			maps.push(record);
		}
	}

	return maps;
}

function isSeriesRecord(record: MapRecord | MapSeriesRecord): record is MapSeriesRecord {
	return Array.isArray((record as MapSeriesRecord).items);
}

function expandSeriesRecord(series: MapSeriesRecord, seriesOrder: number): MapRecord[] {
	const items = series.items;
	const shared: Record<string, unknown> = { ...series };
	delete shared.items;
	delete shared.type;
	delete shared.id;
	delete shared.seriesId;
	delete shared.seriesLabel;
	delete shared.seriesTitle;

	const resolvedSeriesId = getSeriesId(series, seriesOrder);
	const resolvedSeriesLabel = String(series.seriesLabel ?? series.label ?? '').trim();
	const resolvedSeriesTitle = String(series.seriesTitle ?? series.title ?? '').trim();

	return items.map((item, index) => ({
		...shared,
		...item,
		seriesId: resolvedSeriesId,
		seriesLabel: resolvedSeriesLabel,
		seriesTitle: resolvedSeriesTitle,
		seriesIndex: index,
		seriesTotal: items.length
	}));
}

function getSeriesId(series: MapSeriesRecord, seriesOrder: number) {
	const explicitId = String(series.seriesId ?? series.id ?? '').trim();
	if (explicitId) return explicitId;

	const source = String(series.label ?? series.title ?? `series-${seriesOrder + 1}`)
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	return source || `series-${seriesOrder + 1}`;
}

function addAnnotationDataToCollectionRecord(
	map: MapRecord,
	entriesByAnnotation: Map<string, ParsedAnnotationEntry>
): GeneratedMapRecord {
	const annotation = String(map.annotation ?? '').trim();
	const entry = entriesByAnnotation.get(annotation);

	return {
		...map,
		id: entry?.id ?? (annotation ? getAnnotationId(annotation) : ''),
		mapIds: entry?.mapIds ?? []
	};
}

async function generateAnnotationEntry(
	annotation: string,
	root: string,
	refreshRemoteAnnotations: boolean
): Promise<ParsedAnnotationEntry> {
	const data = await loadAnnotation(annotation, root, refreshRemoteAnnotations);
	const maps = parseAnnotation(data);
	const mapIds = maps.map((map) => getGeoreferencedMapId(map, annotation));

	return {
		id: getAnnotationId(annotation),
		annotation,
		mapIds,
		maps
	};
}

function getUniqueMaps(entries: ParsedAnnotationEntry[]) {
	const mapsById = new Map<string, GeoreferencedMap>();

	for (const entry of entries) {
		for (const [index, map] of entry.maps.entries()) {
			const id = entry.mapIds[index];
			if (!mapsById.has(id)) {
				mapsById.set(id, map);
			}
		}
	}

	return [...mapsById.values()];
}

function getGeoreferencedMapId(map: GeoreferencedMap, annotation: string) {
	const id = String(map.id ?? '').trim();
	if (!id) {
		throw new Error(`Annotation "${annotation}" contains a georeferenced map without an id`);
	}

	return id;
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

function validateUniqueAnnotationIds(entries: ParsedAnnotationEntry[]) {
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

function sortCollection(collection: MapRecord[]) {
	return collection
		.map((map, order) => ({ map, order }))
		.sort(
			(left, right) =>
				getMapStartYear(left.map) - getMapStartYear(right.map) || left.order - right.order
		)
		.map(({ map }) => map);
}

function getMapStartYear(map: MapRecord) {
	return parseMapYear(map.year).start;
}

function parseMapYear(year: MapRecord['year']) {
	if (typeof year === 'number') {
		return { start: year, end: year };
	}

	const value = String(year ?? '').trim();
	const rangeMatch = value.match(/^(\d{1,4})\s*\/\s*(\d{1,4})$/);

	if (rangeMatch) {
		const start = Number(rangeMatch[1]);
		const end = Number(rangeMatch[2]);

		return start <= end ? { start, end } : { start: end, end: start };
	}

	const numericYear = Number(value);
	if (Number.isInteger(numericYear)) {
		return { start: numericYear, end: numericYear };
	}

	return { start: 0, end: 0 };
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
