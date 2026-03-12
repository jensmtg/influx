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

function getLeafPreviewModeRoot(leaf: WorkspaceLeaf | null | undefined): HTMLElement | null {
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

function getPreviewRootCandidates(container: Element): HTMLElement[] {
	return Array.from(container.querySelectorAll('.markdown-preview-view')).filter(
		(node): node is HTMLElement => asHtmlElement(node) !== null
	);
}

function isPreviewRootVisible(root: HTMLElement): boolean {
	const rootWithVisibility = root as HTMLElement & { checkVisibility?: () => boolean };
	if (typeof rootWithVisibility.checkVisibility === 'function') {
		return rootWithVisibility.checkVisibility();
	}

	const ownerWindow = root.ownerDocument?.defaultView;
	if (ownerWindow?.getComputedStyle) {
		const computedStyle = ownerWindow.getComputedStyle(root);
		if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
			return false;
		}
	}

	if (typeof root.getClientRects === 'function') {
		return root.getClientRects().length > 0;
	}

	return true;
}

function hasTrackedInfluxRoot(previewRoot: HTMLElement): boolean {
	return getInfluxContainers(previewRoot).some((container) => rootManager.has(container));
}

function hasTrackedInfluxRootForFile(previewRoot: HTMLElement, filePath?: string): boolean {
	if (!filePath) {
		return false;
	}

	return getInfluxContainers(previewRoot).some((container) => {
		const info = rootManager.get(container);
		return info?.filePath === filePath;
	});
}

export function isLeafInPreviewMode(leaf: InfluxWorkspaceLeaf): boolean {
	const view = getMarkdownView(leaf);
	return view?.getMode() === 'preview';
}

function selectPreferredPreviewRoot(candidates: HTMLElement[], filePath?: string): HTMLElement | null {
	if (candidates.length === 0) {
		return null;
	}
	const preferredCandidates = candidates;
	const matchingTrackedRoot = preferredCandidates.find((candidate) =>
		hasTrackedInfluxRootForFile(candidate, filePath)
	);
	if (matchingTrackedRoot) {
		return matchingTrackedRoot;
	}

	const untrackedRoot = preferredCandidates.find((candidate) => !hasTrackedInfluxRoot(candidate));
	if (untrackedRoot) {
		return untrackedRoot;
	}

	return preferredCandidates[0] ?? null;
}

export function resolveLeafPreviewRoot(container: Element, filePath?: string): HTMLElement | null {
	const candidates = getPreviewRootCandidates(container);
	if (candidates.length === 0) {
		return null;
	}

	const visibleCandidates = candidates.filter(isPreviewRootVisible);
	return selectPreferredPreviewRoot(visibleCandidates.length > 0 ? visibleCandidates : candidates, filePath);
}

export function resolveLeafPreviewRootFromLeaf(leaf: InfluxWorkspaceLeaf, filePath?: string): HTMLElement | null {
	const previewModeRoot = getLeafPreviewModeRoot(leaf);
	if (previewModeRoot) {
		return previewModeRoot;
	}

	return resolveLeafPreviewRoot(leaf.containerEl, filePath);
}

export function resolveVisibleLeafPreviewRoot(container: Element, filePath?: string): HTMLElement | null {
	return selectPreferredPreviewRoot(
		getPreviewRootCandidates(container).filter(isPreviewRootVisible),
		filePath
	);
}

export function resolveVisibleLeafPreviewRootFromLeaf(leaf: InfluxWorkspaceLeaf, filePath?: string): HTMLElement | null {
	const previewModeRoot = getLeafPreviewModeRoot(leaf);
	if (previewModeRoot && isPreviewRootVisible(previewModeRoot)) {
		return previewModeRoot;
	}

	return resolveVisibleLeafPreviewRoot(leaf.containerEl, filePath);
}

export function leafHasPreviewRoot(leaf: InfluxWorkspaceLeaf): boolean {
	const filePath = getLeafMarkdownFilePath(leaf);
	if (!filePath) {
		return false;
	}

	return isLeafInPreviewMode(leaf) || !!resolveVisibleLeafPreviewRootFromLeaf(leaf, filePath);
}

export function resolvePreviewRoot(element: HTMLElement): HTMLElement | null {
	if (element.classList.contains('markdown-preview-view')) {
		return element;
	}
	const closest = element.closest('.markdown-preview-view');
	if (closest instanceof HTMLElement) {
		return closest;
	}
	const nested = element.querySelector('.markdown-preview-view');
	return nested instanceof HTMLElement ? nested : null;
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

export function findExistingContainer(previewDiv: Element): HTMLElement | null {
	const containers = getInfluxContainers(previewDiv);

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
