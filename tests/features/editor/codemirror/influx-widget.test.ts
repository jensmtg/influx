import { InfluxWidget } from '@/features/editor/codemirror/influx-widget';
import { rootManager } from '@/platform/react/root-manager';
import type { EditorView } from '@codemirror/view';
import type InfluxFile from '@/domain/backlinks/influx-file';
import type { InfluxUiPlugin } from '@/ui/influx-ui-plugin';

jest.mock('@/platform/react/root-manager', () => ({
	rootManager: {
		register: jest.fn(),
		unmount: jest.fn(),
	},
}));

jest.mock('@/ui/influx-react-component', () => ({
	__esModule: true,
	default: (): null => null,
}));

jest.mock('react-dom/client', () => ({
	createRoot: jest.fn(() => ({
		render: jest.fn(),
	})),
}));

jest.mock('@/domain/settings/settings-hash', () => ({
	computeSettingsHash: jest.fn(() => 'test-hash'),
}));

type MockContainer = {
	id: string;
	offsetHeight: number;
	isConnected: boolean;
	addEventListener: jest.Mock;
	removeEventListener: jest.Mock;
	listeners: Record<string, EventListener>;
};

function createContainer(offsetHeight = 320): MockContainer {
	const listeners: Record<string, EventListener> = {};
	return {
		id: '',
		offsetHeight,
		isConnected: true,
		listeners,
		addEventListener: jest.fn((name: string, handler: EventListener) => {
			listeners[name] = handler;
		}),
		removeEventListener: jest.fn((name: string) => {
			delete listeners[name];
		}),
	};
}

type WidgetInfluxFile = Pick<InfluxFile, 'file' | 'components' | 'collapsed'>;
type MockEditorView = Pick<EditorView, 'state'>;

function createPlugin(): InfluxUiPlugin {
	return {
		data: {
			settings: {
				frontmatterProperties: new Set(),
				exclusionPattern: new Set(),
				inclusionPattern: new Set(),
			},
		},
		cycleListLimit: jest.fn(async () => {}),
		toggleSortOrder: jest.fn(async () => {}),
		toggleFrontmatterLinks: jest.fn(async () => {}),
	};
}

function createInfluxFile(path = 'Widget.md'): WidgetInfluxFile {
	return {
		file: { path },
		components: [],
		collapsed: false,
	};
}

function createEditorView(): MockEditorView {
	return { state: {} as EditorView['state'] };
}

describe('InfluxWidget', () => {
	const originalDocument = (globalThis as { document?: Document }).document;
	const originalResizeObserver = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		(globalThis as { document?: Document }).document = {
			createElement: jest.fn(),
		} as unknown as Document;
		(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class {
			observe = jest.fn();
			disconnect = jest.fn();
		} as unknown as typeof ResizeObserver;
	});

	afterEach(() => {
		jest.useRealTimers();
		(globalThis as { document?: Document }).document = originalDocument;
		(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = originalResizeObserver;
	});

	test('registers the editor root and unmounts it when the widget stays disconnected', () => {
		const container = createContainer();
		container.isConnected = false;
		(document.createElement as jest.Mock).mockReturnValue(container);

		const widget = new InfluxWidget({
			influxFile: createInfluxFile('Detach.md'),
			show: true,
			plugin: createPlugin(),
		});

		widget.toDOM(createEditorView() as EditorView);
		container.listeners.disconnected?.(new Event('disconnected'));
		jest.runAllTimers();

		expect(rootManager.register).toHaveBeenCalledWith(
			container,
			expect.anything(),
			'editor',
			'Detach.md',
			expect.objectContaining({ widget })
		);
		expect(rootManager.unmount).toHaveBeenCalledWith(container);
	});

	test('does not unmount when the widget reconnects after a transient disconnect', () => {
		const container = createContainer();
		(document.createElement as jest.Mock).mockReturnValue(container);

		const widget = new InfluxWidget({
			influxFile: createInfluxFile('Reconnect.md'),
			show: true,
			plugin: createPlugin(),
		});

		widget.toDOM(createEditorView() as EditorView);
		container.listeners.disconnected?.(new Event('disconnected'));
		jest.runAllTimers();

		expect(rootManager.unmount).not.toHaveBeenCalled();
	});

	test('destroy disconnects observers and removes the active disconnect listener', () => {
		const widget = new InfluxWidget({
			influxFile: createInfluxFile('Destroy.md'),
			show: true,
			plugin: createPlugin(),
		});
		const removeEventListener = jest.fn();
		const disconnect = jest.fn();
		const disconnectedHandler = jest.fn();

		widget.currentContainer = { offsetHeight: 320 } as HTMLElement;
		widget.currentDOMContainer = { removeEventListener } as unknown as HTMLElement;
		widget.resizeObserver = { disconnect } as unknown as ResizeObserver;
		widget.disconnectedHandler = disconnectedHandler;

		widget.destroy();

		expect(disconnect).toHaveBeenCalledTimes(1);
		expect(removeEventListener).toHaveBeenCalledWith('disconnected', disconnectedHandler);
	});
});
