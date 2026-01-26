import { Decoration, WidgetType } from "@codemirror/view";
import InfluxFile from '../InfluxFile';
import InfluxReactComponent from '../InfluxReactComponent';
import * as React from "react";
import { createRoot } from "react-dom/client";

try {
    customElements.define("influx-element", class extends HTMLElement {
        disconnectedCallback() {
            this.dispatchEvent(new CustomEvent("disconnected"))
        }
    })
}
catch (e) {
    // console.warn('disconnect-element allready defined?')
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

    eq(influxWidget: InfluxWidget) {
        // Proper comparison to avoid unnecessary re-renders
        // Only recreate if show status or file path changes
        return this.show === influxWidget.show &&
               this.influxFile?.file?.path === influxWidget.influxFile?.file?.path;
    }

    toDOM() {
        const container = document.createElement("influx-element")
        // Use unique ID based on file path to avoid conflicts
        container.id = `influx-react-anchor-${this.influxFile.file?.path || 'unknown'}`
        container.addEventListener("disconnected", () => this.unmount(this.influxFile))
        const reactAnchor = container.appendChild(document.createElement('div'))

        // Reuse existing root if available, otherwise create new one
        let anchor = (reactAnchor as any)._reactRoot;
        if (!anchor) {
            anchor = createRoot(reactAnchor);
            (reactAnchor as any)._reactRoot = anchor;
        }

        if (this.show) {
            anchor.render(<InfluxReactComponent
                key={this.influxFile.file?.path || 'influx'}
                influxFile={this.influxFile}
                preview={false}
                sheet={this.influxFile.influx.stylesheet}
            />);
        }
        else {
            anchor.render(null)
        }

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
    