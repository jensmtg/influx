import * as React from 'react';
import { Component, MarkdownRenderer } from 'obsidian';
import { logger } from '../platform/diagnostics/logger';
import { normalizeEditorListItems } from './editor-dom-normalization';

interface MarkdownMountProps {
	app?: unknown;
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

const SANITIZED_FENCE_LANGUAGES = 'query|dataview|dataviewjs|tasks';
const SANITIZED_FENCE_MARKER_PATTERN = '(?:`{3,}|~{3,})';
const SANITIZED_FENCE_PATTERN = new RegExp(
	`^(${SANITIZED_FENCE_MARKER_PATTERN})(${SANITIZED_FENCE_LANGUAGES})\\b`,
	'i'
);
const SANITIZED_FENCE_DETECT_PATTERN = new RegExp(
	`${SANITIZED_FENCE_MARKER_PATTERN}(${SANITIZED_FENCE_LANGUAGES})\\b`,
	'i'
);
const INFLUX_MARKDOWN_MOUNT_ATTR = 'data-influx-markdown-mount-root';

export const INFLUX_MARKDOWN_MOUNT_SELECTOR = `[${INFLUX_MARKDOWN_MOUNT_ATTR}="true"]`;

function getSanitizedFenceStart(content: string): { fenceMarker: string; label: string } | null {
	const match = content.trim().match(SANITIZED_FENCE_PATTERN);
	if (!match) {
		return null;
	}

	return {
		fenceMarker: match[1],
		label: match[2].toLowerCase(),
	};
}

function isFenceClose(content: string, fenceMarker: string): boolean {
	const match = content.trim().match(/^(`{3,}|~{3,})\s*$/);
	return Boolean(match && match[1][0] === fenceMarker[0] && match[1].length >= fenceMarker.length);
}

export function prepareMarkdownForInflux(markdown: string): string {
	if (!markdown || !SANITIZED_FENCE_DETECT_PATTERN.test(markdown)) {
		return markdown;
	}

	const lines = markdown.split(/\r?\n/);
	const output: string[] = [];
	let inSanitizedFence = false;
	let fencePrefix = '';
	let sanitizedFenceMarker = '```';

	for (const line of lines) {
		const { prefix, content } = splitFencePrefix(line);
		const normalizedContent = content.trim();
		const sanitizedFenceStart = getSanitizedFenceStart(normalizedContent);

		if (!inSanitizedFence && sanitizedFenceStart) {
			inSanitizedFence = true;
			fencePrefix = prefix;
			sanitizedFenceMarker = sanitizedFenceStart.fenceMarker;
			output.push(`${fencePrefix}${sanitizedFenceMarker}text`);
			output.push(`${fencePrefix}[Influx] ${sanitizedFenceStart.label} block disabled in backlink snippet`);
			continue;
		}

		if (inSanitizedFence && isFenceClose(normalizedContent, sanitizedFenceMarker)) {
			output.push(`${fencePrefix}${sanitizedFenceMarker}`);
			inSanitizedFence = false;
			fencePrefix = '';
			sanitizedFenceMarker = '```';
			continue;
		}

		output.push(line);
	}

	if (inSanitizedFence) {
		output.push(`${fencePrefix}${sanitizedFenceMarker}`);
	}

	return output.join('\n');
}

function disableRenderedCheckboxes(container: HTMLElement): void {
	const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
	for (const checkbox of checkboxes) {
		checkbox.disabled = true;
	}
}

const MarkdownMount = React.memo(function MarkdownMount({
	app,
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

		const renderTarget = document.createElement('div');
		renderTarget.setAttribute(INFLUX_MARKDOWN_MOUNT_ATTR, 'true');
		container.replaceChildren(renderTarget);
		const renderComponent = new Component();
		let cancelled = false;

		const render = async () => {
			try {
				if (!app) {
					logger.error('Missing app for markdown render at mount target', { sourcePath });
					return;
				}
				const preparedMarkdown = prepareMarkdownForInflux(markdown);
				await MarkdownRenderer.render(app as never, preparedMarkdown, renderTarget, sourcePath || '/', renderComponent);
				if (cancelled) {
					return;
				}
				if (mode === 'editor') {
					normalizeEditorListItems(renderTarget);
				}
				if (disableCheckboxes) {
					disableRenderedCheckboxes(renderTarget);
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
			renderTarget.replaceChildren();
			if (renderTarget.parentElement === container) {
				container.replaceChildren();
			}
		};
	}, [app, markdown, sourcePath, disableCheckboxes, mode]);

	return <div ref={containerRef} className={className} />;
});

export default MarkdownMount;
