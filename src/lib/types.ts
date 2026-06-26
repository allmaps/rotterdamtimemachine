export type MapMetadata = {
	label: string;
	title: string;
	year: number;
	institution: string;
	url: string;
	iiif?: {
		url: string;
		type: string;
	};
	annotation: string;
};

export type MapLocation = {
	center: [number, number];
	zoom: number;
};
