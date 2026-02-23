const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

type ElementFactory = (tagName: string) => HTMLElement;

function isElementNode(node: unknown): node is HTMLElement {
	if (!node || typeof node !== 'object') {
		return false;
	}
	const candidate = node as { nodeType?: number };
	return candidate.nodeType === ELEMENT_NODE;
}

function applyInlineHeadingLayout(heading: HTMLElement): void {
	heading.classList.add('influx-inline-heading');
	heading.style.setProperty('display', 'inline', 'important');
	heading.style.setProperty('margin', '0', 'important');
	heading.style.setProperty('font-size', 'inherit', 'important');
	heading.style.setProperty('line-height', 'inherit', 'important');
}

export function headingLevelFromTagName(tagName: string): number | null {
	if (!/^h[1-6]$/i.test(tagName)) {
		return null;
	}
	const level = Number(tagName.slice(1));
	return Number.isFinite(level) ? level : null;
}

function convertHeadingToInlineSpan(heading: HTMLElement, createElement: ElementFactory): HTMLElement {
	const span = createElement('span');

	for (let i = 0; i < heading.classList.length; i += 1) {
		const cls = heading.classList.item(i);
		if (cls) {
			span.classList.add(cls);
		}
	}

	const dir = heading.getAttribute('dir');
	if (dir) {
		span.setAttribute('dir', dir);
	}

	const dataHeading = heading.getAttribute('data-heading');
	if (dataHeading) {
		span.setAttribute('data-heading', dataHeading);
	}

	const level = headingLevelFromTagName(heading.tagName);
	if (level !== null) {
		span.setAttribute('role', 'heading');
		span.setAttribute('aria-level', String(level));
	}

	while (heading.firstChild) {
		span.appendChild(heading.firstChild);
	}

	heading.replaceWith(span);
	return span;
}

function removeDirectWhitespaceTextNodes(element: HTMLElement): void {
	const toRemove: Node[] = [];
	for (let i = 0; i < element.childNodes.length; i += 1) {
		const node = element.childNodes.item(i);
		if (node.nodeType !== TEXT_NODE) {
			continue;
		}
		if (!node.textContent || node.textContent.trim().length > 0) {
			continue;
		}
		toRemove.push(node);
	}

	for (const node of toRemove) {
		element.removeChild(node);
	}
}

function applyLeadingHeadingListItemLayout(item: HTMLElement): void {
	item.style.setProperty('display', 'list-item', 'important');
	item.style.setProperty('white-space', 'normal', 'important');
	item.style.setProperty('list-style-position', 'outside', 'important');
}

export function normalizeEditorListItems(
	container: HTMLElement,
	createElement: ElementFactory = (tagName: string) => document.createElement(tagName)
): void {
	const listItems = Array.from(container.querySelectorAll('li'));
	for (const item of listItems) {
		item.classList.remove('influx-li-leading-heading', 'influx-li-heading-only');

		const firstElement = item.firstElementChild;
		if (!isElementNode(firstElement)) {
			continue;
		}

		if (firstElement.matches('p')) {
			const paragraphChildren = Array.from(firstElement.children).filter(isElementNode);
			if (paragraphChildren.length === 1) {
				const firstParagraphChild = paragraphChildren[0];
				if (firstParagraphChild.matches(HEADING_SELECTOR)) {
					item.insertBefore(firstParagraphChild, firstElement);
					if (!firstElement.textContent?.trim()) {
						firstElement.remove();
					}
				}
			}
		}

		const firstChild = item.firstElementChild;
		if (!isElementNode(firstChild) || !firstChild.matches(HEADING_SELECTOR)) {
			continue;
		}

		const inlineHeading = convertHeadingToInlineSpan(firstChild, createElement);
		applyInlineHeadingLayout(inlineHeading);
		item.classList.add('influx-li-leading-heading');
		applyLeadingHeadingListItemLayout(item);
		removeDirectWhitespaceTextNodes(item);
		const remainingElements = Array.from(item.children).filter(isElementNode);
		if (remainingElements.length === 1) {
			item.classList.add('influx-li-heading-only');
		}
	}
}
