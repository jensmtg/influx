import { EditorState, Extension, StateField, Range, RangeSet } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { createRoot } from "react-dom/client";
import * as React from "react";
import { editorViewField, TFile, App } from 'obsidian';
import InfluxFile from './InfluxFile';
import InfluxReactComponent from './InfluxReactComponent';
import { ApiAdapter } from './apiAdapter';


function ReactComp () {

    return (
        <div
        style={{backgroundColor: 'red'}}>
            <h1>Are we there yet? {Math.random()}</h1>
        </div>
    )
}

interface InfluxWidgetSpec {
  url: string;
  file: TFile;
  app: App;

}

class InfluxWidget extends WidgetType {
  readonly url
  protected app
  protected file

  constructor({ url, file, app }: InfluxWidgetSpec) {
    super()

    this.url = url
    this.app = app
    this.file = file
  }

  eq(influxWidget: InfluxWidget) {
    return influxWidget.file?.path === this.file?.path
  }

  toDOM() {

    console.log('toDom app and file', this.app, this.file)

    const apiAdapter = new ApiAdapter(this.app)
    const influxFile = new InfluxFile(this.file.path, apiAdapter)

    console.log('inf', influxFile)

    async function makeList() {
        await influxFile.makeInfluxList()
    }

    makeList()

    const container = document.createElement('div')
    container.style.maxWidth = `calc(var(--line-width-adaptive) - var(--folding-offset))`
    container.style.maxWidth = `calc(var(--line-width-adaptive) - var(--folding-offset))`
    container.style.width = `calc(var(--line-width-adaptive) - var(--folding-offset))`
    container.style.setProperty("margin-left", `max(calc(50% + var(--folding-offset) - var(--line-width-adaptive)/ 2),calc(50% + var(--folding-offset) - var(--max-width)/ 2))`, "important")

    const reactAnchor = container.appendChild(document.createElement('div'))

    const anchor = createRoot(reactAnchor)
    anchor.render(<ReactComp />);
    // anchor.render(<InfluxReactComponent influxFile={influxFile} api={apiAdapter} />);



    return container
  }
}

export const images = (): Extension => {

  const influxDecoration = (influxWidgetSpec: InfluxWidgetSpec) => Decoration.widget({
    widget: new InfluxWidget(influxWidgetSpec),
    side: 1,
    block: true,
  })

  const decorate = (state: EditorState) => {


    const { app, file } = state.field(editorViewField);

    const widgets: Range<Decoration>[] = []

    widgets.push(influxDecoration({ url: 'http://images.jpg', app, file }).range(state.doc.length))

    return RangeSet.of(widgets)
  }

  const influxField = StateField.define<DecorationSet>({
    create(state) {
      return decorate(state)
    },
    update(images, transaction) {
      if (transaction.docChanged) {
        return decorate(transaction.state)
      }

      return images.map(transaction.changes)
    },
    provide(field) {
      return EditorView.decorations.from(field)
    },
  })

  return [
    influxField,
  ]
}
