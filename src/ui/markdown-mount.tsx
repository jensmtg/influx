import * as React from 'react';
import { Component, MarkdownRenderer } from 'obsidian';
import { logger } from '../platform/diagnostics/logger';
import { normalizeEditorListItems } from './editor-dom-normalization';

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

const SANITIZED_FENCE_PATTERN = /^```(query|dataview|dataviewjs)\b/i;

function isSanitizedFenceStart(content: string): boolean {
	return SANITIZED_FENCE_PATTERN.test(content.trim());
}

export function prepareMarkdownForInflux(markdown: string): string {
	if (!markdown || !/```(query|dataview|dataviewjs)\b/i.test(markdown)) {
		return markdown;
	}

	const lines = markdown.split(/\r?\n/);
	const output: string[] = [];
	let inSanitizedFence = false;
	let fencePrefix = '';

	for (const line of lines) {
		const { prefix, content } = splitFencePrefix(line);
		const normalizedContent = content.trim();

		if (!inSanitizedFence && isSanitizedFenceStart(normalizedContent)) {
			inSanitizedFence = true;
			fencePrefix = prefix;
			const sanitizedFenceLabel = normalizedContent.slice(3).split(/\s+/, 1)[0].toLowerCase();
			output.push(`${fencePrefix}\`\`\`text`);
			output.push(`${fencePrefix}[Influx] ${sanitizedFenceLabel} block disabled in backlink snippet`);
			continue;
		}

		if (inSanitizedFence && /^```/.test(normalizedContent)) {
			output.push(`${fencePrefix}\`\`\``);
			inSanitizedFence = false;
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
