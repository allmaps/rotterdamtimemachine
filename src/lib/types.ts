export type MapMetadata = {
	label: string;
	title: string;
	year: number | string;
	institution: string;
	url: string;
	iiif?: {
		url: string;
		type: string;
	};
	annotation: string;
};

export type TourConfig =
	| {
			enabled: false;
			storageKey?: string;
	  }
	| {
			enabled?: true;
			closeLabel: string;
			nextLabel: string;
			previousLabel: string;
			doneLabel: string;
			progressText: string;
			storageKey?: string;
			steps: Array<{
				target: string;
				title: string;
				description: string;
				side?: 'top' | 'right' | 'bottom' | 'left';
				align?: 'start' | 'center' | 'end';
			}>;
	  };

export type AppConfig = {
	collection?: string;
	site: {
		name: string;
		url: string;
		description: string;
		locale: string;
		favicon?: string;
	};
	theme: {
		color: string;
		fonts?: {
			families?: Array<{
				name: string;
				faces: Array<{
					weight?: number | string;
					style?: string;
					display?: string;
					stretch?: string;
					files: Array<
						| string
						| {
								path: string;
								format?: string;
						  }
					>;
				}>;
			}>;
			roles?: {
				body?: string | string[];
				accent?: string | string[];
				heading?: string | string[];
				display?: string | string[];
			};
		};
	};
	map: {
		defaultYear?: number;
		autoZoomOutThreshold?: number;
		visibilityPaddingPixels?: number;
		tinyVisibilityAreaRatio?: number;
		initialView?: InitialMapView;
		keyboard: {
			panPixels: number;
		};
	};
	basemap: {
		protomapsApiKey: string;
	};
	slider: {
		scaleInterval: number;
		showOnlyAvailableYears?: boolean;
	};
	autoplay?: {
		intervalSeconds: number;
		flyToDurationMs?: number;
	};
	header: {
		search: string;
		compare: string;
		closeCompare: string;
		compareMode: string;
		play: string;
		pause: string;
		stop: string;
		followMap: string;
		filterViewport: string;
		enterFullscreen: string;
		exitFullscreen: string;
		about: string;
		share: string;
	};
	tour?: TourConfig;
	about: {
		title: string;
		closeLabel: string;
		paragraphs: string[];
		standards?: {
			title: string;
			paragraphs: string[];
			links?: Array<{
				label: string;
				url: string;
			}>;
		};
		institutionsTitle: string;
		source?: {
			title: string;
			description: string;
			links?: Array<{
				label: string;
				url: string;
			}>;
		};
		shortcutsTitle: string;
		shortcuts: Array<{
			keys: string[];
			wide?: boolean;
			description: string;
		}>;
	};
	share: {
		title: string;
		closeLabel: string;
		description: string;
		location: string;
		currentMap: string;
		presentationMode: string;
		copy: string;
		copied: string;
	};
	search: {
		buttonLabel: string;
		modalLabel: string;
		submitLabel: string;
		closeLabel: string;
		placeholder: string;
		useLocation: string;
		locating: string;
		loading: string;
		noResults: string;
		minimumCharacters: string;
		notReady: string;
		unavailable: string;
		locationUnsupported: string;
		locationDenied: string;
		locationTimeout: string;
		locationUnavailable: string;
		countryCodes: string;
		minLength: number;
		limit: number;
		debounceMs: number;
		minRequestIntervalMs: number;
		cacheLimit: number;
		attribution: {
			prefix: string;
			provider: string;
			providerUrl: string;
			copyright: string;
			copyrightUrl: string;
		};
	};
	layers: {
		title: string;
		openLabel: string;
		closeLabel: string;
		searchPlaceholder: string;
		current: string;
		favorite: string;
		inView: string;
		noResults: string;
		found: string;
		yearPrefix: string;
		resultSingular: string;
		resultPlural: string;
		leftPane: string;
		rightPane: string;
		previousMap: string;
		nextMap: string;
		mapPosition: string;
		selectMap: string;
		visibleOnMap: string;
		addFavorite: string;
		removeFavorite: string;
		viewItemAt: string;
		openInAllmapsViewer: string;
		copyXyzTileUrl: string;
		copiedXyzTileUrl: string;
		basemap: string;
		protomaps: string;
		openStreetMap: string;
	};
	controls: {
		groupLabel: string;
		zoomIn: string;
		zoomOut: string;
		showAllYears: string;
		filterInView: string;
		noMapsInView: string;
		disableOrientation: string;
		followOrientation: string;
		disableFocus: string;
		followFocus: string;
		opacity: string;
		adjustOpacity: string;
		layerOpacity: string;
	};
	mapWarnings: {
		label: string;
		outsideTitle: string;
		partialTitle: string;
		tinyTitle: string;
		outsideDescription: string;
		partialDescription: string;
		tinyDescription: string;
		dismiss: string;
		zoomToLayer: string;
	};
};

export type MapLocation = {
	center: [number, number];
	zoom: number;
	bearing: number;
};

export type InitialMapView = {
	center?: [number, number];
	zoom?: number;
	bearing?: number;
};

export type GeocoderBounds = {
	west: number;
	south: number;
	east: number;
	north: number;
};

export type MapKeyboardCommand = {
	id: number;
	offset?: [number, number];
	zoomDelta?: number;
};

export type MapToolbarCommand = {
	id: number;
	action: 'toggle-in-view' | 'toggle-rotation' | 'toggle-focus';
};
