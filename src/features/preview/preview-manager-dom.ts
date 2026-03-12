import { MarkdownView, WorkspaceLeaf, TFile } from 'obsidian';
import { CONSTANTS } from '../../config/constants';
import { logger } from '../../platform/diagnostics/logger';
import { rootManager } from '../../platform/react/root-manager';

export type InfluxWorkspaceLeaf = WorkspaceLeaf & {
	containerEl: HTMLDivElement;
};

function getMarkdownView(leaf: WorkspaceLeaf | null | undefined): MarkdownView | null {
	return leaf?.view instanceof MarkdownView ? leaf.view : null;
}

export function getLeafMarkdownFile(leaf: WorkspaceLeaf | null | undefined): TFile | null {
	return getMarkdownView(leaf)?.file ?? null;
}

export function getLeafMarkdownFilePath(leaf: WorkspaceLeaf | null | undefined): string | undefined {
	return getLeafMarkdownFile(leaf)?.path;
}

export function getLeafMarkdownFileMtime(leaf: WorkspaceLeaf | null | undefined): number {
	return getLeafMarkdownFile(leaf)?.stat?.mtime ?? 0;
}

export function getLeafPreviewModeRoot(leaf: WorkspaceLeaf | null | undefined): HTMLElement | null {
	const containerEl = getMarkdownView(leaf)?.previewMode?.containerEl;
	return asHtmlElement(containerEl);
}

function asHtmlElement(value: unknown): HTMLElement | null {
	if (!value || typeof value !== 'object') {
		return null;
	}
	if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) {
		return value;
	}

	return 'remove' in value || 'replaceWith' in value || 'id' in value
		? (value as HTMLElement)
		: null;
}

function getInfluxContainer(wrapper: Element): HTMLElement | null {
	if (typeof wrapper.querySelector !== 'function') {
		return null;
	}

	return asHtmlElement(
		wrapper.querySelector(`${CONSTANTS.INFLUX_CONTAINER_TAG}, ${CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY}`)
	);
}

function getInfluxContainers(container: Element): HTMLElement[] {
	return Array.from(
		container.querySelectorAll(`${CONSTANTS.INFLUX_CONTAINER_TAG}, ${CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY}`)
	).filter((node): node is HTMLElement => asHtmlElement(node) !== null);
}

export function isLeafInPreviewMode(leaf: InfluxWorkspaceLeaf): boolean {
	const view = getMarkdownView(leaf);
	return view?.getMode() === 'preview';
}

export function resolvePreviewRoot(element: HTMLElement): HTMLElement | null {
	if (element.classList.contains('markdown-preview-view')) {
		return element;
	}

	if (typeof element.closest !== 'function') {
		return null;
	}

	return asHtmlElement(element.closest('.markdown-preview-view'));
}

export function cleanupPreviewContainers(container: Element, logCounts = false): void {
	const wrappers = container.querySelectorAll(`.${CONSTANTS.INFLUX_WRAPPER_CLASS}`);
	const innerContainers = container.querySelectorAll(
		`${CONSTANTS.INFLUX_CONTAINER_TAG}, ${CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY}`
	);

	if (logCounts) {
		logger.debug('[handlePreviewMode] Found existing wrappers:', { count: wrappers.length });
		logger.debug('[handlePreviewMode] Found orphaned containers:', { count: innerContainers.length });
	}

	innerContainers.forEach((node) => {
		const htmlNode = asHtmlElement(node);
		if (!htmlNode) {
			return;
		}
		rootManager.unmountDeferred(htmlNode);
		htmlNode.remove();
	});

	wrappers.forEach((wrapper) => wrapper.remove());
}

export function cleanupAllPreviewRootsAndContainers(): void {
	rootManager.unmountByType('preview');
	document
		.querySelectorAll(`.${CONSTANTS.INFLUX_WRAPPER_CLASS}`)
		.forEach((wrapper) => wrapper.remove());
}

export function cleanupDuplicatePreviewWrappers(previewDiv: Element, keepContainer: HTMLElement | null): void {
	const wrappers = previewDiv.querySelectorAll(`.${CONSTANTS.INFLUX_WRAPPER_CLASS}`);
	wrappers.forEach((wrapper) => {
		const container = getInfluxContainer(wrapper);

		if (keepContainer && container === keepContainer) {
			return;
		}

		if (container) {
			rootManager.unmountDeferred(container);
		}
		wrapper.remove();
	});
}

export function findExistingContainer(previewDiv: Element, preferredContainerId?: string): HTMLElement | null {
	const containers = getInfluxContainers(previewDiv);
	if (preferredContainerId) {
		const exactMatch = containers.find((container) => container.id === preferredContainerId);
		if (exactMatch) {
			return exactMatch;
		}
	}

	let fallback: HTMLElement | null = null;
	let preferred: HTMLElement | null = null;
	containers.forEach((node) => {
		if (!fallback) {
			fallback = node;
		}
		if (!preferred && rootManager.has(node)) {
			preferred = node;
		}
	});

	return preferred ?? fallback;
}
