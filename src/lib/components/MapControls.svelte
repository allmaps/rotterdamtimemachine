<script lang="ts">
	import {
		Compass,
		Focus,
		Link,
		Unlink,
		MapPinned,
		Minus,
		Plus,
		SlidersHorizontal
	} from '@lucide/svelte';
	import type { AppConfig } from '$lib/types';
	import type maplibregl from 'maplibre-gl';

	type ControlPosition = 'top-left' | 'top-right';
	const CONTROL_WIDTH_REM = 2.25;

	let {
		config,
		map,
		opacity = $bindable(100),
		rotateToMapOrientation = $bindable(false),
		focusActiveMap = $bindable(false),
		viewsLinked = $bindable(false),
		inViewOnly = $bindable(false),
		position = 'top-right',
		canZoomToMap = false,
		canFilterInView = false,
		showZoomControls = true,
		showLinkControl = false,
		showInViewControl = false,
		onUserZoomAction
	}: {
		config: AppConfig;
		map: maplibregl.Map;
		opacity?: number;
		rotateToMapOrientation?: boolean;
		focusActiveMap?: boolean;
		viewsLinked?: boolean;
		inViewOnly?: boolean;
		position?: ControlPosition;
		canZoomToMap?: boolean;
		canFilterInView?: boolean;
		showZoomControls?: boolean;
		showLinkControl?: boolean;
		showInViewControl?: boolean;
		onUserZoomAction?: () => void;
	} = $props();

	const positionClass = $derived(position === 'top-left' ? 'top-2 left-2' : 'top-2 right-2');
	const opacityPanelClass = $derived(position === 'top-left' ? 'left-0' : 'right-0');
	const inViewTitle = $derived(
		inViewOnly
			? config.controls.showAllYears
			: canFilterInView
				? config.controls.filterInView
				: config.controls.noMapsInView
	);
	let opacityOpen = $state(false);

	let zoomControls = $derived([
		{
			label: config.controls.zoomIn,
			icon: Plus,
			action: () => {
				onUserZoomAction?.();
				map.zoomIn({ duration: 250 });
			}
		},
		{
			label: config.controls.zoomOut,
			icon: Minus,
			action: () => {
				onUserZoomAction?.();
				map.zoomOut({ duration: 250 });
			}
		}
	]);
	let controlCount = $derived(
		(showZoomControls ? zoomControls.length : 0) +
			2 +
			(showLinkControl ? 1 : 0) +
			(showInViewControl ? 1 : 0) +
			1
	);
	let toolbarWidth = $derived(`${controlCount * CONTROL_WIDTH_REM}rem`);
	const controlButtonClass =
		'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center hover:bg-gray-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-main disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-white';

	function handleOpacity(event: Event) {
		opacity = Number((event.target as HTMLInputElement).value);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			opacityOpen = false;
		}
	}

	function toggleMapOrientation() {
		rotateToMapOrientation = !rotateToMapOrientation;
	}

	function toggleMapFocus() {
		focusActiveMap = !focusActiveMap;
	}

	function toggleViewsLinked() {
		viewsLinked = !viewsLinked;
	}

	function toggleInViewOnly() {
		if (!inViewOnly && !canFilterInView) return;

		inViewOnly = !inViewOnly;
	}

	function getToggleButtonClass(active: boolean) {
		return [
			controlButtonClass,
			active
				? 'text-brand-main bg-gray-100 disabled:hover:bg-white'
				: 'hover:bg-gray-100 disabled:hover:bg-white'
		].join(' ');
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	data-tour="map-toolbar"
	class="absolute z-30 {positionClass}"
	role="group"
	aria-label={config.controls.groupLabel}
	onpointerdown={(event) => event.stopPropagation()}
	ondblclick={(event) => event.stopPropagation()}
>
	<div
		style:width={toolbarWidth}
		class="inline-grid auto-cols-[2.25rem] grid-flow-col divide-x divide-gray-200 overflow-hidden rounded-md border border-gray-200 bg-white text-gray-800 shadow-lg transition-[width] duration-200 ease-out"
	>
		{#if showZoomControls}
			{#each zoomControls as control (control.label)}
				{@const Icon = control.icon}
				<button
					type="button"
					aria-label={control.label}
					title={control.label}
					onclick={control.action}
					class={controlButtonClass}
				>
					<Icon class="h-4 w-4" />
				</button>
			{/each}
		{/if}

		<button
			type="button"
			aria-label={rotateToMapOrientation
				? config.controls.disableOrientation
				: config.controls.followOrientation}
			title={rotateToMapOrientation
				? config.controls.disableOrientation
				: config.controls.followOrientation}
			aria-pressed={rotateToMapOrientation}
			disabled={!canZoomToMap}
			onclick={toggleMapOrientation}
			class={getToggleButtonClass(rotateToMapOrientation)}
		>
			<Compass class="h-4 w-4" />
		</button>

		<button
			type="button"
			aria-label={focusActiveMap ? config.controls.disableFocus : config.controls.followFocus}
			title={focusActiveMap ? config.controls.disableFocus : config.controls.followFocus}
			aria-pressed={focusActiveMap}
			disabled={!canZoomToMap}
			onclick={toggleMapFocus}
			class={getToggleButtonClass(focusActiveMap)}
		>
			<Focus class="h-4 w-4" />
		</button>

		{#if showLinkControl}
			<button
				type="button"
				aria-label={viewsLinked ? config.controls.unlinkViews : config.controls.linkViews}
				title={viewsLinked ? config.controls.unlinkViews : config.controls.linkViews}
				aria-pressed={viewsLinked}
				onclick={toggleViewsLinked}
				class={getToggleButtonClass(viewsLinked)}
			>
				{#if viewsLinked}
					<Link class="h-4 w-4" />
				{:else}
					<Unlink class="h-4 w-4" />
				{/if}
			</button>
		{/if}

		{#if showInViewControl}
			<button
				type="button"
				aria-label={inViewTitle}
				title={inViewTitle}
				aria-pressed={inViewOnly}
				disabled={!inViewOnly && !canFilterInView}
				onclick={toggleInViewOnly}
				class={getToggleButtonClass(inViewOnly)}
			>
				<MapPinned class="h-4 w-4" />
			</button>
		{/if}

		<button
			type="button"
			aria-label={config.controls.adjustOpacity}
			title={config.controls.adjustOpacity}
			aria-expanded={opacityOpen}
			onclick={() => (opacityOpen = !opacityOpen)}
			class={getToggleButtonClass(opacityOpen)}
		>
			<SlidersHorizontal class="h-4 w-4" />
		</button>
	</div>

	{#if opacityOpen}
		<div
			class="absolute top-11 {opacityPanelClass} w-56 rounded-md border border-gray-200 bg-white p-3 text-gray-800 shadow-lg"
		>
			<div class="mb-2 flex items-center justify-between gap-3">
				<span class="text-xs font-semibold">{config.controls.opacity}</span>
				<span class="font-heading text-xs">{opacity}%</span>
			</div>
			<input
				value={opacity}
				oninput={handleOpacity}
				type="range"
				min="0"
				max="100"
				class="m-0 w-full accent-brand-main"
				aria-label={config.controls.layerOpacity}
			/>
		</div>
	{/if}
</div>
