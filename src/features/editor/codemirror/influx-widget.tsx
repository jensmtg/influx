import { Decoration, WidgetType, EditorView } from "@codemirror/view";
import InfluxFile from '../../../domain/backlinks/influx-file';
import InfluxReactComponent from '../../../ui/influx-react-component';
import * as React from "react";
import { createRoot } from "react-dom/client";
import { CONSTANTS } from '../../../config/constants';
import { rootManager } from '../../../platform/react/root-manager';
import type ObsidianInflux from '../../../app/influx-plugin';
import { computeSettingsHash } from '../../../domain/settings/settings-hash';
import {
	ensureInfluxElementsDefined,
	InfluxWidgetDomLifecycle,
	InfluxWidgetHeightCache,
} from './influx-widget-lifecycle';

ensureInfluxElementsDefined();



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
	private lifecycle = new InfluxWidgetDomLifecycle()

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
		return InfluxWidgetHeightCache.getEstimatedHeight(this.getHeightCacheKey());
	}

    destroy(): void {
		this.lifecycle.cleanup((container) => this.persistMeasuredHeight(container));
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
			this.lifecycle.observeHeight(container, (height) => this.persistMeasuredHeight(container, height));
        }
        else {
            root.render(null)
			this.lifecycle.stopObserving();
        }

		// Cleanup when element is disconnected from DOM
		// Store handler for proper cleanup in destroy()
		const disconnectedHandler = () => {
			this.persistMeasuredHeight(container);
			rootManager.unmount(container);
		};

        this.lifecycle.attachContainer(container, disconnectedHandler);

        return container
    }

	private persistMeasuredHeight(container: HTMLElement | null, explicitHeight?: number): void {
		InfluxWidgetHeightCache.persist(this.getHeightCacheKey(), container, explicitHeight);
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

	set disconnectedHandler(value: (() => void) | null) {
		this.lifecycle.setDisconnectedHandlerForTests(value);
	}

	get disconnectedHandler(): (() => void) | null {
		return this.lifecycle.getDisconnectedHandlerForTests();
	}

	set currentContainer(value: HTMLElement | null) {
		this.lifecycle.setCurrentContainerForTests(value);
	}

	get currentContainer(): HTMLElement | null {
		return this.lifecycle.getCurrentContainerForTests();
	}

	set currentDOMContainer(value: HTMLElement | null) {
		this.lifecycle.setCurrentDOMContainerForTests(value);
	}

	get currentDOMContainer(): HTMLElement | null {
		return this.lifecycle.getCurrentDOMContainerForTests();
	}

	set resizeObserver(value: ResizeObserver | null) {
		this.lifecycle.setResizeObserverForTests(value);
	}

	get resizeObserver(): ResizeObserver | null {
		return this.lifecycle.getResizeObserverForTests();
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
