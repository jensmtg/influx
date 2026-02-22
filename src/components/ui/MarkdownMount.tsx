import * as React from 'react';
import { Component, MarkdownRenderer } from 'obsidian';
import { logger } from '../../utils/logger';

interface MarkdownMountProps {
	markdown: string;
	sourcePath: string;
	className?: string;
	disableCheckboxes?: boolean;
	mode?: 'editor' | 'preview' | 'sidebar';
}

function splitFencePrefix(line: string): { prefix: string; content: string } {
	const trimmedStart = line.trimStart();
	const leadingWhitespaceLength = line.length - trimmedStart.length;
	const quotePrefixMatch = trimmedStart.match(/^(>\s*)+/);
	const quotePrefix = quotePrefixMatch ? quotePrefixMatch[0] : '';
	const prefix = line.slice(0, leadingWhitespaceLength) + quotePrefix;
	const content = trimmedStart.slice(quotePrefix.length);
	return { prefix, content };
}

export function prepareMarkdownForInflux(markdown: string): string {
	if (!markdown || markdown.toLowerCase().indexOf('```query') === -1) {
		return markdown;
	}

	const lines = markdown.split(/\r?\n/);
	const output: string[] = [];
	let inQueryFence = false;
	let fencePrefix = '';

	for (const line of lines) {
		const { prefix, content } = splitFencePrefix(line);
		const normalizedContent = content.trim();

		if (!inQueryFence && /^```query\b/i.test(normalizedContent)) {
			inQueryFence = true;
			fencePrefix = prefix;
			output.push(`${fencePrefix}\`\`\`text`);
			output.push(`${fencePrefix}[Influx] query block disabled in backlink snippet`);
			continue;
		}

		if (inQueryFence && /^```/.test(normalizedContent)) {
			output.push(`${fencePrefix}\`\`\``);
			inQueryFence = false;
			fencePrefix = '';
			continue;
		}

		output.push(line);
	}

	return output.join('\n');
}

function disableRenderedCheckboxes(container: HTMLElement): void {
	const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
	for (const checkbox of checkboxes) {
		checkbox.disabled = true;
	}
}

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

function applyInlineHeadingLayout(heading: HTMLElement): void {
	heading.classList.add('influx-inline-heading');
	heading.style.setProperty('display', 'inline', 'important');
	heading.style.setProperty('margin', '0', 'important');
	heading.style.setProperty('font-size', 'inherit', 'important');
	heading.style.setProperty('line-height', 'inherit', 'important');
}

function headingLevelFromTagName(tagName: string): number | null {
	if (!/^h[1-6]$/i.test(tagName)) {
		return null;
	}
	const level = Number(tagName.slice(1));
	return Number.isFinite(level) ? level : null;
}

function convertHeadingToInlineSpan(heading: HTMLElement): HTMLElement {
	const span = document.createElement('span');

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
	const toRemove: Text[] = [];
	for (let i = 0; i < element.childNodes.length; i += 1) {
		const node = element.childNodes.item(i);
		if (node.nodeType !== Node.TEXT_NODE) {
			continue;
		}
		if (!node.textContent || node.textContent.trim().length > 0) {
			continue;
		}
		toRemove.push(node as Text);
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

function normalizeEditorListItems(container: HTMLElement): void {
	const listItems = Array.from(container.querySelectorAll('li'));
	for (const item of listItems) {
		item.classList.remove('influx-li-leading-heading', 'influx-li-heading-only');

		const firstElement = item.firstElementChild;
		if (!(firstElement instanceof HTMLElement)) {
			continue;
		}

		if (firstElement.matches('p')) {
			const paragraphChildren = Array.from(firstElement.children);
			if (paragraphChildren.length === 1) {
				const firstParagraphChild = paragraphChildren[0];
				if (firstParagraphChild instanceof HTMLElement && firstParagraphChild.matches(HEADING_SELECTOR)) {
					item.insertBefore(firstParagraphChild, firstElement);
					if (!firstElement.textContent?.trim()) {
						firstElement.remove();
					}
				}
			}
		}

		const firstChild = item.firstElementChild;
		if (!(firstChild instanceof HTMLElement) || !firstChild.matches(HEADING_SELECTOR)) {
			continue;
		}

		const inlineHeading = convertHeadingToInlineSpan(firstChild);
		applyInlineHeadingLayout(inlineHeading);
		item.classList.add('influx-li-leading-heading');
		applyLeadingHeadingListItemLayout(item);
		removeDirectWhitespaceTextNodes(item);
		const remainingElements = Array.from(item.children).filter((child) => child instanceof HTMLElement);
		if (remainingElements.length === 1) {
			item.classList.add('influx-li-heading-only');
		}
	}
}

const MarkdownMount = React.memo(function MarkdownMount({
	markdown,
	sourcePath,
	className,
	disableCheckboxes = true,
	mode = 'preview',
}: MarkdownMountProps): React.ReactElement {
	const containerRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		container.replaceChildren();
		const renderComponent = new Component();
		let cancelled = false;

		const render = async () => {
			try {
				const preparedMarkdown = prepareMarkdownForInflux(markdown);
				await MarkdownRenderer.renderMarkdown(preparedMarkdown, container, sourcePath || '/', renderComponent);
				if (cancelled) {
					return;
				}
				if (mode === 'editor') {
					normalizeEditorListItems(container);
				}
				if (disableCheckboxes) {
					disableRenderedCheckboxes(container);
				}
			} catch (error) {
				if (!cancelled) {
					logger.error('Failed to render markdown at mount target', { sourcePath, error });
				}
			}
		};

		void render();

		return () => {
			cancelled = true;
			renderComponent.unload();
			container.replaceChildren();
		};
	}, [markdown, sourcePath, disableCheckboxes, mode]);

	return <div ref={containerRef} className={className} />;
});

export default MarkdownMount;
