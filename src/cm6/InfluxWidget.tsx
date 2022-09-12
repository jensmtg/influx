import { Decoration, WidgetType } from "@codemirror/view";
import InfluxFile from '../InfluxFile';
import InfluxReactComponent from '../InfluxReactComponent';
import * as React from "react";
import { createRoot } from "react-dom/client";


interface InfluxWidgetSpec {
    influxFile: InfluxFile;
}


export class InfluxWidget extends WidgetType {
    protected influxFile

    constructor({ influxFile }: InfluxWidgetSpec) {
        super()
        this.influxFile = influxFile
    }

    eq(influxWidget: InfluxWidget) {
        return influxWidget.influxFile?.file?.path === this.influxFile?.file?.path
    }

    toDOM() {

        // console.log('toDom app and file', this.app, this.file)

        const container = document.createElement('div')
        container.id = 'delimiting container'
        container.style.maxWidth = `calc(var(--line-width-adaptive) - var(--folding-offset))`
        container.style.maxWidth = `calc(var(--line-width-adaptive) - var(--folding-offset))`
        container.style.width = `calc(var(--line-width-adaptive) - var(--folding-offset))`
        container.style.setProperty("margin-left", `max(calc(50% + var(--folding-offset) - var(--line-width-adaptive)/ 2),calc(50% + var(--folding-offset) - var(--max-width)/ 2))`, "important")

        const reactAnchor = container.appendChild(document.createElement('div'))

        const anchor = createRoot(reactAnchor)
        // anchor.render(<ReactComp />);
        anchor.render(<InfluxReactComponent key={this.influxFile.file.path} influxFile={this.influxFile} />);



        return container
    }
}


export const influxDecoration = (influxWidgetSpec: InfluxWidgetSpec) => Decoration.widget({
    widget: new InfluxWidget(influxWidgetSpec),
    side: 1,
    block: true,
})