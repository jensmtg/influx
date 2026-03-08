import type { Plugin } from 'obsidian';
import { ObsidianInfluxSettingsTab } from '../features/settings/settings-tab';
import { asyncDecoBuilderExt } from '../features/editor/codemirror/async-view-plugin';
import { CONSTANTS } from '../config/constants';
import { logger } from '../platform/diagnostics/logger';
import { rootManager } from '../platform/react/root-manager';
import { updateCoordinator } from './events/update-coordinator';
import { cacheManager } from '../platform/cache/cache-manager';
import { clearMetrics, getMetrics, summarizeMetrics } from '../platform/diagnostics/metrics';
import { isDebugMode } from '../platform/diagnostics/debug-mode';
import { InfluxSidebarView } from '../features/sidebar/influx-sidebar-view';
import type { PreviewManager } from '../features/preview/preview-manager';
import type { InfluxDebugHelpers, InfluxWindow } from '../platform/obsidian/influx-window-types';

export type InfluxPluginWindow = InfluxWindow;

type InfluxPluginLike = Plugin & {
	manifest: { version: string };
	app: Plugin['app'];
	data: { settings: { showInfluxInSidebar: boolean } };
	openSidebar: () => void;
	registerEditorExtension: (extension: unknown) => void;
	addSettingTab: (tab: unknown) => void;
	registerMarkdownPostProcessor: (processor: (el: HTMLElement, ctx: unknown) => Promise<void> | void) => void;
		registerView: (type: string, creator: (leaf: unknown) => unknown) => void;
		addRibbonIcon: (icon: string, title: string, callback: () => void) => void;
		addCommand: (command: { id: string; name: string; callback: () => void }) => void;
};

function createInfluxDebugHelpers(): InfluxDebugHelpers {
	return {
		getReactRoots: () => ({
			size: rootManager.size,
			entries: rootManager.getDebugInfo().map(({ container, inDom, info }) => ({
				id: container.id,
				inDom,
				visible: container.offsetParent !== null,
				type: info.type,
				filePath: info.filePath,
			})),
		}),
		getCache: () => cacheManager.getDebugInfo(),
		getUpdates: () => updateCoordinator.getDebugInfo(),
		getMetrics: () => getMetrics(),
		summarizeMetrics: () => summarizeMetrics(),
		snapshot: () => ({
			ts: Date.now(),
			metrics: summarizeMetrics(),
			cache: cacheManager.getDebugInfo(),
			roots: rootManager.getDebugInfo().map(({ container, inDom, info }) => ({
				id: container.id,
				inDom,
				visible: container.offsetParent !== null,
				type: info.type,
				filePath: info.filePath,
			})),
			updates: updateCoordinator.getDebugInfo(),
		}),
		clearMetrics: () => clearMetrics(),
	};
}

export function migrateOldElements(): void {
	const oldWidgets = document.querySelectorAll(CONSTANTS.INFLUX_ELEMENT_TAG_LEGACY);
	const oldContainers = document.querySelectorAll(CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY);

	if (oldWidgets.length > 0 || oldContainers.length > 0) {
		logger.info('Migrating old Influx elements', {
			widgets: oldWidgets.length,
			containers: oldContainers.length,
		});

		oldWidgets.forEach((el) => el.remove());
		oldContainers.forEach((el) => el.remove());
	}
}

export function attachWindowPluginReference(plugin: InfluxPluginLike): InfluxPluginWindow {
	const influxWindow = window as InfluxPluginWindow;
	if (influxWindow.influxPlugin && influxWindow.influxPlugin !== plugin) {
		logger.warn('Replacing stale window.influxPlugin reference');
	}
	return Object.assign(influxWindow, { influxPlugin: plugin });
}

export function registerPluginUi(plugin: InfluxPluginLike, previewManager: PreviewManager): void {
	plugin.registerEditorExtension(asyncDecoBuilderExt);
	plugin.addSettingTab(new ObsidianInfluxSettingsTab(plugin.app, plugin as never));
	plugin.registerMarkdownPostProcessor(previewManager.handlePreviewMode.bind(previewManager));
	plugin.registerView(CONSTANTS.VIEW_TYPE_SIDEBAR, (leaf) => new InfluxSidebarView(leaf as never, plugin as never));
	plugin.addRibbonIcon('links-coming-in', 'Open Influx sidebar', () => {
		plugin.openSidebar();
	});
	plugin.addCommand({
		id: 'open-influx-sidebar',
		name: 'Open Influx sidebar',
		callback: () => plugin.openSidebar(),
	});

	if (plugin.data.settings.showInfluxInSidebar) {
		plugin.openSidebar();
	}
}

export function attachWindowDebugHelpers(plugin: InfluxPluginLike, previewManager: PreviewManager): void {
	const influxWindow = window as InfluxPluginWindow;
	if (!isDebugMode()) {
		if (influxWindow.influxDebug) {
			delete influxWindow.influxDebug;
		}
		if (influxWindow.testInfluxReadingView) {
			delete influxWindow.testInfluxReadingView;
		}
		return;
	}

	influxWindow.influxDebug = createInfluxDebugHelpers();

	logger.debug('Debug mode enabled. Use window.influxDebug to inspect.');
	influxWindow.testInfluxReadingView = () => {
		void previewManager.updateAllPreviews();
	};
}
