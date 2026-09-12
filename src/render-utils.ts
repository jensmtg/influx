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

export const LINK_SOURCE_ATTRIBUTE = 'data-influx-source-path';

/** Save each link's source before the rendered DOM becomes an HTML snapshot. */
export function setRenderedLinkSources(
	element: HTMLElement,
	sourcePath: string,
	resolveLink: (linktext: string, sourcePath: string) => string | undefined,
): void {
	const sourceSelector = `[${LINK_SOURCE_ATTRIBUTE}]`;
	// Document order visits outer embeds before any nested embeds.
	for (const embed of Array.from(element.querySelectorAll('.internal-embed[src]'))) {
		const parentSource = embed.parentElement?.closest(sourceSelector)?.getAttribute(LINK_SOURCE_ATTRIBUTE) ?? sourcePath;
		const embeddedSource = resolveLink(embed.getAttribute('src') || '', parentSource) ?? parentSource;
		embed.setAttribute(LINK_SOURCE_ATTRIBUTE, embeddedSource);
	}
	for (const link of Array.from(element.querySelectorAll('a.internal-link'))) {
		const linkSource = link.closest(sourceSelector)?.getAttribute(LINK_SOURCE_ATTRIBUTE) ?? sourcePath;
		link.setAttribute(LINK_SOURCE_ATTRIBUTE, linkSource);
	}
}

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
