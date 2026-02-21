// Unit tests for UpdateCoordinator
// Tests the update coordination and debouncing system

import { UpdateCoordinator } from '../../src/utils/UpdateCoordinator';
import { logger } from '../../src/utils/logger';

jest.useFakeTimers();

// Mock logger to avoid console output
jest.mock('../../src/utils/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}
}));

describe('UpdateCoordinator', () => {
	let coordinator: UpdateCoordinator;
	afterEach(() => {
		jest.clearAllMocks();
		jest.runOnlyPendingTimers();
		coordinator = null as unknown as UpdateCoordinator;
	});

	beforeEach(() => {
		coordinator = new UpdateCoordinator();
	});

	describe('schedule', () => {
		test('should schedule and execute operation', async () => {
			// Arrange
			const executor = jest.fn().mockResolvedValue(undefined);

			// Act
			const promise = coordinator.schedule('test-id', 'modify', '/test/path', executor);
			jest.advanceTimersByTime(100); // DEBOUNCE_DELAY_MS
			await promise;

			// Assert
			expect(executor).toHaveBeenCalledTimes(1);
		});

		test('should cancel existing operation with same ID', async () => {
			// Arrange
			const executor1 = jest.fn().mockResolvedValue(undefined);
			const executor2 = jest.fn().mockResolvedValue(undefined);

			// Act
			const promise1 = coordinator.schedule('test-id', 'modify', '/test/path', executor1);
			const promise2 = coordinator.schedule('test-id', 'modify', '/test/path2', executor2);
			jest.advanceTimersByTime(100);
			await Promise.all([promise1, promise2]);

			// Assert
			expect(executor1).not.toHaveBeenCalled(); // First call was cancelled
			expect(executor2).toHaveBeenCalledTimes(1); // Second call executed
		});

		test('should skip operation during unload', async () => {
			// Arrange
			const executor = jest.fn().mockResolvedValue(undefined);
			coordinator.unload();

			// Act
			const promise = coordinator.schedule('test-id', 'modify', '/test/path', executor);
			jest.advanceTimersByTime(100);
			await promise;

			// Assert
			expect(executor).not.toHaveBeenCalled();
		});

		test('should debounce execution', async () => {
			// Arrange
			const executor = jest.fn().mockResolvedValue(undefined);

			// Act
			coordinator.schedule('test-id', 'modify', '/test/path', executor);
			// Schedule same ID again before debounce
			coordinator.schedule('test-id', 'modify', '/test/path', executor);
			// Advance time but not enough to trigger debounce
			jest.advanceTimersByTime(50);

			// Assert - executor should not have been called yet
			expect(executor).not.toHaveBeenCalled();

			// Advance remaining time
			jest.advanceTimersByTime(50);
			await Promise.resolve(); // Wait for promises to resolve

			// Assert - executor should have been called once (second call cancelled first)
			expect(executor).toHaveBeenCalledTimes(1);
		});

		test('should clean up operation after completion', async () => {
			// Arrange
			const executor = jest.fn().mockResolvedValue(undefined);

			// Act
			const promise = coordinator.schedule('test-id', 'modify', '/test/path', executor);
			expect(coordinator.activeCount).toBe(1);
			jest.advanceTimersByTime(100);
			await promise;

			// Assert
			expect(coordinator.activeCount).toBe(0);
		});
	});

	describe('cancel', () => {
		test('should cancel specific operation', () => {
			// Arrange
			const executor = jest.fn().mockResolvedValue(undefined);
			coordinator.schedule('test-id', 'modify', '/test/path', executor);

			// Act
			coordinator.cancel('test-id');
			jest.advanceTimersByTime(100);

			// Assert
			expect(executor).not.toHaveBeenCalled();
			expect(coordinator.activeCount).toBe(0);
		});

		test('should handle non-existent ID gracefully', () => {
			// Arrange & Act & Assert - should not throw
			expect(() => {
				coordinator.cancel('nonexistent-id');
			}).not.toThrow();
		});
	});

	describe('cancelAll', () => {
		test('should cancel all operations', () => {
			// Arrange
			const executor1 = jest.fn().mockResolvedValue(undefined);
			const executor2 = jest.fn().mockResolvedValue(undefined);
			coordinator.schedule('test-id-1', 'modify', '/test/path1', executor1);
			coordinator.schedule('test-id-2', 'modify', '/test/path2', executor2);

			// Act
			coordinator.cancelAll();
			jest.advanceTimersByTime(100);

			// Assert
			expect(executor1).not.toHaveBeenCalled();
			expect(executor2).not.toHaveBeenCalled();
			expect(coordinator.activeCount).toBe(0);
		});

		test('should clear operation maps', () => {
			// Arrange
			const executor = jest.fn().mockResolvedValue(undefined);
			coordinator.schedule('test-id', 'modify', '/test/path', executor);

			// Act
			coordinator.cancelAll();

			// Assert
			expect(coordinator.activeCount).toBe(0);
		});
	});

	describe('unload', () => {
		test('should set unloading flag', () => {
			// Arrange & Act
			coordinator.unload();

			// Assert
			const internal = coordinator as unknown as { unloading: boolean };
			expect(internal.unloading).toBe(true);
		});

		test('should call cancelAll', () => {
			// Arrange
			const executor = jest.fn().mockResolvedValue(undefined);
			coordinator.schedule('test-id', 'modify', '/test/path', executor);
			const cancelAllSpy = jest.spyOn(coordinator, 'cancelAll');

			// Act
			coordinator.unload();

			// Assert
			expect(cancelAllSpy).toHaveBeenCalled();
		});
	});

	describe('activeCount', () => {
		test('should return correct count of active operations', () => {
			// Arrange
			const executor1 = jest.fn().mockResolvedValue(undefined);
			const executor2 = jest.fn().mockResolvedValue(undefined);

			// Act & Assert
			expect(coordinator.activeCount).toBe(0);
			coordinator.schedule('test-id-1', 'modify', '/test/path1', executor1);
			expect(coordinator.activeCount).toBe(1);
			coordinator.schedule('test-id-2', 'modify', '/test/path2', executor2);
			expect(coordinator.activeCount).toBe(2);
		});

		test('should update after operation completion', async () => {
			// Arrange
			const executor = jest.fn().mockResolvedValue(undefined);
			const promise = coordinator.schedule('test-id', 'modify', '/test/path', executor);
			expect(coordinator.activeCount).toBe(1);

			// Act
			jest.advanceTimersByTime(100);
			await promise;

			// Assert
			expect(coordinator.activeCount).toBe(0);
		});
	});

	describe('Concurrent Operations', () => {
		test('should handle multiple operations with different IDs', async () => {
			// Arrange
			const executor1 = jest.fn().mockResolvedValue(undefined);
			const executor2 = jest.fn().mockResolvedValue(undefined);
			const executor3 = jest.fn().mockResolvedValue(undefined);

			// Act
			const promise1 = coordinator.schedule('test-id-1', 'modify', '/test/path1', executor1);
			const promise2 = coordinator.schedule('test-id-2', 'modify', '/test/path2', executor2);
			const promise3 = coordinator.schedule('test-id-3', 'modify', '/test/path3', executor3);
			jest.advanceTimersByTime(100);
			await Promise.all([promise1, promise2, promise3]);

			// Assert
			expect(executor1).toHaveBeenCalledTimes(1);
			expect(executor2).toHaveBeenCalledTimes(1);
			expect(executor3).toHaveBeenCalledTimes(1);
		});

		test('should not interfere with each other', async () => {
			// Arrange
			const executor1 = jest.fn().mockResolvedValue(undefined);
			const executor2 = jest.fn().mockResolvedValue(undefined);
			const results: string[] = [];

			const wrappedExecutor1 = jest.fn().mockImplementation(async () => {
				results.push('executor1');
				return executor1();
			});
			const wrappedExecutor2 = jest.fn().mockImplementation(async () => {
				results.push('executor2');
				return executor2();
			});

			// Act
			const promise1 = coordinator.schedule('test-id-1', 'modify', '/test/path1', wrappedExecutor1);
			const promise2 = coordinator.schedule('test-id-2', 'modify', '/test/path2', wrappedExecutor2);
			jest.advanceTimersByTime(100);
			await Promise.all([promise1, promise2]);

			// Assert
			expect(results.length).toBe(2);
			expect(results).toContain('executor1');
			expect(results).toContain('executor2');
		});

		test('should handle rapid scheduling', async () => {
			// Arrange
			const executor = jest.fn().mockResolvedValue(undefined);

			// Act
			let lastPromise;
			for (let i = 0; i < 10; i++) {
				lastPromise = coordinator.schedule('test-id', 'modify', `/test/path-${i}`, executor);
			}
			jest.advanceTimersByTime(100);
			await lastPromise;

			// Assert
			// Only the last one should execute (all previous ones cancelled)
			expect(executor).toHaveBeenCalledTimes(1);
			expect(coordinator.activeCount).toBe(0);
		});
	});

	describe('Error Handling', () => {
		test('should handle executor errors', async () => {
			// Arrange
			const executor = jest.fn().mockImplementation(async () => {
				throw new Error('Executor error');
			});
			// Act
			const promise = coordinator.schedule('test-id', 'modify', '/test/path', executor);
			jest.advanceTimersByTime(100);

			// Assert
			try {
				await promise;
			} catch {
				// Expected error
			}
			expect(logger.error).toHaveBeenCalledWith(
				'Update operation failed',
				expect.objectContaining({
					error: expect.any(Error)
				})
			);
		});

		test('should not throw on abort', async () => {
			// Arrange
			const executor = jest.fn().mockRejectedValue(new Error('AbortError'));
			executor.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
			// Act
			const promise = coordinator.schedule('test-id', 'modify', '/test/path', executor);
			coordinator.cancel('test-id');
			jest.advanceTimersByTime(100);
			await promise;

			// Assert
			// Should not log error for aborted operations
			expect(logger.error).not.toHaveBeenCalled();
		});
	});
});
