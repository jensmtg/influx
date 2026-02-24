import { Decoration, WidgetType, EditorView } from "@codemirror/view";
import InfluxFile from '../../../domain/backlinks/influx-file';
import InfluxReactComponent from '../../../ui/influx-react-component';
import * as React from "react";
import { createRoot } from "react-dom/client";
import { CONSTANTS } from '../../../config/constants';
import { rootManager } from '../../../platform/react/root-manager';
import type ObsidianInflux from '../../../app/influx-plugin';
import { computeSettingsHash } from '../../../domain/settings/settings-hash';

function defineInfluxElement(tagName: string): void {
    if (typeof customElements === 'undefined') {
        return;
    }

    if (customElements.get(tagName)) {
        return;
    }

    customElements.define(tagName, class extends HTMLElement {
        disconnectedCallback() {
            this.dispatchEvent(new CustomEvent("disconnected"));
        }
    });
}

defineInfluxElement(CONSTANTS.INFLUX_ELEMENT_TAG);
defineInfluxElement(CONSTANTS.INFLUX_ELEMENT_TAG_LEGACY);



interface InfluxWidgetSpec {
    influxFile: InfluxFile;
    show: boolean;
    plugin: ObsidianInflux;
    side?: number;
}


export class InfluxWidget extends WidgetType {
	private static readonly DEFAULT_ESTIMATED_HEIGHT_PX = 320;
	private static readonly MAX_HEIGHT_CACHE_SIZE = 500;
	private static measuredHeights = new Map<string, number>();

    protected influxFile
    protected show
    protected plugin: ObsidianInflux
    private disconnectedHandler: (() => void) | null = null
    private currentContainer: HTMLElement | null = null
    private currentDOMContainer: HTMLElement | null = null
	private resizeObserver: ResizeObserver | null = null

    constructor({ influxFile, show, plugin }: InfluxWidgetSpec) {
        super()
        this.influxFile = influxFile
        this.show = show
        this.plugin = plugin

    }

	get estimatedHeight(): number {
		if (!this.show) {
			return 0;
		}
		const key = this.getHeightCacheKey();
		if (key) {
			const cached = InfluxWidget.measuredHeights.get(key);
			if (typeof cached === 'number' && cached > 0) {
				return cached;
			}
		}
		return InfluxWidget.DEFAULT_ESTIMATED_HEIGHT_PX;
	}

    destroy(): void {
		this.persistMeasuredHeight(this.currentContainer);
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
        // Clean up event listener from the container we actually added it to
        if (this.currentDOMContainer && this.disconnectedHandler) {
            this.currentDOMContainer.removeEventListener("disconnected", this.disconnectedHandler);
        }
        if (this.disconnectedHandler) {
            this.disconnectedHandler();
            this.disconnectedHandler = null;
        }
        this.currentContainer = null;
        this.currentDOMContainer = null;
    }

    eq(influxWidget: WidgetType) {
        // Proper comparison to avoid unnecessary re-renders
        // Only recreate if show status or file path changes
        if (!(influxWidget instanceof InfluxWidget)) {
            return false;
        }
        return this.show === influxWidget.show &&
               this.influxFile?.file?.path === influxWidget.influxFile?.file?.path;
    }

    ignoreEvent(event: Event): boolean {
        // Let CodeMirror handle all events within the widget
        // This allows proper event handling for React components inside the widget
        return true;
    }

    toDOM(view: EditorView) {
        const container = document.createElement(CONSTANTS.INFLUX_ELEMENT_TAG)
        // Use unique ID based on file path to avoid conflicts
        container.id = `influx-react-anchor-${this.influxFile.file?.path || 'unknown'}`;

        const root = createRoot(container);
        rootManager.register(container, root, 'editor', this.influxFile.file?.path, {
			widget: this,
			view
		});

        if (this.show) {
            root.render(<InfluxReactComponent
                key={this.influxFile.file?.path || 'influx'}
                influxFile={this.influxFile}
                preview={false}
                plugin={this.plugin}
            />);
			this.observeHeight(container);
        }
        else {
            root.render(null)
			if (this.resizeObserver) {
				this.resizeObserver.disconnect();
				this.resizeObserver = null;
			}
        }

        // Cleanup when element is disconnected from DOM
        // Store handler for proper cleanup in destroy()
        const disconnectedHandler = () => {
			this.persistMeasuredHeight(container);
            rootManager.unmount(container);
        };

        container.addEventListener("disconnected", disconnectedHandler)

        // Clean up old listener from previous container if it exists
        // Prevents memory leak when toDOM() is called multiple times
        if (this.currentDOMContainer && this.disconnectedHandler) {
            this.currentDOMContainer.removeEventListener("disconnected", this.disconnectedHandler);
        }

        this.disconnectedHandler = disconnectedHandler;
        this.currentDOMContainer = container;
        this.currentContainer = container;

        return container
    }

	private observeHeight(container: HTMLElement): void {
		if (typeof ResizeObserver === 'undefined') {
			this.persistMeasuredHeight(container);
			return;
		}

		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		}

		this.resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) {
				return;
			}
			this.persistMeasuredHeight(container, entry.contentRect.height);
		});
		this.resizeObserver.observe(container);
	}

	private persistMeasuredHeight(container: HTMLElement | null, explicitHeight?: number): void {
		const key = this.getHeightCacheKey();
		if (!key || !container) {
			return;
		}
		const measured = Math.ceil(explicitHeight ?? container.offsetHeight);
		if (!Number.isFinite(measured) || measured <= 0) {
			return;
		}

		InfluxWidget.measuredHeights.set(key, measured);
		if (InfluxWidget.measuredHeights.size > InfluxWidget.MAX_HEIGHT_CACHE_SIZE) {
			const oldestKey = InfluxWidget.measuredHeights.keys().next().value as string | undefined;
			if (oldestKey) {
				InfluxWidget.measuredHeights.delete(oldestKey);
			}
		}
	}

	private getHeightCacheKey(): string | null {
		const filePath = this.influxFile.file?.path;
		if (!filePath) {
			return null;
		}
		const settingsHash = computeSettingsHash(this.plugin.data.settings);
		const componentCount = this.influxFile.components?.length ?? 0;
		const collapsedFlag = this.influxFile.collapsed ? 1 : 0;
		return `${filePath}|${settingsHash}|${componentCount}|${collapsedFlag}`;
	}
}


export const influxDecoration = (influxWidgetSpec: InfluxWidgetSpec) =>  {
    // Use provided side, or default to -1 (before position) for top placement
    const side = influxWidgetSpec.side ?? -1;
    return Decoration.widget({
        widget: new InfluxWidget(influxWidgetSpec),
        side: side,
        block: true,
    })
}
