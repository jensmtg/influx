import { Decoration, WidgetType, EditorView } from "@codemirror/view";
import InfluxFile from '../InfluxFile';
import InfluxReactComponent from '../InfluxReactComponent';
import * as React from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

// Global WeakMap to track React roots for proper cleanup and reuse
const reactRoots = new WeakMap<HTMLElement, Root>();

// Use a unique custom element name to avoid conflicts with other plugins
const INFUX_ELEMENT_TAG = "obsidian-influx-element";

try {
    customElements.define(INFUX_ELEMENT_TAG, class extends HTMLElement {
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
    side?: number;
}


export class InfluxWidget extends WidgetType {
    protected influxFile
    protected show

    constructor({ influxFile, show }: InfluxWidgetSpec) {
        super()
        this.influxFile = influxFile
        this.show = show

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
        const container = document.createElement(INFUX_ELEMENT_TAG)
        // Use unique ID based on file path to avoid conflicts
        container.id = `influx-react-anchor-${this.influxFile.file?.path || 'unknown'}`;

        const reactAnchor = container.appendChild(document.createElement('div'))

        // Get or create React root using WeakMap for proper cleanup
        let root = reactRoots.get(reactAnchor);
        if (!root) {
            root = createRoot(reactAnchor);
            reactRoots.set(reactAnchor, root);
        }

        if (this.show) {
            root.render(<InfluxReactComponent
                key={this.influxFile.file?.path || 'influx'}
                influxFile={this.influxFile}
                preview={false}
                sheet={this.influxFile.influx.stylesheet}
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
            const rootToCleanup = reactRoots.get(reactAnchor);
            if (rootToCleanup) {
                rootToCleanup.unmount();
                reactRoots.delete(reactAnchor);
            }
            // Deregister the influx component
            this.unmount(this.influxFile);
        };

        container.addEventListener("disconnected", disconnectedHandler)

        return container
    }


    unmount(influxFile: InfluxFile) {
        this.influxFile.influx.deregisterInfluxComponent(influxFile.uuid)
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
