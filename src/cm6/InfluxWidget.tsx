import { WidgetType } from "@codemirror/view";
import InfluxFile from '../InfluxFile';
import InfluxReactComponent from '../InfluxReactComponent';
import * as React from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
    createInfluxBlockDecoration,
    INFLUX_WIDGET_SIDE,
} from "./decoration-placement";

// Global WeakMap to track React roots for proper cleanup and reuse
const reactRoots = new WeakMap<HTMLElement, Root>();

// Use a unique custom element name to avoid conflicts with other plugins
const INFLUX_ELEMENT_TAG = "obsidian-influx-element";

interface InfluxWidgetSpec {
    influxFile: InfluxFile;
    show: boolean;
    side?: number;
}


export class InfluxWidget extends WidgetType {
    protected influxFile: InfluxFile
    protected show: boolean

    constructor({ influxFile, show }: InfluxWidgetSpec) {
        super()
        this.influxFile = influxFile
        this.show = show

    }

    eq(influxWidget: WidgetType) {
        if (!(influxWidget instanceof InfluxWidget)) {
            return false;
        }
        return this.show === influxWidget.show &&
               this.influxFile === influxWidget.influxFile;
    }

    toDOM() {
        const container = document.createElement(INFLUX_ELEMENT_TAG)
        container.style.display = 'block'
        container.style.width = '100%'
        container.id = `influx-react-anchor-${this.influxFile.uuid}`;
        container.dataset.influxPath = this.influxFile.file?.path ?? '';

        // CodeMirror owns the DOM lifetime, including temporary detachments.
        let root = reactRoots.get(container);
        if (!root) {
            root = createRoot(container);
            reactRoots.set(container, root);
        }

        this.renderInto(root);
        return container
    }

    updateDOM(container: HTMLElement): boolean {
        const root = reactRoots.get(container);
        if (!root || container.dataset.influxPath !== this.influxFile.file?.path) return false;
        container.id = `influx-react-anchor-${this.influxFile.uuid}`;
        this.renderInto(root);
        return true;
    }

    private renderInto(root: Root): void {
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
    }

    destroy(container: HTMLElement): void {
        const root = reactRoots.get(container);
        if (root) {
            root.unmount();
            reactRoots.delete(container);
        }
        this.influxFile.influx.deregisterInfluxComponent(this.influxFile.uuid)
    }
}


export const influxDecoration = (influxWidgetSpec: InfluxWidgetSpec) =>  {
    // Positive affinity keeps end-of-note typing before the footer widget.
    const side = influxWidgetSpec.side ?? INFLUX_WIDGET_SIDE;
    return createInfluxBlockDecoration(new InfluxWidget(influxWidgetSpec), side)
}
