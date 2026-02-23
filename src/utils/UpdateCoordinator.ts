import { logger } from './logger';
import { CONSTANTS } from '../constants';

export interface UpdateOperation {
	id: string;
	op: string;
	filePath?: string;
	abortController: AbortController;
	promise: Promise<void>;
	timestamp: number;
}

export interface UpdateCoordinatorDebugInfo {
	unloading: boolean;
	activeCount: number;
	operations: Array<{
		id: string;
		op: string;
		filePath?: string;
		ageMs: number;
	}>;
}

export class UpdateCoordinator {
	private operations = new Map<string, UpdateOperation>();
	private unloading = false;

	/**
	 * Reset coordinator state after plugin reload/re-enable.
	 */
	initialize(): void {
		this.cancelAll();
		this.unloading = false;
	}

	/**
	 * Schedule an update operation
	 */
	async schedule(
		id: string,
		op: string,
		filePath: string | undefined,
		executor: (signal: AbortSignal) => Promise<void>
	): Promise<void> {
		if (this.unloading) {
			logger.debug('Skipping update - coordinator unloading', { id, op, filePath });
			return;
		}

		// Cancel any existing operation with same ID
		this.cancel(id);

		const abortController = new AbortController();

		const operation: UpdateOperation = {
			id,
			op,
			filePath,
			abortController,
			promise: this.executeWithDebounce(id, executor, abortController),
			timestamp: Date.now()
		};

		this.operations.set(id, operation);

		try {
			await operation.promise;
		} finally {
			if (this.operations.get(id) === operation) {
				this.operations.delete(id);
			}
		}
	}

	private async executeWithDebounce(
		id: string,
		executor: (signal: AbortSignal) => Promise<void>,
		abortController: AbortController
	): Promise<void> {
		// Debounce delay
		await new Promise(resolve => setTimeout(resolve, CONSTANTS.DEBOUNCE_DELAY_MS));

		if (abortController.signal.aborted || this.unloading) {
			return;
		}

		try {
			await executor(abortController.signal);
		} catch (e) {
			if (!abortController.signal.aborted) {
				logger.error('Update operation failed', { id, error: e });
				throw e;
			}
		}
	}

	/**
	 * Cancel a specific operation
	 */
	cancel(id: string): void {
		const operation = this.operations.get(id);
		if (operation) {
			operation.abortController.abort();
			this.operations.delete(id);
			logger.debug('Cancelled operation', { id, op: operation.op });
		}
	}

	/**
	 * Cancel all operations
	 */
	cancelAll(): void {
		for (const [id, operation] of this.operations) {
			operation.abortController.abort();
			logger.debug('Cancelled operation during cleanup', { id, op: operation.op });
		}
		this.operations.clear();
	}

	/**
	 * Mark coordinator as unloading
	 */
	unload(): void {
		this.unloading = true;
		this.cancelAll();
	}

	/**
	 * Get active operation count (for debugging)
	 */
	get activeCount(): number {
		return this.operations.size;
	}

	getDebugInfo(): UpdateCoordinatorDebugInfo {
		const now = Date.now();
		return {
			unloading: this.unloading,
			activeCount: this.operations.size,
			operations: Array.from(this.operations.values()).map((operation) => ({
				id: operation.id,
				op: operation.op,
				filePath: operation.filePath,
				ageMs: now - operation.timestamp,
			})),
		};
	}
}

export const updateCoordinator = new UpdateCoordinator();
