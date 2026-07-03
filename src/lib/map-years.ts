import type { MapMetadata } from '$lib/types';

export type MapYearRange = {
	start: number;
	end: number;
	label: string;
};

export function getMapYearRange(map: Pick<MapMetadata, 'year'>): MapYearRange {
	return parseMapYear(map.year);
}

export function getMapStartYear(map: Pick<MapMetadata, 'year'>) {
	return getMapYearRange(map).start;
}

export function getMapYearLabel(map: Pick<MapMetadata, 'year'>) {
	return getMapYearRange(map).label;
}

export function mapIncludesYear(map: Pick<MapMetadata, 'year'>, year: number) {
	const range = getMapYearRange(map);
	return year >= range.start && year <= range.end;
}

export function getExpandedMapYears(maps: Array<Pick<MapMetadata, 'year'>>) {
	return [
		...new Set(
			maps.flatMap((map) => {
				const range = getMapYearRange(map);
				return Array.from(
					{ length: range.end - range.start + 1 },
					(_, index) => range.start + index
				);
			})
		)
	].sort((a, b) => a - b);
}

function parseMapYear(year: MapMetadata['year']): MapYearRange {
	if (typeof year === 'number') {
		return {
			start: year,
			end: year,
			label: String(year)
		};
	}

	const normalized = String(year).trim();
	const rangeMatch = normalized.match(/^(\d{1,4})\s*\/\s*(\d{1,4})$/);
	if (rangeMatch) {
		const start = Number(rangeMatch[1]);
		const end = Number(rangeMatch[2]);
		const [rangeStart, rangeEnd] = start <= end ? [start, end] : [end, start];

		return {
			start: rangeStart,
			end: rangeEnd,
			label: `${rangeStart} - ${rangeEnd}`
		};
	}

	const numericYear = Number(normalized);
	if (Number.isInteger(numericYear)) {
		return {
			start: numericYear,
			end: numericYear,
			label: String(numericYear)
		};
	}

	return {
		start: 0,
		end: 0,
		label: normalized
	};
}
