export function hasOpenModal() {
	return (
		document.body.classList.contains('driver-active') ||
		!!document.querySelector('[role="dialog"][aria-modal="true"]')
	);
}

export function isInteractiveTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;

	const tagName = target.tagName.toLowerCase();
	return (
		tagName === 'input' ||
		tagName === 'textarea' ||
		tagName === 'select' ||
		tagName === 'button' ||
		tagName === 'a' ||
		target.isContentEditable
	);
}

export function isArrowKey(key: string) {
	return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
}
