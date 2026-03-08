import { WorkspaceLeaf, View, TFile } from 'obsidian';
import { CONSTANTS } from '../../config/constants';
import { logger } from '../../platform/diagnostics/logger';
import { rootManager } from '../../platform/react/root-manager';

export type InfluxView = View & {
	file?: TFile;
	currentMode?: { type: string };
	mode?: string;
};

export type InfluxWorkspaceLeaf = WorkspaceLeaf & {
	view?: InfluxView;
	containerEl: HTMLDivElement;
};

export function isLeafInPreviewMode(leaf: InfluxWorkspaceLeaf): boolean {
	const leafType: string | undefined = leaf.view?.currentMode?.type;
	const viewMode = leaf.view?.mode;
	return leafType === 'preview' || viewMode === 'preview';
}

export function leafHasPreviewRoot(leaf: InfluxWorkspaceLeaf): boolean {
	return isLeafInPreviewMode(leaf) || !!leaf.containerEl?.querySelector('.markdown-preview-view');
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
		const htmlNode = node as HTMLElement;
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
		const container = wrapper.querySelector(
			`${CONSTANTS.INFLUX_CONTAINER_TAG}, ${CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY}`
		) as HTMLElement | null;

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
	const containers = previewDiv.querySelectorAll(
		`${CONSTANTS.INFLUX_CONTAINER_TAG}, ${CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY}`
	);

	let fallback: HTMLElement | null = null;
	let preferred: HTMLElement | null = null;
	containers.forEach((node) => {
		const container = node as HTMLElement;
		if (!fallback) {
			fallback = container;
		}
		if (!preferred && rootManager.has(container)) {
			preferred = container;
		}
	});

	return preferred ?? fallback;
}
