import { InfluxWidget } from '@/features/editor/codemirror/influx-widget';
import { rootManager } from '@/platform/react/root-manager';

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
	addEventListener: jest.Mock;
	removeEventListener: jest.Mock;
	listeners: Record<string, EventListener>;
};

function createContainer(offsetHeight = 320): MockContainer {
	const listeners: Record<string, EventListener> = {};
	return {
		id: '',
		offsetHeight,
		listeners,
		addEventListener: jest.fn((name: string, handler: EventListener) => {
			listeners[name] = handler;
		}),
		removeEventListener: jest.fn((name: string) => {
			delete listeners[name];
		}),
	};
}

function createPlugin() {
	return {
		data: {
			settings: {
				frontmatterProperties: new Set(),
				exclusionPattern: new Set(),
				inclusionPattern: new Set(),
			},
		},
	} as any;
}

function createInfluxFile(path = 'Widget.md') {
	return {
		file: { path },
		components: [],
		collapsed: false,
	} as any;
}

describe('InfluxWidget', () => {
	const originalDocument = (globalThis as { document?: Document }).document;
	const originalResizeObserver = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;

	beforeEach(() => {
		jest.clearAllMocks();
		(globalThis as { document?: Document }).document = {
			createElement: jest.fn(),
		} as unknown as Document;
		(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class {
			observe = jest.fn();
			disconnect = jest.fn();
		} as unknown as typeof ResizeObserver;
	});

	afterEach(() => {
		(globalThis as { document?: Document }).document = originalDocument;
		(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = originalResizeObserver;
	});

	test('registers the editor root and unmounts it when the widget disconnects', () => {
		const container = createContainer();
		(document.createElement as jest.Mock).mockReturnValue(container);

		const widget = new InfluxWidget({
			influxFile: createInfluxFile('Detach.md'),
			show: true,
			plugin: createPlugin(),
		});

		widget.toDOM({ state: {} } as any);
		container.listeners.disconnected?.(new Event('disconnected'));

		expect(rootManager.register).toHaveBeenCalledWith(
			container,
			expect.anything(),
			'editor',
			'Detach.md',
			expect.objectContaining({ widget })
		);
		expect(rootManager.unmount).toHaveBeenCalledWith(container);
	});

	test('removes the old disconnect listener when the widget DOM is recreated', () => {
		const firstContainer = createContainer();
		const secondContainer = createContainer();
		(document.createElement as jest.Mock)
			.mockReturnValueOnce(firstContainer)
			.mockReturnValueOnce(secondContainer);

		const widget = new InfluxWidget({
			influxFile: createInfluxFile('Rerender.md'),
			show: true,
			plugin: createPlugin(),
		});

		widget.toDOM({ state: {} } as any);
		const firstHandler = firstContainer.listeners.disconnected;
		widget.toDOM({ state: {} } as any);

		expect(firstContainer.removeEventListener).toHaveBeenCalledWith('disconnected', firstHandler);
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

		(widget as any).currentContainer = { offsetHeight: 320 };
		(widget as any).currentDOMContainer = { removeEventListener };
		(widget as any).resizeObserver = { disconnect };
		(widget as any).disconnectedHandler = disconnectedHandler;

		widget.destroy();

		expect(disconnect).toHaveBeenCalledTimes(1);
		expect(removeEventListener).toHaveBeenCalledWith('disconnected', disconnectedHandler);
		expect(disconnectedHandler).toHaveBeenCalledTimes(1);
	});
});
