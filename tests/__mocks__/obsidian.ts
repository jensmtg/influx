import { jest } from "@jest/globals";

// Mock TFile class
class MockTFile {
	path: string;
	basename: string;
	extension: string;
	name: string;
	vault: Record<string, unknown>;
	parent: Record<string, unknown>;
	stat: { mtime: number; ctime: number; size: number };

	constructor(path: string, basename: string) {
		this.path = path || "";
		this.basename = basename || "";
		this.extension = path ? path.split(".").pop() || "" : "";
		this.name = basename || "";
		this.vault = {};
		this.parent = {};
		this.stat = {
			mtime: Date.now(),
			ctime: Date.now(),
			size: 0,
		};
	}
}

class MockTAbstractFile {}

export class Component {
	private children: Component[] = [];
	private unloadCallbacks: Array<() => void> = [];

	addChild(child: Component): void {
		this.children.push(child);
	}

	removeChild(child: Component): void {
		this.children = this.children.filter((currentChild) => currentChild !== child);
	}

	unload(): void {
		for (const callback of this.unloadCallbacks) {
			callback();
		}
		this.unloadCallbacks = [];
		for (const child of this.children) {
			child.unload();
		}
		this.children = [];
	}

	register(callback: () => void): void {
		this.unloadCallbacks.push(callback);
	}
}

export class MarkdownRenderChild extends Component {
	containerEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		super();
		this.containerEl = containerEl;
	}
}

export class View extends Component {
	app: unknown;
	containerEl: HTMLElement;
	leaf: unknown;
	navigation = true;

	constructor(leaf: unknown) {
		super();
		this.leaf = leaf;
		this.app = {};
		this.containerEl = {} as HTMLElement;
	}

	getDisplayText(): string {
		return 'View';
	}

	getViewType(): string {
		return 'view';
	}

	getState(): Record<string, unknown> {
		return {};
	}

	getEphemeralState(): Record<string, unknown> {
		return {};
	}

	setEphemeralState(_state: unknown): void {}

	async setState(_state: unknown, _result: unknown): Promise<void> {}

	onResize(): void {}

	async onOpen(): Promise<void> {}

	async onClose(): Promise<void> {}

	getIcon(): string {
		return 'document';
	}

	onPaneMenu(): void {}
}

export class MarkdownView extends View {
	file: unknown;
	mode: 'source' | 'preview' = 'source';
	currentMode: { type?: string } = { type: 'source' };
	previewMode = {};
	editor = {};

	getViewType(): string {
		return 'markdown';
	}

	getMode(): 'source' | 'preview' {
		return this.mode;
	}

	getViewData(): string {
		return '';
	}

	setViewData(_data: string, _clear: boolean): void {}

	clear(): void {}

	showSearch(_replace?: boolean): void {}
}

export class Plugin extends Component {
	app: unknown;
	manifest: { version: string };

	constructor(app: unknown = {}, manifest: { version: string } = { version: 'test-version' }) {
		super();
		this.app = app;
		this.manifest = manifest;
	}

	loadData = jest.fn(async () => ({}));
	saveData = jest.fn(async () => undefined);
	registerEditorExtension = jest.fn();
	addSettingTab = jest.fn();
	registerMarkdownPostProcessor = jest.fn();
	registerView = jest.fn();
	addRibbonIcon = jest.fn();
	addCommand = jest.fn();
	registerEvent = jest.fn((eventRef: unknown) => eventRef);
}

export class PluginSettingTab {
	app: unknown;
	plugin: unknown;
	containerEl: {
		empty: jest.Mock;
		createEl: jest.Mock;
		createDiv: jest.Mock;
		appendChild: jest.Mock;
		querySelector: jest.Mock;
	};

	constructor(app: unknown, plugin: unknown) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = {
			empty: jest.fn(),
			createEl: jest.fn(() => ({
				appendChild: jest.fn(),
				querySelector: jest.fn(),
				createDiv: jest.fn(() => ({ createEl: jest.fn() })),
			})),
			createDiv: jest.fn(() => ({ createEl: jest.fn() })),
			appendChild: jest.fn(),
			querySelector: jest.fn(),
		};
	}
}

export class ItemView extends Component {
	containerEl: HTMLElement;
	protected leaf: unknown;
	protected app: {
		workspace: {
			on: jest.Mock;
			getActiveFile: jest.Mock;
			getActiveViewOfType: jest.Mock;
		};
	};

	constructor(leaf: unknown) {
		super();
		this.leaf = leaf;
		this.containerEl = {} as HTMLElement;
		this.app = {
			workspace: {
				on: jest.fn(),
				getActiveFile: jest.fn(),
				getActiveViewOfType: jest.fn(),
			},
		};
	}

	registerEvent = jest.fn();
}

export const MarkdownRenderer = {
	render: jest.fn(async (_app: unknown, markdown: string, el: HTMLElement) => {
		el.textContent = markdown;
	}),
	renderMarkdown: jest.fn(async (markdown: string, el: HTMLElement) => {
		el.textContent = markdown;
	}),
};

export const editorViewField = Symbol('editorViewField');

export const debounce = <Args extends unknown[], Result>(fn: (...args: Args) => Result) => {
	const debounced = ((...args: Args) => fn(...args)) as ((...args: Args) => Result) & { cancel: jest.Mock };
	debounced.cancel = jest.fn();
	return debounced;
};

// Mock Setting fluent API (minimal, without complex UI component mocks)
export const Setting = jest.fn().mockImplementation(() => {
	const settingInstance: {
		settingEl: { style: { display: string } };
		setName?: any;
		setDesc?: any;
		setHeading?: any;
		addText?: any;
		addTextArea?: any;
		addToggle?: any;
		addDropdown?: any;
		addSlider?: any;
		addButton?: any;
	} = {
		settingEl: { style: { display: "" } },
	};

	settingInstance.setName = jest.fn(() => settingInstance);
	settingInstance.setDesc = jest.fn(() => settingInstance);
	settingInstance.setHeading = jest.fn(() => settingInstance);

	// Simple component adders - no triggerChange helpers (not needed for our tests)
	settingInstance.addText = jest.fn((cb: (component: {
		setPlaceholder: jest.Mock;
		setValue: jest.Mock;
		onChange: jest.Mock;
		onInput: jest.Mock;
		inputEl: {
			onblur?: (e: FocusEvent) => void;
		};
	}) => void) => {
		const component = {
			setPlaceholder: jest.fn().mockReturnThis(),
			setValue: jest.fn().mockReturnThis(),
			onChange: jest.fn().mockReturnThis(),
			onInput: jest.fn().mockReturnThis(),
			inputEl: {},
		};
		cb(component);
		return settingInstance;
	});

	settingInstance.addTextArea = jest.fn((cb: (component: {
		setPlaceholder: jest.Mock;
		setValue: jest.Mock;
		inputEl: {
			setAttr: jest.Mock;
			onblur?: (e: FocusEvent) => void;
		};
	}) => void) => {
		const component = {
			setPlaceholder: jest.fn().mockReturnThis(),
			setValue: jest.fn().mockReturnThis(),
			inputEl: {
				setAttr: jest.fn(),
			},
		};
		cb(component);
		return settingInstance;
	});

	settingInstance.addToggle = jest.fn((cb: (component: {
		setValue: jest.Mock;
		onChange: jest.Mock;
	}) => void) => {
		const component = {
			setValue: jest.fn().mockReturnThis(),
			onChange: jest.fn().mockReturnThis(),
		};
		cb(component);
		return settingInstance;
	});

	settingInstance.addDropdown = jest.fn((cb: (component: {
		addOption: jest.Mock;
		setValue: jest.Mock;
		onChange: jest.Mock;
	}) => void) => {
		const component = {
			addOption: jest.fn().mockReturnThis(),
			setValue: jest.fn().mockReturnThis(),
			onChange: jest.fn().mockReturnThis(),
		};
		cb(component);
		return settingInstance;
	});

	settingInstance.addSlider = jest.fn((cb: (component: {
		setLimits: jest.Mock;
		setValue: jest.Mock;
		setDynamicTooltip: jest.Mock;
		onChange: jest.Mock;
	}) => void) => {
		const component = {
			setLimits: jest.fn().mockReturnThis(),
			setValue: jest.fn().mockReturnThis(),
			setDynamicTooltip: jest.fn().mockReturnThis(),
			onChange: jest.fn().mockReturnThis(),
		};
		cb(component);
		return settingInstance;
	});

	settingInstance.addButton = jest.fn((cb: (component: {
		setButtonText: jest.Mock;
		onClick: jest.Mock;
	}) => void) => {
		const component = {
			setButtonText: jest.fn().mockReturnThis(),
			onClick: jest.fn().mockReturnThis(),
		};
		cb(component);
		return settingInstance;
	});

	return settingInstance;
});

// Mock Notice class
export class Notice {
	message: string;
	timeout?: number;

	constructor(message: string, timeout?: number) {
		this.message = message;
		this.timeout = timeout;
	}

	hide() {}
}

// Mock normalizePath function
export const normalizePath = (path: string) => path.replace(/\\/g, "/");

// Export mocked classes
export const TFile = MockTFile;
export const TAbstractFile = MockTAbstractFile;

// Default export (for CommonJS compatibility)
export default {
	TFile: MockTFile,
	TAbstractFile: MockTAbstractFile,
	Component,
	MarkdownRenderChild,
	View,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	ItemView,
	MarkdownRenderer,
	editorViewField,
	debounce,
	normalizePath,
	Setting,
	Notice,
};
