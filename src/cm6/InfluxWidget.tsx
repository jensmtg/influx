import { Decoration, WidgetType, EditorView } from "@codemirror/view";
import InfluxFile from '../InfluxFile';
import InfluxReactComponent from '../InfluxReactComponent';
import * as React from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { CONSTANTS } from '../constants';
import { rootManager } from '../react/RootManager';
import type ObsidianInflux from '../main';

try {
    customElements.define(CONSTANTS.INFLUX_ELEMENT_TAG_LEGACY, class extends HTMLElement {
        disconnectedCallback() {
            this.dispatchEvent(new CustomEvent("disconnected"))
        }
    })
}
catch (e) {
    // Element already defined, which is fine
}



interface InfluxWidgetSpec {
    influxFile: InfluxFile;
    show: boolean;
    plugin: ObsidianInflux;
    side?: number;
}


export class InfluxWidget extends WidgetType {
    protected influxFile
    protected show
    protected plugin: ObsidianInflux
    private disconnectedHandler: (() => void) | null = null
    private currentContainer: HTMLElement | null = null

    constructor({ influxFile, show, plugin }: InfluxWidgetSpec) {
        super()
        this.influxFile = influxFile
        this.show = show
        this.plugin = plugin

    }

    destroy(): void {
        if (this.currentContainer && this.disconnectedHandler) {
            this.currentContainer.removeEventListener("disconnected", this.disconnectedHandler);
        }
        if (this.disconnectedHandler) {
            this.disconnectedHandler();
            this.disconnectedHandler = null;
        }
        this.currentContainer = null;
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

        // Use unified root manager to get or create React root
        const existingInfo = rootManager.get(container);
        let root = existingInfo?.root;

        if (!root) {
            root = createRoot(container);
            rootManager.register(container, root, 'editor', this.influxFile.file?.path, {
				widget: this,
				view
			});
        }

        if (this.show) {
            root.render(<InfluxReactComponent
                key={this.influxFile.file?.path || 'influx'}
                influxFile={this.influxFile}
                preview={false}
                plugin={this.plugin}
            />);
        }
        else {
            root.render(null)
        }

        // Cleanup when element is disconnected from DOM
        // Store handler for proper cleanup in destroy()
        const disconnectedHandler = () => {
            rootManager.unmount(container);
        };

        container.addEventListener("disconnected", disconnectedHandler)

        // Update references after new container is set up
        // Clean up old listener from previous container if it exists
        if (this.currentContainer && this.disconnectedHandler) {
            this.currentContainer.removeEventListener("disconnected", this.disconnectedHandler);
        }

        this.disconnectedHandler = disconnectedHandler;
        this.currentContainer = container;

        return container
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
