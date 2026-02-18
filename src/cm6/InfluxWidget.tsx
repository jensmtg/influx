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
    protected plugin

    constructor({ influxFile, show, plugin }: InfluxWidgetSpec) {
        super()
        this.influxFile = influxFile
        this.show = show
        this.plugin = plugin

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
        const disconnectedHandler = () => {
            // Remove event listener to prevent memory leaks
            container.removeEventListener("disconnected", disconnectedHandler);

            // Unmount React root to prevent memory leaks
            rootManager.unmount(container);
        };

        container.addEventListener("disconnected", disconnectedHandler)

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
