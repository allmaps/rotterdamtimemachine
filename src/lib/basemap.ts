import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';

type ProtomapsFlavor = 'light' | 'dark' | 'white' | 'grayscale' | 'black';
type LayersOptions = {
	labelsOnly?: boolean;
	lang?: string;
};

const protomapsApiKey = 'ca7652ec836f269a';

const backgroundColors: Record<ProtomapsFlavor, string> = {
	light: '#cccccc',
	dark: '#34373d',
	white: '#ffffff',
	grayscale: '#a3a3a3',
	black: '#2b2b2b'
};

export function getProtomapsLayers(
	flavor: ProtomapsFlavor = 'light',
	flavorOverrides?: Flavor,
	options?: LayersOptions
) {
	const customFlavor = { ...namedFlavor(flavor), ...flavorOverrides };
	return layers('protomaps', customFlavor, options);
}

export function getProtomapsStyle(flavor: ProtomapsFlavor = 'light'): StyleSpecification {
	return {
		version: 8,
		glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
		sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
		sources: {
			protomaps: {
				attribution:
					'<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
				type: 'vector',
				url: `https://api.protomaps.com/tiles/v4.json?key=${protomapsApiKey}`,
				maxzoom: 15
			}
		},
		layers: [
			{
				id: 'foreground',
				type: 'background',
				paint: {
					'background-color': backgroundColors[flavor],
					'background-opacity': 0
				}
			}
		]
	};
}
