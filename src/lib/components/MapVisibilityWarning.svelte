<script lang="ts">
	import { fade } from 'svelte/transition';
	import { Focus, MousePointer2, X } from '@lucide/svelte';
	import type maplibregl from 'maplibre-gl';
	import type { AppConfig } from '$lib/types';

	type MapVisibility =
		| 'fully-visible'
		| 'partly-visible'
		| 'tiny-visible'
		| 'not-visible'
		| 'unknown';

	type Placement = {
		panelStyle: string;
		pointerStyle: string;
	};

	type Edge = 'left' | 'right' | 'top' | 'bottom';
	type Quadrant = {
		horizontal: 'left' | 'right';
		vertical: 'top' | 'bottom';
	};
	type SafeRect = { left: number; right: number; top: number; bottom: number };

	const DESKTOP_SLIDER_INSET = 96;
	const MARGIN = 16;
	const MAX_WIDTH = 220;
	const MIN_WIDTH = 220;
	const FALLBACK_HEIGHT = 132;
	const POINTER_SIZE = 30;
	const POINTER_GAP = 12;

	let {
		open = false,
		config,
		map,
		mapElement,
		selectedMapCenter,
		selectedMapVisibility = 'unknown',
		navPosition = 'left',
		onDismiss,
		onZoomToLayer
	}: {
		open?: boolean;
		config: AppConfig;
		map?: maplibregl.Map;
		mapElement?: HTMLDivElement;
		selectedMapCenter?: [number, number];
		selectedMapVisibility?: MapVisibility;
		navPosition?: 'left' | 'right';
		onDismiss: () => void;
		onZoomToLayer: () => void;
	} = $props();

	let panelElement = $state<HTMLDivElement>();
	let panelSize = $state({
		width: MAX_WIDTH,
		height: FALLBACK_HEIGHT
	});
	let placement = $state<Placement>({
		panelStyle: '',
		pointerStyle: ''
	});
	let placementFrame: number | undefined;
	let measuredWidth = MAX_WIDTH;
	let measuredHeight = FALLBACK_HEIGHT;

	$effect(() => {
		if (!open || !map) return;

		function handleMove() {
			schedulePlacementUpdate();
		}

		schedulePlacementUpdate();
		map.on('move', handleMove);
		window.addEventListener('resize', schedulePlacementUpdate);

		return () => {
			map.off('move', handleMove);
			window.removeEventListener('resize', schedulePlacementUpdate);
			cancelPlacementUpdate();
		};
	});

	$effect(() => {
		const placementKey = [
			selectedMapVisibility,
			selectedMapCenter?.[0],
			selectedMapCenter?.[1],
			navPosition
		].join(':');

		if (open && placementKey) schedulePlacementUpdate();
	});

	$effect(() => {
		const element = panelElement;
		if (!open || !element) return;

		function updateSize() {
			if (!element) return;

			const rect = element.getBoundingClientRect();
			const width = rect.width || MAX_WIDTH;
			const height = rect.height || FALLBACK_HEIGHT;

			if (Math.abs(width - measuredWidth) > 0.5 || Math.abs(height - measuredHeight) > 0.5) {
				measuredWidth = width;
				measuredHeight = height;
				panelSize = { width, height };
			}

			schedulePlacementUpdate();
		}

		updateSize();

		const resizeObserver = new ResizeObserver(updateSize);
		resizeObserver.observe(element);

		return () => resizeObserver.disconnect();
	});

	function schedulePlacementUpdate() {
		if (placementFrame !== undefined) return;

		placementFrame = requestAnimationFrame(() => {
			placementFrame = undefined;
			updatePlacement();
		});
	}

	function cancelPlacementUpdate() {
		if (placementFrame === undefined) return;

		cancelAnimationFrame(placementFrame);
		placementFrame = undefined;
	}

	function updatePlacement() {
		const nextPlacement = getPlacement();
		if (
			nextPlacement &&
			(nextPlacement.panelStyle !== placement.panelStyle ||
				nextPlacement.pointerStyle !== placement.pointerStyle)
		) {
			placement = nextPlacement;
		}
	}

	function getPlacement(): Placement | undefined {
		if (!map || !mapElement || !selectedMapCenter) return undefined;

		const target = map.project(selectedMapCenter);
		const viewportCenter = map.project(map.getCenter());
		const baseSafeRect = getBaseSafeRect();
		const useFloatingPlacement = selectedMapVisibility === 'tiny-visible';
		const edge = useFloatingPlacement
			? undefined
			: getEdge(target.x, target.y, viewportCenter, baseSafeRect);
		const quadrant = useFloatingPlacement
			? undefined
			: getQuadrant(target.x, target.y, viewportCenter, baseSafeRect);
		const panelSafeRect =
			useFloatingPlacement || !quadrant ? baseSafeRect : getPanelSafeRect(baseSafeRect, quadrant);
		const panelWidth = getPanelWidth(panelSafeRect);
		const panelHeight = Math.min(
			panelSize.height || FALLBACK_HEIGHT,
			panelSafeRect.bottom - panelSafeRect.top
		);
		const position =
			useFloatingPlacement || !edge
				? getFloatingPanelPosition(target.x, target.y, panelSafeRect, panelWidth, panelHeight)
				: getPanelPosition(edge, target.x, target.y, panelSafeRect, panelWidth, panelHeight);
		const pointerStyle = getPointerStyle(
			target.x,
			target.y,
			position.left,
			position.top,
			panelWidth,
			panelHeight,
			baseSafeRect
		);

		return {
			panelStyle: [
				`left: ${position.left}px`,
				`top: ${position.top}px`,
				`width: ${panelWidth}px`
			].join('; '),
			pointerStyle
		};
	}

	function getMapPaneElement() {
		return mapElement?.closest<HTMLElement>('.map-pane');
	}

	function getBottomPanelInset() {
		const pane = getMapPaneElement();
		const panel = pane?.querySelector<HTMLElement>('[data-map-layers-panel]');
		if (!panel || !mapElement) return 0;

		const mapRect = mapElement.getBoundingClientRect();
		const panelRect = panel.getBoundingClientRect();
		if (panelRect.width === 0 || panelRect.height === 0) return 0;

		return Math.max(0, Math.ceil(mapRect.bottom - panelRect.top));
	}

	function getToolbarInset() {
		const toolbar = mapElement?.parentElement?.querySelector<HTMLElement>(
			'[data-tour="map-toolbar"]'
		);
		if (!toolbar || !mapElement) return 0;

		const mapRect = mapElement.getBoundingClientRect();
		const toolbarRect = toolbar.getBoundingClientRect();
		if (toolbarRect.width === 0 || toolbarRect.height === 0) return 0;

		return Math.max(0, Math.ceil(toolbarRect.bottom - mapRect.top));
	}

	function getSliderInset() {
		const pane = getMapPaneElement();
		const surface = pane?.querySelector<HTMLElement>('[data-time-slider-surface]');

		if (surface) {
			const surfaceStyle = getComputedStyle(surface);
			if (surfaceStyle.display !== 'none') {
				return Math.ceil(surface.getBoundingClientRect().width || DESKTOP_SLIDER_INSET);
			}
		}

		return 0;
	}

	function getBaseSafeRect() {
		const width = mapElement?.clientWidth ?? 0;
		const height = mapElement?.clientHeight ?? 0;
		const sliderInset = getSliderInset();
		const bottomInset = getBottomPanelInset();
		const toolbarInset = getToolbarInset();
		const left = MARGIN + (navPosition === 'left' ? sliderInset : 0);
		const right = width - MARGIN - (navPosition === 'right' ? sliderInset : 0);
		const top = MARGIN + toolbarInset;
		const bottom = height - MARGIN - bottomInset;

		return {
			left,
			right: Math.max(left, right),
			top,
			bottom: Math.max(top, bottom)
		};
	}

	function getPanelSafeRect(safeRect: SafeRect, quadrant: Quadrant) {
		const pointerClearance = POINTER_SIZE + POINTER_GAP;
		const left = safeRect.left + (quadrant.horizontal === 'left' ? pointerClearance : 0);
		const right = safeRect.right - (quadrant.horizontal === 'right' ? pointerClearance : 0);
		const top = safeRect.top + (quadrant.vertical === 'top' ? pointerClearance : 0);
		const bottom = safeRect.bottom - (quadrant.vertical === 'bottom' ? pointerClearance : 0);

		return {
			left,
			right: Math.max(left, right),
			top,
			bottom: Math.max(top, bottom)
		};
	}

	function getPanelWidth(safeRect: SafeRect) {
		const availableWidth = Math.max(0, safeRect.right - safeRect.left);
		if (availableWidth <= MIN_WIDTH) return availableWidth;

		return Math.min(MAX_WIDTH, availableWidth);
	}

	function getQuadrant(
		targetX: number,
		targetY: number,
		viewportCenter: maplibregl.Point,
		safeRect: SafeRect
	): Quadrant {
		const originX = clamp(viewportCenter.x, safeRect.left, safeRect.right);
		const originY = clamp(viewportCenter.y, safeRect.top, safeRect.bottom);

		return {
			horizontal: targetX < originX ? 'left' : 'right',
			vertical: targetY < originY ? 'top' : 'bottom'
		};
	}

	function getEdge(
		targetX: number,
		targetY: number,
		viewportCenter: maplibregl.Point,
		safeRect: SafeRect
	): Edge {
		const originX = clamp(viewportCenter.x, safeRect.left, safeRect.right);
		const originY = clamp(viewportCenter.y, safeRect.top, safeRect.bottom);
		const dx = targetX - originX;
		const dy = targetY - originY;
		const candidates: Array<{ edge: Edge; t: number }> = [];

		function addCandidate(edge: Edge, t: number) {
			if (!Number.isFinite(t) || t <= 0) return;

			const x = originX + dx * t;
			const y = originY + dy * t;
			if (
				x >= safeRect.left - 0.5 &&
				x <= safeRect.right + 0.5 &&
				y >= safeRect.top - 0.5 &&
				y <= safeRect.bottom + 0.5
			) {
				candidates.push({ edge, t });
			}
		}

		if (Math.abs(dx) > 0.001) {
			addCandidate(
				dx < 0 ? 'left' : 'right',
				((dx < 0 ? safeRect.left : safeRect.right) - originX) / dx
			);
		}

		if (Math.abs(dy) > 0.001) {
			addCandidate(
				dy < 0 ? 'top' : 'bottom',
				((dy < 0 ? safeRect.top : safeRect.bottom) - originY) / dy
			);
		}

		if (candidates.length > 0) {
			return candidates.sort((a, b) => a.t - b.t)[0].edge;
		}

		return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top';
	}

	function getPanelPosition(
		edge: Edge,
		targetX: number,
		targetY: number,
		safeRect: SafeRect,
		panelWidth: number,
		panelHeight: number
	) {
		const maxLeft = Math.max(safeRect.left, safeRect.right - panelWidth);
		const maxTop = Math.max(safeRect.top, safeRect.bottom - panelHeight);

		if (edge === 'left') {
			return {
				left: safeRect.left,
				top: clamp(targetY - panelHeight / 2, safeRect.top, maxTop)
			};
		}

		if (edge === 'right') {
			return {
				left: maxLeft,
				top: clamp(targetY - panelHeight / 2, safeRect.top, maxTop)
			};
		}

		if (edge === 'top') {
			return {
				left: clamp(targetX - panelWidth / 2, safeRect.left, maxLeft),
				top: safeRect.top
			};
		}

		return {
			left: clamp(targetX - panelWidth / 2, safeRect.left, maxLeft),
			top: maxTop
		};
	}

	function getFloatingPanelPosition(
		targetX: number,
		targetY: number,
		safeRect: SafeRect,
		panelWidth: number,
		panelHeight: number
	) {
		const clearance = POINTER_SIZE + POINTER_GAP;
		const maxLeft = Math.max(safeRect.left, safeRect.right - panelWidth);
		const maxTop = Math.max(safeRect.top, safeRect.bottom - panelHeight);
		const candidates = [
			{
				left: targetX + clearance,
				top: clamp(targetY - panelHeight / 2, safeRect.top, maxTop),
				score: safeRect.right - (targetX + clearance + panelWidth)
			},
			{
				left: targetX - clearance - panelWidth,
				top: clamp(targetY - panelHeight / 2, safeRect.top, maxTop),
				score: targetX - clearance - panelWidth - safeRect.left
			},
			{
				left: clamp(targetX - panelWidth / 2, safeRect.left, maxLeft),
				top: targetY + clearance,
				score: safeRect.bottom - (targetY + clearance + panelHeight)
			},
			{
				left: clamp(targetX - panelWidth / 2, safeRect.left, maxLeft),
				top: targetY - clearance - panelHeight,
				score: targetY - clearance - panelHeight - safeRect.top
			}
		];
		const fittingCandidates = candidates.filter(
			(candidate) =>
				candidate.left >= safeRect.left &&
				candidate.left + panelWidth <= safeRect.right &&
				candidate.top >= safeRect.top &&
				candidate.top + panelHeight <= safeRect.bottom
		);

		if (fittingCandidates.length > 0) {
			return fittingCandidates.sort((a, b) => b.score - a.score)[0];
		}

		const fallback = candidates
			.map((candidate) => ({
				left: clamp(candidate.left, safeRect.left, maxLeft),
				top: clamp(candidate.top, safeRect.top, maxTop),
				score: Math.hypot(candidate.left - targetX, candidate.top - targetY)
			}))
			.sort((a, b) => b.score - a.score)[0];

		return fallback ?? { left: safeRect.left, top: safeRect.top };
	}

	function getPointerStyle(
		targetX: number,
		targetY: number,
		panelLeft: number,
		panelTop: number,
		panelWidth: number,
		panelHeight: number,
		safeRect: SafeRect
	) {
		const pointerHalfSize = POINTER_SIZE / 2;
		const panelCenterX = panelLeft + panelWidth / 2;
		const panelCenterY = panelTop + panelHeight / 2;
		const pointerCenter = getRectangleRayIntersection(
			panelCenterX,
			panelCenterY,
			targetX,
			targetY,
			{
				left: panelLeft - POINTER_GAP - pointerHalfSize,
				right: panelLeft + panelWidth + POINTER_GAP + pointerHalfSize,
				top: panelTop - POINTER_GAP - pointerHalfSize,
				bottom: panelTop + panelHeight + POINTER_GAP + pointerHalfSize
			}
		);
		const clampedPointerCenter = {
			x: clampToRange(
				pointerCenter.x,
				safeRect.left + pointerHalfSize,
				safeRect.right - pointerHalfSize
			),
			y: clampToRange(
				pointerCenter.y,
				safeRect.top + pointerHalfSize,
				safeRect.bottom - pointerHalfSize
			)
		};
		const pointerAngle =
			(Math.atan2(targetY - panelCenterY, targetX - panelCenterX) * 180) / Math.PI;
		const rotation = pointerAngle + 135;

		return [
			`left: ${clampedPointerCenter.x - pointerHalfSize - panelLeft}px`,
			`top: ${clampedPointerCenter.y - pointerHalfSize - panelTop}px`,
			`width: ${POINTER_SIZE}px`,
			`height: ${POINTER_SIZE}px`,
			`transform: rotate(${rotation}deg)`,
			'transform-origin: center'
		].join('; ');
	}

	function getRectangleRayIntersection(
		originX: number,
		originY: number,
		targetX: number,
		targetY: number,
		rect: { left: number; right: number; top: number; bottom: number }
	) {
		const dx = targetX - originX;
		const dy = targetY - originY;
		const candidates: Array<{ x: number; y: number; t: number }> = [];

		function addCandidate(t: number) {
			if (!Number.isFinite(t) || t <= 0) return;

			const x = originX + dx * t;
			const y = originY + dy * t;
			if (
				x >= rect.left - 0.5 &&
				x <= rect.right + 0.5 &&
				y >= rect.top - 0.5 &&
				y <= rect.bottom + 0.5
			) {
				candidates.push({ x, y, t });
			}
		}

		if (Math.abs(dx) > 0.001) {
			addCandidate((rect.left - originX) / dx);
			addCandidate((rect.right - originX) / dx);
		}

		if (Math.abs(dy) > 0.001) {
			addCandidate((rect.top - originY) / dy);
			addCandidate((rect.bottom - originY) / dy);
		}

		if (candidates.length === 0) {
			return { x: rect.right, y: originY };
		}

		return candidates.sort((a, b) => a.t - b.t)[0];
	}

	function clamp(value: number, min: number, max: number) {
		return Math.min(max, Math.max(min, value));
	}

	function clampToRange(value: number, min: number, max: number) {
		if (max < min) return (min + max) / 2;

		return clamp(value, min, max);
	}

	function getWarningTitle() {
		if (selectedMapVisibility === 'not-visible') return config.mapWarnings.outsideTitle;
		if (selectedMapVisibility === 'tiny-visible') return config.mapWarnings.tinyTitle;

		return config.mapWarnings.partialTitle;
	}

	function getWarningDescription() {
		if (selectedMapVisibility === 'not-visible') return config.mapWarnings.outsideDescription;
		if (selectedMapVisibility === 'tiny-visible') return config.mapWarnings.tinyDescription;

		return config.mapWarnings.partialDescription;
	}
</script>

{#if open}
	<div class="pointer-events-none absolute inset-0 z-[25]" transition:fade={{ duration: 160 }}>
		<div
			bind:this={panelElement}
			role="alert"
			aria-label={config.mapWarnings.label}
			class="visibility-warning-panel pointer-events-auto absolute rounded-lg border border-gray-200 bg-white p-3 text-gray-900 shadow-xl"
			style={placement.panelStyle}
		>
			<span
				class="visibility-warning-pointer pointer-events-none absolute z-10 drop-shadow-md"
				style={placement.pointerStyle}
				aria-hidden="true"
			>
				<MousePointer2 class="h-full w-full fill-brand-main text-white" />
			</span>
			<div class="flex items-start gap-2">
				<h2 class="min-w-0 flex-1 pr-1 font-heading text-sm leading-5 font-bold">
					{getWarningTitle()}
				</h2>
				<button
					type="button"
					class="-mt-1 -mr-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-main"
					aria-label={config.mapWarnings.dismiss}
					title={config.mapWarnings.dismiss}
					onclick={onDismiss}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
			<p class="mt-1 text-xs leading-5 text-gray-600">
				{getWarningDescription()}
			</p>

			<div class="mt-3 flex justify-start gap-2">
				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-md bg-brand-main px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-main"
					onclick={onZoomToLayer}
				>
					<Focus class="h-4 w-4" />
					{config.mapWarnings.zoomToLayer}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.visibility-warning-panel {
		transition:
			left 160ms ease-out,
			top 160ms ease-out,
			width 160ms ease-out;
		will-change: left, top, width;
	}

	.visibility-warning-pointer {
		transition:
			left 160ms ease-out,
			top 160ms ease-out,
			transform 160ms ease-out;
		will-change: left, top, transform;
	}

	@media (prefers-reduced-motion: reduce) {
		.visibility-warning-panel,
		.visibility-warning-pointer {
			transition: none;
		}
	}
</style>
