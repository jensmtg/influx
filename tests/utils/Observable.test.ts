// Unit tests for Observable
// Tests the observable pattern implementation

import { Observable } from '../../src/utils/Observable';
import { logger } from '../../src/utils/logger';

// Mock logger to avoid console output
jest.mock('../../src/utils/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}
}));

describe('Observable', () => {
	let observable: Observable<string>;
	afterEach(() => {
		jest.clearAllMocks();
	});

	beforeEach(() => {
		observable = new Observable<string>();
	});

	describe('subscribe', () => {
		test('should add observer to map', () => {
			// Arrange
			const observer = jest.fn();

			// Act
			observable.subscribe('test-id', observer);

			// Assert
			expect(observable.observerCount).toBe(1);
		});

		test('should return unsubscribe function', () => {
			// Arrange
			const observer = jest.fn();

			// Act
			const unsubscribe = observable.subscribe('test-id', observer);
			unsubscribe();

			// Assert
			expect(observable.observerCount).toBe(0);
		});

		test('should allow multiple subscribers', () => {
			// Arrange
			const observer1 = jest.fn();
			const observer2 = jest.fn();
			const observer3 = jest.fn();

			// Act
			observable.subscribe('test-id-1', observer1);
			observable.subscribe('test-id-2', observer2);
			observable.subscribe('test-id-3', observer3);

			// Assert
			expect(observable.observerCount).toBe(3);
		});

		test('should handle duplicate IDs (overwrite)', () => {
			// Arrange
			const observer1 = jest.fn();
			const observer2 = jest.fn();

			// Act
			observable.subscribe('test-id', observer1);
			observable.subscribe('test-id', observer2);

			// Assert
			expect(observable.observerCount).toBe(1); // Only one observer (observer2 replaced observer1)
		});
	});

	describe('notify', () => {
		test('should notify all observers', async () => {
			// Arrange
			const observer1 = jest.fn();
			const observer2 = jest.fn();
			const observer3 = jest.fn();
			observable.subscribe('test-id-1', observer1);
			observable.subscribe('test-id-2', observer2);
			observable.subscribe('test-id-3', observer3);

			// Act
			await observable.notify('test-data');

			// Assert
			expect(observer1).toHaveBeenCalledWith('test-data');
			expect(observer2).toHaveBeenCalledWith('test-data');
			expect(observer3).toHaveBeenCalledWith('test-data');
		});

		test('should handle async observers', async () => {
			// Arrange
			const observer1 = jest.fn().mockResolvedValue(undefined);
			const observer2 = jest.fn().mockResolvedValue(undefined);
			observable.subscribe('test-id-1', observer1);
			observable.subscribe('test-id-2', observer2);

			// Act
			await observable.notify('test-data');

			// Assert
			expect(observer1).toHaveBeenCalledWith('test-data');
			expect(observer2).toHaveBeenCalledWith('test-data');
		});

		test('should handle sync observers', async () => {
			// Arrange
			const observer1 = jest.fn();
			const observer2 = jest.fn();
			observable.subscribe('test-id-1', observer1);
			observable.subscribe('test-id-2', observer2);

			// Act
			await observable.notify('test-data');

			// Assert
			expect(observer1).toHaveBeenCalledWith('test-data');
			expect(observer2).toHaveBeenCalledWith('test-data');
		});

		test('should prevent re-entrancy', async () => {
			// Arrange
			let notifyCount = 0;
			const observer = jest.fn().mockImplementation(async () => {
				notifyCount++;
				// Try to notify again from within observer
				await observable.notify('nested-data');
			});
			observable.subscribe('test-id', observer);

			// Act
			await observable.notify('test-data');

			// Assert
			expect(notifyCount).toBe(1);
			expect(observer).toHaveBeenCalledTimes(1);
		});

		test('should wait for all promises', async () => {
			// Arrange
			const order: string[] = [];
			const observer1 = jest.fn().mockImplementation(async () => {
				order.push('observer1-start');
				await new Promise(resolve => setTimeout(resolve, 10));
				order.push('observer1-end');
			});
			const observer2 = jest.fn().mockImplementation(async () => {
				order.push('observer2');
			});
			observable.subscribe('test-id-1', observer1);
			observable.subscribe('test-id-2', observer2);

			// Act
			await observable.notify('test-data');

			// Assert
			expect(order).toEqual(['observer1-start', 'observer2', 'observer1-end']);
		});

		test('should handle observer errors gracefully', async () => {
			// Arrange
			const observer1 = jest.fn().mockRejectedValue(new Error('Observer error'));
			const observer2 = jest.fn();
			observable.subscribe('test-id-1', observer1);
			observable.subscribe('test-id-2', observer2);

			// Act
			await observable.notify('test-data');

			// Assert
			expect(logger.error).toHaveBeenCalledWith(
				'Observer failed',
				expect.objectContaining({
					error: expect.any(Error)
				})
			);
			expect(observer2).toHaveBeenCalledWith('test-data');
		});
	});

	describe('unsubscribe via returned function', () => {
		test('should remove observer from map', () => {
			// Arrange
			const observer = jest.fn();
			observable.subscribe('test-id', observer);

			// Act
			const unsubscribe = observable.subscribe('test-id', observer);
			unsubscribe();

			// Assert
			expect(observable.observerCount).toBe(0);
		});

		test('should handle non-existent ID gracefully', () => {
			// Arrange
			const observer = jest.fn();
			const unsubscribe = observable.subscribe('test-id', observer);
			unsubscribe();
			unsubscribe(); // Unsubscribe twice

			// Assert - should not throw
			expect(observable.observerCount).toBe(0);
		});
	});

	describe('unsubscribeAll', () => {
		test('should clear all observers', () => {
			// Arrange
			const observer1 = jest.fn();
			const observer2 = jest.fn();
			const observer3 = jest.fn();
			observable.subscribe('test-id-1', observer1);
			observable.subscribe('test-id-2', observer2);
			observable.subscribe('test-id-3', observer3);

			// Act
			observable.unsubscribeAll();

			// Assert
			expect(observable.observerCount).toBe(0);
		});

		test('should handle empty registry', () => {
			// Arrange & Act & Assert - should not throw
			expect(() => {
				observable.unsubscribeAll();
			}).not.toThrow();
		});
	});

	describe('observerCount', () => {
		test('should return correct count', () => {
			// Arrange & Act & Assert
			expect(observable.observerCount).toBe(0);
			observable.subscribe('test-id-1', jest.fn());
			expect(observable.observerCount).toBe(1);
			observable.subscribe('test-id-2', jest.fn());
			expect(observable.observerCount).toBe(2);
			observable.subscribe('test-id-3', jest.fn());
			expect(observable.observerCount).toBe(3);
		});

		test('should update after subscribe/unsubscribe', () => {
			// Arrange
			observable.subscribe('test-id-1', jest.fn());
			observable.subscribe('test-id-2', jest.fn());
			expect(observable.observerCount).toBe(2);

			// Act
			const unsubscribe = observable.subscribe('test-id-2', jest.fn());
			unsubscribe();

			// Assert
			expect(observable.observerCount).toBe(1);
		});
	});

	describe('Re-entrancy Prevention', () => {
		test('should not allow nested notify calls', async () => {
			// Arrange
			let nestedNotifyCalled = false;
			const observer = jest.fn().mockImplementation(async () => {
				// Try to notify again from within observer
				await observable.notify('nested-data');
				nestedNotifyCalled = true;
			});
			observable.subscribe('test-id', observer);

			// Act
			await observable.notify('test-data');

			// Assert
			expect(nestedNotifyCalled).toBe(true); // Observer was called
			expect(observer).toHaveBeenCalledTimes(1); // But nested notify was prevented
		});

		test('should handle notify during notify', async () => {
			// Arrange
			const callOrder: string[] = [];
			const observer1 = jest.fn().mockImplementation(async () => {
				callOrder.push('observer1');
				await new Promise(resolve => setTimeout(resolve, 10));
			});
			const observer2 = jest.fn().mockImplementation(async () => {
				callOrder.push('observer2');
				// Try to notify again (will be ignored due to re-entrancy prevention)
				await observable.notify('nested-data');
				callOrder.push('observer2-after-nested');
			});
			observable.subscribe('test-id-1', observer1);
			observable.subscribe('test-id-2', observer2);

			// Act
			await observable.notify('test-data');

			// Assert
			// Nested notify is ignored, so observer1 is not called again
			expect(callOrder).toEqual(['observer1', 'observer2', 'observer2-after-nested']);
		});
	});

	describe('Error Handling', () => {
		test('should catch and log sync observer errors', async () => {
			// Arrange
			const observer1 = jest.fn().mockImplementation(() => {
				throw new Error('Sync error');
			});
			const observer2 = jest.fn();
			observable.subscribe('test-id-1', observer1);
			observable.subscribe('test-id-2', observer2);

			// Act
			await observable.notify('test-data');

			// Assert
			expect(logger.error).toHaveBeenCalledWith(
				'Observer failed synchronously',
				expect.objectContaining({
					error: expect.any(Error)
				})
			);
			expect(observer2).toHaveBeenCalledWith('test-data');
		});

		test('should catch and log async observer errors', async () => {
			// Arrange
			const observer1 = jest.fn().mockRejectedValue(new Error('Async error'));
			const observer2 = jest.fn();
			observable.subscribe('test-id-1', observer1);
			observable.subscribe('test-id-2', observer2);

			// Act
			await observable.notify('test-data');

			// Assert
			expect(logger.error).toHaveBeenCalledWith(
				'Observer failed',
				expect.objectContaining({
					error: expect.any(Error)
				})
			);
			expect(observer2).toHaveBeenCalledWith('test-data');
		});

		test('should continue notifying other observers after error', async () => {
			// Arrange
			const results: string[] = [];
			const observer1 = jest.fn().mockImplementation(() => {
				results.push('observer1');
				throw new Error('Error');
			});
			const observer2 = jest.fn().mockImplementation(() => {
				results.push('observer2');
			});
			const observer3 = jest.fn().mockImplementation(() => {
				results.push('observer3');
			});
			observable.subscribe('test-id-1', observer1);
			observable.subscribe('test-id-2', observer2);
			observable.subscribe('test-id-3', observer3);

			// Act
			await observable.notify('test-data');

			// Assert
			expect(results).toEqual(['observer1', 'observer2', 'observer3']);
		});
	});
});
