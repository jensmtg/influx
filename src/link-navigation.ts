import { Keymap, Notice, type App } from 'obsidian';
import type { MouseEvent } from 'react';
import { LINK_SOURCE_ATTRIBUTE } from './render-utils';

/** HTML snapshots lose MarkdownRenderer's event handlers and source context. */
export async function openInfluxLink(
    event: MouseEvent<HTMLElement>,
    app: App,
    sourcePath: string,
): Promise<void> {
    if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) {
        return;
    }

    // Avoid instanceof Element: a link can belong to an Obsidian popout window.
    const node = event.target as Node;
    const target = node.nodeType === 1 ? node as Element : node.parentElement;
    const link = target?.closest('a.internal-link');
    if (!link || !event.currentTarget.contains(link)) {
        return;
    }

    // Stop the host editor/preview from handling this same click without the
    // source context belonging to the card (or a note embedded in its preview).
    event.preventDefault();
    event.stopPropagation();
    const linktext = link.getAttribute('data-href') || link.getAttribute('href');
    if (!linktext) {
        return;
    }
    const linkSource = link.getAttribute(LINK_SOURCE_ATTRIBUTE) ?? sourcePath ?? '';

    try {
        await app.workspace.openLinkText(linktext, linkSource, Keymap.isModEvent(event.nativeEvent));
    } catch (error) {
        console.error('[Influx] Failed to open link:', error);
        new Notice('Influx could not open this note.');
    }
}
