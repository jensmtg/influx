/**
 * Unit tests for EventManager
 * Tests event filtering and plugin trigger coordination
 */

import { EventManager } from '../../src/managers/EventManager';
import { TAbstractFile } from 'obsidian';
import { mockTFile } from '../mocks';

describe('EventManager', () => {
	let eventManager: EventManager;
	let mockPlugin: any;

	beforeEach(() => {
		mockPlugin = {
			app: {
				vault: {
					on: jest.fn()
				},
				workspace: {
					on: jest.fn()
				}
			},
			data: {
				settings: { liveUpdate: true }
			},
			api: {
				invalidateFileCache: jest.fn()
			},
			cleanupFileHash: jest.fn(),
			triggerUpdates: jest.fn(),
			registerEvent: jest.fn(),
			cleanupReactRoots: jest.fn()
		};
		eventManager = new EventManager(mockPlugin);
	});

	describe('handleModify', () => {
		test('should skip processing when liveUpdate is false', () => {
			// Arrange
			mockPlugin.data.settings.liveUpdate = false;
			const file = mockTFile('test.md', 'test');

			// Act
			(eventManager as any).handleModify(file);

			// Assert
			expect(mockPlugin.api.invalidateFileCache).not.toHaveBeenCalled();
			expect(mockPlugin.triggerUpdates).not.toHaveBeenCalled();
		});

		test('should skip processing for folders (TAbstractFile)', () => {
			// Arrange
			const folder = {} as TAbstractFile; // Not a TFile
			mockPlugin.data.settings.liveUpdate = true;

			// Act
			(eventManager as any).handleModify(folder);

			// Assert
			expect(mockPlugin.api.invalidateFileCache).not.toHaveBeenCalled();
			expect(mockPlugin.triggerUpdates).not.toHaveBeenCalled();
		});

		test('should process files when liveUpdate is true', () => {
			// Arrange
			const file = mockTFile('test.md', 'test');
			mockPlugin.data.settings.liveUpdate = true;

			// Act
			(eventManager as any).handleModify(file);

			// Assert
			expect(mockPlugin.api.invalidateFileCache).toHaveBeenCalledWith(file.path);
			expect(mockPlugin.triggerUpdates).toHaveBeenCalledWith('modify', file);
		});
	});

	describe('handleRename', () => {
		test('should skip processing for folders', () => {
			// Arrange
			const folder = {} as TAbstractFile;

			// Act
			(eventManager as any).handleRename(folder);

			// Assert
			expect(mockPlugin.api.invalidateFileCache).not.toHaveBeenCalled();
			expect(mockPlugin.cleanupFileHash).not.toHaveBeenCalled();
		});

		test('should process file rename', () => {
			// Arrange
			const file = mockTFile('test.md', 'test');

			// Act
			(eventManager as any).handleRename(file);

			// Assert
			expect(mockPlugin.api.invalidateFileCache).toHaveBeenCalledWith('test.md');
			expect(mockPlugin.cleanupFileHash).toHaveBeenCalledWith('test.md');
			expect(mockPlugin.triggerUpdates).toHaveBeenCalledWith('rename', file);
		});
	});

	describe('handleDelete', () => {
		test('should skip processing for folders', () => {
			// Arrange
			const folder = {} as TAbstractFile;

			// Act
			(eventManager as any).handleDelete(folder);

			// Assert
			expect(mockPlugin.api.invalidateFileCache).not.toHaveBeenCalled();
			expect(mockPlugin.cleanupFileHash).not.toHaveBeenCalled();
		});

		test('should process file deletion', () => {
			// Arrange
			const file = mockTFile('test.md', 'test');

			// Act
			(eventManager as any).handleDelete(file);

			// Assert
			expect(mockPlugin.api.invalidateFileCache).toHaveBeenCalledWith('test.md');
			expect(mockPlugin.cleanupFileHash).toHaveBeenCalledWith('test.md');
			expect(mockPlugin.triggerUpdates).toHaveBeenCalledWith('delete', file);
		});
	});

	describe('handleFileOpen', () => {
		test('should skip processing when file is null', () => {
			// Arrange
			const file = null as TAbstractFile | null;

			// Act
			(eventManager as any).handleFileOpen(file);

			// Assert
			expect(mockPlugin.triggerUpdates).not.toHaveBeenCalled();
		});

		test('should skip processing for folders', () => {
			// Arrange
			const folder = {} as TAbstractFile;

			// Act
			(eventManager as any).handleFileOpen(folder);

			// Assert
			expect(mockPlugin.triggerUpdates).not.toHaveBeenCalled();
		});

		test('should process file open', () => {
			// Arrange
			const file = mockTFile('test.md', 'test');

			// Act
			(eventManager as any).handleFileOpen(file);

			// Assert
			expect(mockPlugin.triggerUpdates).toHaveBeenCalledWith('file-open', file);
		});
	});

	describe('handleLayoutChange', () => {
		test('should cleanup react roots and trigger updates', () => {
			// Act
			(eventManager as any).handleLayoutChange();

			// Assert
			expect(mockPlugin.cleanupReactRoots).toHaveBeenCalled();
			expect(mockPlugin.triggerUpdates).toHaveBeenCalledWith('layout-change');
		});
	});

	describe('register', () => {
		test('should register all event handlers', () => {
			// Act
			eventManager.register();

			// Assert
			expect(mockPlugin.app.vault.on).toHaveBeenCalledWith('modify', expect.any(Function));
			expect(mockPlugin.app.vault.on).toHaveBeenCalledWith('rename', expect.any(Function));
			expect(mockPlugin.app.vault.on).toHaveBeenCalledWith('delete', expect.any(Function));
			expect(mockPlugin.app.workspace.on).toHaveBeenCalledWith('file-open', expect.any(Function));
			expect(mockPlugin.app.workspace.on).toHaveBeenCalledWith('layout-change', expect.any(Function));
		});
	});
});
