import { jest } from "@jest/globals";

// Mock TFile class
class MockTFile {
	path: string;
	basename: string;
	extension: string;
	name: string;
	vault: any;
	parent: any;
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

// Mock Setting fluent API (minimal, without complex UI component mocks)
export const Setting = jest.fn().mockImplementation(() => {
	const settingInstance: any = {
		settingEl: { style: { display: "" } },
	};

	settingInstance.setName = jest.fn(() => settingInstance);
	settingInstance.setDesc = jest.fn(() => settingInstance);
	settingInstance.setHeading = jest.fn(() => settingInstance);

	// Simple component adders - no triggerChange helpers (not needed for our tests)
	settingInstance.addText = jest.fn((cb: any) => {
		const component = {
			setPlaceholder: jest.fn().mockReturnThis(),
			setValue: jest.fn().mockReturnThis(),
			onChange: jest.fn().mockReturnThis(),
			onInput: jest.fn().mockReturnThis(),
		};
		cb(component);
		return settingInstance;
	});

	settingInstance.addToggle = jest.fn((cb: any) => {
		const component = {
			setValue: jest.fn().mockReturnThis(),
			onChange: jest.fn().mockReturnThis(),
		};
		cb(component);
		return settingInstance;
	});

	settingInstance.addDropdown = jest.fn((cb: any) => {
		const component = {
			addOption: jest.fn().mockReturnThis(),
			setValue: jest.fn().mockReturnThis(),
			onChange: jest.fn().mockReturnThis(),
		};
		cb(component);
		return settingInstance;
	});

	settingInstance.addSlider = jest.fn((cb: any) => {
		const component = {
			setLimits: jest.fn().mockReturnThis(),
			setValue: jest.fn().mockReturnThis(),
			setDynamicTooltip: jest.fn().mockReturnThis(),
			onChange: jest.fn().mockReturnThis(),
		};
		cb(component);
		return settingInstance;
	});

	settingInstance.addButton = jest.fn((cb: any) => {
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
	normalizePath,
	Setting,
	Notice,
};
