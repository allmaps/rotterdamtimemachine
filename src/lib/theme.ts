import { resolvePublicAssetUrl } from '$lib/asset-urls';
import type { AppConfig } from '$lib/types';

const fallbackThemeColor = '#15803d';
const white = '#ffffff';
const black = '#000000';
const themeRoleMixes = {
	soft: { color: white, amount: 0.94 },
	muted: { color: white, amount: 0.8 },
	secondary: { color: white, amount: 0.14 },
	hover: { color: black, amount: 0.17 }
} as const;
const fontRoleVariables = {
	body: '--font-sans',
	accent: '--font-bolder',
	heading: '--font-heading',
	display: '--font-display'
} as const;
const defaultFontRoles: Record<FontRole, string> = {
	body: 'Noto Sans',
	accent: 'Noto Sans',
	heading: 'Noto Sans',
	display: 'Noto Sans'
};
const fallbackFontFamilies = ['Noto Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'];
const genericFontFamilies = new Set([
	'serif',
	'sans-serif',
	'monospace',
	'cursive',
	'fantasy',
	'system-ui',
	'ui-serif',
	'ui-sans-serif',
	'ui-monospace',
	'ui-rounded',
	'emoji',
	'math',
	'fangsong'
]);
const formatByExtension: Record<string, string> = {
	woff2: 'woff2',
	woff: 'woff',
	ttf: 'truetype',
	otf: 'opentype'
};

type ThemeRole = keyof typeof themeRoleMixes | 'main';
type FontRole = keyof typeof fontRoleVariables;
type ThemeFonts = NonNullable<AppConfig['theme']['fonts']>;
type ThemeFontFamily = NonNullable<ThemeFonts['families']>[number];
type ThemeFontFace = ThemeFontFamily['faces'][number];
type ThemeFontFile = ThemeFontFace['files'][number];

const bundledFontFamilies: ThemeFontFamily[] = [
	{
		name: 'Noto Sans',
		faces: [
			{
				weight: '100 900',
				style: 'normal',
				display: 'swap',
				stretch: '62.5% 100%',
				files: ['/fonts/NotoSans-VariableFont_wdth,wght.ttf']
			},
			{
				weight: '100 900',
				style: 'italic',
				display: 'swap',
				stretch: '62.5% 100%',
				files: ['/fonts/NotoSans-Italic-VariableFont_wdth,wght.ttf']
			}
		]
	}
];

export function getThemeStyle(theme: AppConfig['theme']) {
	const colorDeclarations = Object.entries(getThemeRoles(getThemeColor(theme))).map(
		([role, color]) => `--color-brand-${role}: ${color} !important;`
	);

	return [...colorDeclarations, ...getFontRoleDeclarations(theme.fonts)].join(' ');
}

export function getThemeColor(theme: AppConfig['theme']) {
	return normalizeThemeColor(theme.color) ?? fallbackThemeColor;
}

export function getThemeHeadStyle(theme: AppConfig['theme'], basePath = '') {
	return `${getThemeFontFaceStyle(theme.fonts, basePath)}\n:root { ${getThemeStyle(theme)} }`;
}

function getFontRoleDeclarations(fonts: ThemeFonts | undefined) {
	const roles = fonts?.roles ?? {};

	return (Object.entries(fontRoleVariables) as Array<[FontRole, string]>).map(
		([role, variable]) => {
			const families = normalizeFontFamilies(roles[role] ?? defaultFontRoles[role]);
			return `${variable}: ${getFontStack(families)} !important;`;
		}
	);
}

function getThemeFontFaceStyle(fonts: ThemeFonts | undefined, basePath: string) {
	return [...bundledFontFamilies, ...(fonts?.families ?? [])]
		.flatMap((family) =>
			(family.faces ?? [])
				.map((face) => getFontFaceRule(family.name, face, basePath))
				.filter(Boolean)
		)
		.join('\n\n');
}

function getFontFaceRule(familyName: string, face: ThemeFontFace, basePath: string) {
	const sources = (face.files ?? [])
		.map((file) => getFontFileSource(file, basePath))
		.filter(Boolean);
	if (!familyName || sources.length === 0) return '';

	const declarations = [
		`font-family: ${quoteCssString(familyName)};`,
		`src:\n\t\t${sources.join(',\n\t\t')};`,
		`font-display: ${safeFontDisplay(face.display)};`,
		`font-style: ${safeCssValue(face.style, 'normal')};`,
		`font-weight: ${safeCssValue(face.weight, '400')};`
	];

	if (face.stretch) {
		declarations.push(`font-stretch: ${safeCssValue(face.stretch, 'normal')};`);
	}

	return `@font-face {\n\t${declarations.join('\n\t')}\n}`;
}

function getFontFileSource(file: ThemeFontFile, basePath: string) {
	const path = typeof file === 'string' ? file : file.path;
	if (!path) return '';

	const format =
		typeof file === 'string' ? inferFontFormat(file) : (file.format ?? inferFontFormat(path));
	const formatPart = format ? ` format(${quoteCssString(format)})` : '';

	return `url(${quoteCssString(resolvePublicAssetUrl(path, basePath))})${formatPart}`;
}

function inferFontFormat(path: string) {
	const extension = path.split('?')[0].split('.').pop()?.toLowerCase();
	return extension ? formatByExtension[extension] : undefined;
}

function normalizeFontFamilies(value: string | string[] | undefined) {
	const families = Array.isArray(value) ? value : String(value ?? '').split(',');
	return families.map((family) => family.trim()).filter(Boolean);
}

function getFontStack(configuredFamilies: string[]) {
	const families = configuredFamilies.length > 0 ? configuredFamilies : [defaultFontRoles.body];
	const lowerCaseFamilies = new Set(families.map((family) => family.toLowerCase()));
	const fallbackFamilies = fallbackFontFamilies.filter(
		(family) => !lowerCaseFamilies.has(family.toLowerCase())
	);

	return [...families, ...fallbackFamilies].map(formatFontFamily).join(', ');
}

function formatFontFamily(family: string) {
	return genericFontFamilies.has(family.toLowerCase()) ? family : quoteCssString(family);
}

function quoteCssString(value: string) {
	return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ')}'`;
}

function safeCssValue(value: number | string | undefined, fallback: string) {
	const normalized = String(value ?? fallback).trim();
	return /^[a-zA-Z0-9\s.%+-]+$/.test(normalized) ? normalized : fallback;
}

function safeFontDisplay(value: string | undefined) {
	const normalized = String(value ?? 'swap')
		.trim()
		.toLowerCase();
	return ['auto', 'block', 'swap', 'fallback', 'optional'].includes(normalized)
		? normalized
		: 'swap';
}

function getThemeRoles(color: string): Record<ThemeRole, string> {
	return {
		soft: mixHexColors(color, themeRoleMixes.soft.color, themeRoleMixes.soft.amount),
		muted: mixHexColors(color, themeRoleMixes.muted.color, themeRoleMixes.muted.amount),
		secondary: mixHexColors(color, themeRoleMixes.secondary.color, themeRoleMixes.secondary.amount),
		main: color,
		hover: mixHexColors(color, themeRoleMixes.hover.color, themeRoleMixes.hover.amount)
	};
}

function normalizeThemeColor(color: string) {
	return normalizeHexColor(color) ?? normalizeRgbColor(color);
}

function normalizeHexColor(color: string) {
	const match = color.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (!match) return undefined;

	const value = match[1].toLowerCase();
	if (value.length === 3) {
		return `#${value
			.split('')
			.map((character) => character + character)
			.join('')}`;
	}

	return `#${value}`;
}

function normalizeRgbColor(color: string) {
	const match = color.match(/^rgb\(\s*(.+?)\s*\)$/i);
	if (!match) return undefined;

	const components = match[1].includes(',')
		? match[1].split(',').map((component) => component.trim())
		: match[1].trim().split(/\s+/);
	if (components.length !== 3) return undefined;

	const rgb = components.map(parseRgbComponent);
	if (!rgb.every((component) => component !== undefined)) return undefined;

	return rgbToHex(rgb as [number, number, number]);
}

function parseRgbComponent(component: string) {
	if (component.endsWith('%')) {
		const percentage = Number(component.slice(0, -1));
		return Number.isFinite(percentage)
			? clampRgbChannel(Math.round((percentage / 100) * 255))
			: undefined;
	}

	const value = Number(component);
	return Number.isFinite(value) ? clampRgbChannel(Math.round(value)) : undefined;
}

function mixHexColors(color: string, mixColor: string, amount: number) {
	const colorRgb = hexToRgb(color);
	const mixRgb = hexToRgb(mixColor);

	return rgbToHex(
		colorRgb.map((channel, index) =>
			Math.round(channel * (1 - amount) + mixRgb[index] * amount)
		) as [number, number, number]
	);
}

function hexToRgb(color: string): [number, number, number] {
	return [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16)) as [
		number,
		number,
		number
	];
}

function clampRgbChannel(value: number) {
	return Math.max(0, Math.min(255, value));
}

function rgbToHex(rgb: [number, number, number]) {
	return `#${rgb
		.map((channel) => clampRgbChannel(channel).toString(16).padStart(2, '0'))
		.join('')}`;
}
