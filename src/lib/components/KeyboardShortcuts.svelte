<script lang="ts">
	import { hasOpenModal, isArrowKey, isInteractiveTarget } from '$lib/keyboard';
	import type {
		MapKeyboardCommand,
		MapLayersKeyboardCommand,
		MapLayersOpenCommand,
		MapToolbarCommand,
		SliderKeyboardCommand
	} from '$lib/types';

	let {
		searchOpen = $bindable(false),
		compareActive = $bindable(false),
		leftOpacity = $bindable(100),
		rightOpacity = $bindable(100),
		mapKeyboardCommand = $bindable(),
		mapToolbarCommand = $bindable(),
		sliderKeyboardCommand = $bindable(),
		mapLayersKeyboardCommand = $bindable(),
		mapLayersOpenCommand = $bindable(),
		autoplayActive = false,
		keyboardPanPixels,
		onAutoplayStart,
		onAutoplayStop,
		onAutoplayPauseToggle,
		onAutoplayPrevious,
		onAutoplayNext
	}: {
		searchOpen?: boolean;
		compareActive?: boolean;
		leftOpacity?: number;
		rightOpacity?: number;
		mapKeyboardCommand?: MapKeyboardCommand;
		mapToolbarCommand?: MapToolbarCommand;
		sliderKeyboardCommand?: SliderKeyboardCommand;
		mapLayersKeyboardCommand?: MapLayersKeyboardCommand;
		mapLayersOpenCommand?: MapLayersOpenCommand;
		autoplayActive?: boolean;
		keyboardPanPixels: number;
		onAutoplayStart: () => void;
		onAutoplayStop: () => void;
		onAutoplayPauseToggle: () => void;
		onAutoplayPrevious: () => void;
		onAutoplayNext: () => void;
	} = $props();

	let opacityShortcutSnapshot:
		| {
				left: number;
				right: number;
		  }
		| undefined;

	function dispatchMapKeyboardCommand(command: Omit<MapKeyboardCommand, 'id'>) {
		mapKeyboardCommand = {
			id: (mapKeyboardCommand?.id ?? 0) + 1,
			...command
		};
	}

	function dispatchMapToolbarCommand(action: MapToolbarCommand['action']) {
		mapToolbarCommand = {
			id: (mapToolbarCommand?.id ?? 0) + 1,
			action
		};
	}

	function dispatchSliderKeyboardCommand(direction: -1 | 1) {
		sliderKeyboardCommand = {
			id: (sliderKeyboardCommand?.id ?? 0) + 1,
			direction
		};
	}

	function dispatchMapLayersKeyboardCommand(direction: -1 | 1) {
		mapLayersKeyboardCommand = {
			id: (mapLayersKeyboardCommand?.id ?? 0) + 1,
			direction
		};
	}

	function dispatchMapLayersOpenCommand() {
		mapLayersOpenCommand = {
			id: (mapLayersOpenCommand?.id ?? 0) + 1
		};
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (hasOpenModal()) return;

		if (autoplayActive) {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopImmediatePropagation();
				onAutoplayStop();
				return;
			}

			if (event.code === 'Space') {
				if (event.repeat) return;

				event.preventDefault();
				event.stopImmediatePropagation();
				onAutoplayPauseToggle();
				return;
			}

			if (
				!event.shiftKey &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				(event.key === 'ArrowLeft' || event.key === 'ArrowRight')
			) {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (event.key === 'ArrowLeft') {
					onAutoplayPrevious();
				} else {
					onAutoplayNext();
				}
				return;
			}

			if (
				!event.shiftKey &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				(event.key === 'ArrowUp' || event.key === 'ArrowDown')
			) {
				event.preventDefault();
				event.stopImmediatePropagation();
				return;
			}
		}

		if (isInteractiveTarget(event.target)) return;

		if (handleSearchKeydown(event)) return;
		if (handleMapLayersOpenKeydown(event)) return;
		if (handleCompareKeydown(event)) return;
		if (handleAutoplayStartKeydown(event)) return;
		if (handleOpacityKeydown(event)) return;
		if (!autoplayActive && handleSliderKeydown(event)) return;
		if (!autoplayActive && handleMapLayersKeydown(event)) return;

		if ((!autoplayActive && handleMapToolbarKeydown(event)) || handleMapNavigationKeydown(event)) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}

	function handleGlobalKeydownCapture(event: KeyboardEvent) {
		if (hasOpenModal()) return;
		if (!autoplayActive && isInteractiveTarget(event.target)) return;
		if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
		if (!isArrowKey(event.key)) return;

		if (handleMapNavigationKeydown(event)) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		if (!isPlainKey(event) || event.repeat || event.key.toLowerCase() !== 's') return false;

		event.preventDefault();
		event.stopImmediatePropagation();
		if (searchOpen) return true;
		searchOpen = true;
		return true;
	}

	function handleMapLayersOpenKeydown(event: KeyboardEvent) {
		if (event.repeat || event.altKey || event.shiftKey) return false;
		if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return false;

		event.preventDefault();
		event.stopImmediatePropagation();
		dispatchMapLayersOpenCommand();
		return true;
	}

	function handleCompareKeydown(event: KeyboardEvent) {
		if (autoplayActive || !isPlainKey(event) || event.repeat || event.key.toLowerCase() !== 'c') {
			return false;
		}

		event.preventDefault();
		event.stopImmediatePropagation();
		compareActive = !compareActive;
		return true;
	}

	function handleAutoplayStartKeydown(event: KeyboardEvent) {
		if (!isPlainKey(event) || event.repeat || event.key.toLowerCase() !== 'p') return false;

		event.preventDefault();
		event.stopImmediatePropagation();
		onAutoplayStart();
		return true;
	}

	function handleOpacityKeydown(event: KeyboardEvent) {
		if (event.code !== 'Space' || event.repeat) return false;

		event.preventDefault();
		event.stopImmediatePropagation();
		opacityShortcutSnapshot = {
			left: leftOpacity,
			right: rightOpacity
		};
		leftOpacity = 0;
		rightOpacity = 0;
		return true;
	}

	function handleSliderKeydown(event: KeyboardEvent) {
		if (!isPlainKey(event)) return false;

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			event.stopImmediatePropagation();
			dispatchSliderKeyboardCommand(-1);
			return true;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			event.stopImmediatePropagation();
			dispatchSliderKeyboardCommand(1);
			return true;
		}

		return false;
	}

	function handleMapLayersKeydown(event: KeyboardEvent) {
		if (!isPlainKey(event)) return false;

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			event.stopImmediatePropagation();
			dispatchMapLayersKeyboardCommand(-1);
			return true;
		}

		if (event.key === 'ArrowRight') {
			event.preventDefault();
			event.stopImmediatePropagation();
			dispatchMapLayersKeyboardCommand(1);
			return true;
		}

		return false;
	}

	function handleMapToolbarKeydown(event: KeyboardEvent) {
		if (!isPlainKey(event) || event.repeat) return false;

		const key = event.key.toLowerCase();

		if (key === 'r') {
			dispatchMapToolbarCommand('toggle-rotation');
			return true;
		}

		if (key === 'z') {
			dispatchMapToolbarCommand('toggle-focus');
			return true;
		}

		return false;
	}

	function handleMapNavigationKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return false;

		if (
			event.key === '+' ||
			event.key === '=' ||
			event.code === 'Equal' ||
			event.code === 'NumpadAdd'
		) {
			dispatchMapKeyboardCommand({ zoomDelta: event.shiftKey ? 2 : 1 });
			return true;
		}

		if (event.key === '-' || event.code === 'Minus' || event.code === 'NumpadSubtract') {
			dispatchMapKeyboardCommand({ zoomDelta: event.shiftKey ? -2 : -1 });
			return true;
		}

		if (!event.shiftKey) return false;

		if (event.key === 'ArrowLeft') {
			dispatchMapKeyboardCommand({ offset: [keyboardPanPixels, 0] });
			return true;
		}

		if (event.key === 'ArrowRight') {
			dispatchMapKeyboardCommand({ offset: [-keyboardPanPixels, 0] });
			return true;
		}

		if (event.key === 'ArrowUp') {
			dispatchMapKeyboardCommand({ offset: [0, keyboardPanPixels] });
			return true;
		}

		if (event.key === 'ArrowDown') {
			dispatchMapKeyboardCommand({ offset: [0, -keyboardPanPixels] });
			return true;
		}

		return false;
	}

	function restoreOpacityShortcut() {
		if (!opacityShortcutSnapshot) return;

		leftOpacity = opacityShortcutSnapshot.left;
		rightOpacity = opacityShortcutSnapshot.right;
		opacityShortcutSnapshot = undefined;
	}

	function handleGlobalKeyup(event: KeyboardEvent) {
		if (event.code !== 'Space' || !opacityShortcutSnapshot) return;

		event.preventDefault();
		restoreOpacityShortcut();
	}

	function isPlainKey(event: KeyboardEvent) {
		return !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
	}
</script>

<svelte:window
	onkeydowncapture={handleGlobalKeydownCapture}
	onkeydown={handleGlobalKeydown}
	onkeyup={handleGlobalKeyup}
	onblur={restoreOpacityShortcut}
/>
