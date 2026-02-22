import * as React from 'react';
import { Component, MarkdownRenderer } from 'obsidian';
import { logger } from '../../utils/logger';

interface MarkdownMountProps {
	markdown: string;
	sourcePath: string;
	className?: string;
	disableCheckboxes?: boolean;
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
				await MarkdownRenderer.renderMarkdown(markdown, container, sourcePath || '/', renderComponent);
				if (cancelled) {
					return;
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
	}, [markdown, sourcePath, disableCheckboxes]);

	return <div ref={containerRef} className={className} />;
});

export default MarkdownMount;
