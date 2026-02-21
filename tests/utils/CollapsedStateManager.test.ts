/**
 * Unit tests for CollapsedStateManager
 * Tests toggle logic, path normalization, and listener error handling
 */

import { CollapsedStateManager } from '../../src/utils/CollapsedStateManager';

describe('CollapsedStateManager', () => {
	let stateManager: CollapsedStateManager;

	beforeEach(() => {
		stateManager = new CollapsedStateManager();
	});

	describe('isCollapsed', () => {
		test('should return false for non-collapsed path', () => {
			// Act
			const result = stateManager.isCollapsed('test/path');

			// Assert
			expect(result).toBe(false);
		});

		test('should return true for collapsed path', () => {
			// Arrange
			stateManager.toggle('test/path');

			// Act
			const result = stateManager.isCollapsed('test/path');

			// Assert
			expect(result).toBe(true);
		});

		test('should be case-insensitive', () => {
			// Arrange
			stateManager.toggle('test/path/Upper.md');

			// Act & Assert
			expect(stateManager.isCollapsed('test/path/upper.md')).toBe(true);
			expect(stateManager.isCollapsed('TEST/PATH/UPPER.MD')).toBe(true);
			expect(stateManager.isCollapsed('Test/Path/Upper.md')).toBe(true);
		});

		test('should normalize paths consistently', () => {
			// Arrange
			stateManager.toggle('test\\path\\file.md');

			// Act & Assert
			expect(stateManager.isCollapsed('test/path/file.md')).toBe(true);
		});
	});

	describe('toggle', () => {
		test('should collapse an expanded path', () => {
			// Arrange
			expect(stateManager.isCollapsed('test/path')).toBe(false);

			// Act
			const result = stateManager.toggle('test/path');

			// Assert
			expect(result).toBe(true); // Now collapsed
			expect(stateManager.isCollapsed('test/path')).toBe(true);
		});

		test('should expand a collapsed path', () => {
			// Arrange
			stateManager.toggle('test/path');
			expect(stateManager.isCollapsed('test/path')).toBe(true);

			// Act
			const result = stateManager.toggle('test/path');

			// Assert
			expect(result).toBe(false); // Now expanded
			expect(stateManager.isCollapsed('test/path')).toBe(false);
		});

		test('should notify listeners on toggle', () => {
			// Arrange
			const listener = jest.fn();
			stateManager.subscribe(listener);

			// Act
			stateManager.toggle('test/path');

			// Assert
			expect(listener).toHaveBeenCalledTimes(1);
		});

		test('should handle case-insensitive toggles', () => {
			// Arrange
			stateManager.toggle('Test/Path/File.md');

			// Act
			const result = stateManager.toggle('test/path/file.md');

			// Assert
			expect(result).toBe(false); // Expanded (case-insensitive match)
			expect(stateManager.isCollapsed('Test/Path/File.md')).toBe(false);
		});
	});

	describe('collapseAll', () => {
		test('should collapse all paths in array', () => {
			// Arrange
			const paths = ['path1', 'path2', 'path3'];

			// Act
			stateManager.collapseAll(paths);

			// Assert
			expect(stateManager.isCollapsed('path1')).toBe(true);
			expect(stateManager.isCollapsed('path2')).toBe(true);
			expect(stateManager.isCollapsed('path3')).toBe(true);
		});

		test('should handle empty array', () => {
			// Arrange & Act - should not throw
			expect(() => {
				stateManager.collapseAll([]);
			}).not.toThrow();
		});

		test('should notify listeners on collapseAll', () => {
			// Arrange
			const listener = jest.fn();
			stateManager.subscribe(listener);

			// Act
			stateManager.collapseAll(['path1', 'path2']);

			// Assert
			expect(listener).toHaveBeenCalledTimes(1);
		});

		test('should deduplicate paths', () => {
			// Arrange
			const paths = ['path1', 'PATH1', 'path2'];

			// Act
			stateManager.collapseAll(paths);

			// Assert
			expect(stateManager.getAllCollapsed()).toHaveLength(2); // Deduplicated
			expect(stateManager.isCollapsed('path1')).toBe(true);
			expect(stateManager.isCollapsed('PATH1')).toBe(true); // Same path, case-insensitive
			expect(stateManager.isCollapsed('path2')).toBe(true);
		});
	});

	describe('expandAll', () => {
		test('should expand all collapsed paths', () => {
			// Arrange
			stateManager.collapseAll(['path1', 'path2', 'path3']);
			expect(stateManager.getAllCollapsed()).toHaveLength(3);

			// Act
			stateManager.expandAll();

			// Assert
			expect(stateManager.getAllCollapsed()).toHaveLength(0);
			expect(stateManager.isCollapsed('path1')).toBe(false);
			expect(stateManager.isCollapsed('path2')).toBe(false);
			expect(stateManager.isCollapsed('path3')).toBe(false);
		});

		test('should handle empty state', () => {
			// Arrange & Act - should not throw
			expect(() => {
				stateManager.expandAll();
			}).not.toThrow();
		});

		test('should notify listeners on expandAll', () => {
			// Arrange
			const listener = jest.fn();
			stateManager.subscribe(listener);
			stateManager.collapseAll(['path1']);

			// Act
			stateManager.expandAll();

			// Assert
			expect(listener).toHaveBeenCalledTimes(2); // Once for collapseAll, once for expandAll
		});
	});

	describe('toggleAll', () => {
		test('should expand all when all are collapsed', () => {
			// Arrange
			stateManager.collapseAll(['path1', 'path2']);
			expect(stateManager.getAllCollapsed()).toHaveLength(2);

			// Act
			const result = stateManager.toggleAll(['path1', 'path2']);

			// Assert
			expect(result).toBe(false); // Now all expanded
			expect(stateManager.getAllCollapsed()).toHaveLength(0);
		});

		test('should collapse all when not all are collapsed', () => {
			// Arrange
			stateManager.toggle('path1');
			const paths = ['path1', 'path2'];

			// Act
			const result = stateManager.toggleAll(paths);

			// Assert
			expect(result).toBe(true); // Now all collapsed
			expect(stateManager.isCollapsed('path1')).toBe(true);
			expect(stateManager.isCollapsed('path2')).toBe(true);
		});

		test('should collapse all when none are collapsed', () => {
			// Arrange
			const paths = ['path1', 'path2'];

			// Act
			const result = stateManager.toggleAll(paths);

			// Assert
			expect(result).toBe(true); // Now all collapsed
			expect(stateManager.isCollapsed('path1')).toBe(true);
			expect(stateManager.isCollapsed('path2')).toBe(true);
		});

		test('should handle empty array', () => {
			// Arrange & Act
			const result = stateManager.toggleAll([]);

			// Assert - empty array, all are collapsed (vacuously true), so it should expand (return false)
			expect(result).toBe(false);
		});

		test('should notify listeners on toggleAll', () => {
			// Arrange
			const listener = jest.fn();
			stateManager.subscribe(listener);

			// Act
			stateManager.toggleAll(['path1', 'path2']);

			// Assert
			expect(listener).toHaveBeenCalledTimes(1);
		});
	});

	describe('getAllCollapsed', () => {
		test('should return empty array initially', () => {
			// Act
			const result = stateManager.getAllCollapsed();

			// Assert
			expect(result).toEqual([]);
		});

		test('should return all collapsed paths', () => {
			// Arrange
			stateManager.toggle('path1');
			stateManager.toggle('path2');
			stateManager.toggle('path3');

			// Act
			const result = stateManager.getAllCollapsed();

			// Assert
			expect(result).toHaveLength(3);
			expect(result).toContain('path1');
			expect(result).toContain('path2');
			expect(result).toContain('path3');
		});

		test('should return normalized, lowercase paths', () => {
			// Arrange
			stateManager.toggle('Test/Path/FILE.md');

			// Act
			const result = stateManager.getAllCollapsed();

			// Assert
			expect(result).toEqual(['test/path/file.md']);
		});
	});

	describe('subscribe', () => {
		test('should add listener and return unsubscribe function', () => {
			// Arrange
			const listener = jest.fn();

			// Act
			const unsubscribe = stateManager.subscribe(listener);
			stateManager.toggle('test/path');

			// Assert
			expect(listener).toHaveBeenCalledTimes(1);

			// Act - unsubscribe
			unsubscribe();
			stateManager.toggle('test/path');

			// Assert - listener not called after unsubscribe
			expect(listener).toHaveBeenCalledTimes(1);
		});

		test('should allow multiple listeners', () => {
			// Arrange
			const listener1 = jest.fn();
			const listener2 = jest.fn();
			const listener3 = jest.fn();

			stateManager.subscribe(listener1);
			stateManager.subscribe(listener2);
			stateManager.subscribe(listener3);

			// Act
			stateManager.toggle('test/path');

			// Assert
			expect(listener1).toHaveBeenCalledTimes(1);
			expect(listener2).toHaveBeenCalledTimes(1);
			expect(listener3).toHaveBeenCalledTimes(1);
		});

		test('should handle listener errors gracefully', () => {
			// Arrange
			const errorListener = jest.fn().mockImplementation(() => {
				throw new Error('Listener error');
			});
			const successListener = jest.fn();
			stateManager.subscribe(errorListener);
			stateManager.subscribe(successListener);

			// Act & Assert - should not throw
			expect(() => {
				stateManager.toggle('test/path');
			}).not.toThrow();

			// Assert
			expect(errorListener).toHaveBeenCalledTimes(1);
			expect(successListener).toHaveBeenCalledTimes(1); // Other listeners still called
		});

		test('should handle null/undefined listeners gracefully', () => {
			// Arrange & Act - should not throw
			expect(() => {
				const unsubscribe = stateManager.subscribe(null as any);
				stateManager.toggle('test/path');
				unsubscribe();
			}).not.toThrow();
		});
	});

	describe('initialization', () => {
		test('should initialize with empty collapsed paths', () => {
			// Act
			const manager = new CollapsedStateManager();

			// Assert
			expect(manager.getAllCollapsed()).toEqual([]);
		});

		test('should initialize with provided paths', () => {
			// Arrange
			const paths = ['path1', 'path2', 'path3'];

			// Act
			const manager = new CollapsedStateManager(paths);

			// Assert
			expect(manager.getAllCollapsed()).toHaveLength(3);
			expect(manager.isCollapsed('path1')).toBe(true);
			expect(manager.isCollapsed('path2')).toBe(true);
			expect(manager.isCollapsed('path3')).toBe(true);
		});

		test('should normalize initial paths', () => {
			// Arrange
			const paths = ['Test\\Path\\File.md', 'PATH2'];

			// Act
			const manager = new CollapsedStateManager(paths);

			// Assert
			expect(manager.getAllCollapsed()).toEqual(['test/path/file.md', 'path2']);
		});

		test('should deduplicate initial paths', () => {
			// Arrange
			const paths = ['path1', 'PATH1', 'path2'];

			// Act
			const manager = new CollapsedStateManager(paths);

			// Assert
			expect(manager.getAllCollapsed()).toHaveLength(2);
		});
	});
});
