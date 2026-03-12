import type { InfluxRenderMode } from '../../ui/influx-react-component-helpers';
import type { InfluxUiPlugin, InfluxWorkspaceLinkBridge } from '../../ui/influx-ui-plugin';

const INFLUX_LINK_SELECTOR = 'a.internal-link, a.tag';
const INFLUX_SOURCE_PATH_ATTR = 'data-influx-source-path';

type ResolvedWorkspace = InfluxWorkspaceLinkBridge & {
	openLinkText: (linktext: string, sourcePath: string, newLeaf?: boolean) => unknown;
};

function getWorkspace(plugin: InfluxUiPlugin): ResolvedWorkspace | null {
	const workspace = plugin.app?.workspace;
	if (!workspace || typeof workspace.openLinkText !== 'function') {
		return null;
	}

	return workspace as ResolvedWorkspace;
}

function getAnchor(container: HTMLElement, target: EventTarget | null): HTMLAnchorElement | null {
	if (!(target instanceof Element)) {
		return null;
	}

	const anchor = target.closest(INFLUX_LINK_SELECTOR);
	if (!(anchor instanceof HTMLAnchorElement) || !container.contains(anchor)) {
		return null;
	}

	return anchor;
}

function getLinktext(anchor: HTMLAnchorElement): string | null {
	return anchor.getAttribute('data-href') ?? anchor.getAttribute('href');
}

function getSourcePath(anchor: HTMLAnchorElement, fallbackSourcePath: string): string {
	return anchor.closest<HTMLElement>(`[${INFLUX_SOURCE_PATH_ATTR}]`)?.getAttribute(INFLUX_SOURCE_PATH_ATTR) ?? fallbackSourcePath;
}

function shouldIgnoreClick(event: MouseEvent): boolean {
	return event.defaultPrevented || event.button !== 0 || event.shiftKey || event.altKey;
}

export function attachInfluxLinkInteractions(params: {
	container: HTMLElement;
	plugin: InfluxUiPlugin;
	renderMode: InfluxRenderMode;
	fallbackSourcePath: string;
}): () => void {
	const { container, plugin, renderMode, fallbackSourcePath } = params;
	if (renderMode === 'editor') {
		return () => undefined;
	}

	const workspace = getWorkspace(plugin);
	if (!workspace) {
		return () => undefined;
	}

	const hoverSource = renderMode === 'sidebar' ? 'influx-sidebar' : 'influx-preview';

	const onClick = (event: MouseEvent) => {
		if (shouldIgnoreClick(event)) {
			return;
		}

		const anchor = getAnchor(container, event.target);
		if (!anchor) {
			return;
		}

		const linktext = getLinktext(anchor);
		if (!linktext) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		workspace.openLinkText(linktext, getSourcePath(anchor, fallbackSourcePath), event.ctrlKey || event.metaKey);
	};

	const onMouseOver = (event: MouseEvent) => {
		if (typeof workspace.trigger !== 'function') {
			return;
		}

		const anchor = getAnchor(container, event.target);
		if (!anchor) {
			return;
		}

		if (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) {
			return;
		}

		const linktext = getLinktext(anchor);
		if (!linktext) {
			return;
		}

		const sourcePath = getSourcePath(anchor, fallbackSourcePath);
		workspace.trigger('hover-link', {
			event,
			source: hoverSource,
			hoverParent: plugin,
			targetEl: anchor,
			linktext,
			sourcePath,
			state: {
				mode: 'preview',
				sourcePath,
			},
		});
	};

	container.addEventListener('click', onClick);
	container.addEventListener('mouseover', onMouseOver);

	return () => {
		container.removeEventListener('click', onClick);
		container.removeEventListener('mouseover', onMouseOver);
	};
}
