const TABLE_RENDER_CONTEXT_SELECTOR = [
	"td",
	"th",
	"table",
	".HyperMD-table-row",
	".cm-table-widget",
	".cm-table-editor",
	".table-cell-wrapper",
].join(", ");

const LIVE_EDITOR_CONTEXT_SELECTOR = [
	".markdown-source-view",
	".cm-editor",
	".cm-content",
	".cm-line",
].join(", ");

const PREVIEW_CONTAINER_SELECTOR = ".markdown-preview-view, .markdown-reading-view";

export function shouldRenderInfluxForMarkdownElement(element: HTMLElement): boolean {
	if (element.closest(LIVE_EDITOR_CONTEXT_SELECTOR)) {
		return false;
	}

	if (element.closest(TABLE_RENDER_CONTEXT_SELECTOR)) {
		return false;
	}

	if (element.parentElement?.closest(PREVIEW_CONTAINER_SELECTOR)) {
		return false;
	}

	return true;
}
