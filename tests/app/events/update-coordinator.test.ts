import { CONSTANTS } from '@/config/constants';
import { UpdateCoordinator } from '@/app/events/update-coordinator';
import { logger } from '@/platform/diagnostics/logger';

jest.mock('@/platform/diagnostics/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

describe('UpdateCoordinator', () => {
    let coordinator: UpdateCoordinator;

    const advanceDebounce = async () => {
        jest.advanceTimersByTime(CONSTANTS.DEBOUNCE_DELAY_MS);
        await Promise.resolve();
    };

    beforeEach(() => {
        jest.useFakeTimers();
        coordinator = new UpdateCoordinator();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    describe('schedule and lifecycle', () => {
        test('executes scheduled operation after debounce and cleans up active state', async () => {
            const executor = jest.fn().mockResolvedValue(undefined);
            const promise = coordinator.schedule('id', 'modify', '/a.md', executor);

            expect(coordinator.activeCount).toBe(1);
            await advanceDebounce();
            await promise;

            expect(executor).toHaveBeenCalledTimes(1);
            expect(coordinator.activeCount).toBe(0);
        });

        test('scheduling same id cancels previous pending operation', async () => {
            const first = jest.fn().mockResolvedValue(undefined);
            const second = jest.fn().mockResolvedValue(undefined);

            const p1 = coordinator.schedule('id', 'modify', '/a.md', first);
            const p2 = coordinator.schedule('id', 'modify', '/b.md', second);
            await advanceDebounce();
            await Promise.all([p1, p2]);

            expect(first).not.toHaveBeenCalled();
            expect(second).toHaveBeenCalledTimes(1);
        });

        test('older same-id operation completion does not remove newer active operation', async () => {
            let resolveFirst: (() => void) | null = null;
            const first = jest.fn().mockImplementation(
                () =>
                    new Promise<void>((resolve) => {
                        resolveFirst = resolve;
                    })
            );
            const second = jest.fn().mockResolvedValue(undefined);

            const p1 = coordinator.schedule('id', 'modify', '/a.md', first);
            await advanceDebounce();
            expect(first).toHaveBeenCalledTimes(1);

            const p2 = coordinator.schedule('id', 'modify', '/b.md', second);
            expect(coordinator.activeCount).toBe(1);

            resolveFirst?.();
            await Promise.resolve();
            expect(coordinator.activeCount).toBe(1);

            await advanceDebounce();
            await Promise.all([p1, p2]);
            expect(second).toHaveBeenCalledTimes(1);
            expect(coordinator.activeCount).toBe(0);
        });

        test('getDebugInfo exposes pending operation metadata', () => {
            coordinator.schedule('id', 'modify', '/a.md', jest.fn().mockResolvedValue(undefined));
            const info = coordinator.getDebugInfo();

            expect(info.unloading).toBe(false);
            expect(info.activeCount).toBe(1);
            expect(info.operations).toContainEqual(
                expect.objectContaining({ id: 'id', op: 'modify', filePath: '/a.md' })
            );
        });
    });

	    describe('cancellation and unload', () => {
        test('cancel(id) aborts pending operation', async () => {
            const executor = jest.fn().mockResolvedValue(undefined);
            const promise = coordinator.schedule('id', 'modify', '/a.md', executor);

            coordinator.cancel('id');
            await advanceDebounce();
            await promise;

            expect(executor).not.toHaveBeenCalled();
            expect(coordinator.activeCount).toBe(0);
        });

        test('cancelAll aborts all pending operations', async () => {
            const a = jest.fn().mockResolvedValue(undefined);
            const b = jest.fn().mockResolvedValue(undefined);
            const p1 = coordinator.schedule('a', 'modify', '/a.md', a);
            const p2 = coordinator.schedule('b', 'modify', '/b.md', b);

            coordinator.cancelAll();
            await advanceDebounce();
            await Promise.all([p1, p2]);

            expect(a).not.toHaveBeenCalled();
            expect(b).not.toHaveBeenCalled();
            expect(coordinator.activeCount).toBe(0);
        });

	        test('unload cancels pending operations and blocks new scheduling', async () => {
            const executor = jest.fn().mockResolvedValue(undefined);
            const pending = coordinator.schedule('id', 'modify', '/a.md', executor);

            coordinator.unload();
            await advanceDebounce();
            await pending;

            const postUnloadExecutor = jest.fn().mockResolvedValue(undefined);
            await coordinator.schedule('new', 'modify', '/new.md', postUnloadExecutor);

            const info = coordinator.getDebugInfo();
            expect(executor).not.toHaveBeenCalled();
            expect(postUnloadExecutor).not.toHaveBeenCalled();
	            expect(info.unloading).toBe(true);
	            expect(info.activeCount).toBe(0);
	        });

	        test('initialize re-enables scheduling after unload', async () => {
	            coordinator.unload();
	            coordinator.initialize();

	            const executor = jest.fn().mockResolvedValue(undefined);
	            const promise = coordinator.schedule('id', 'modify', '/a.md', executor);

	            await advanceDebounce();
	            await promise;

	            expect(executor).toHaveBeenCalledTimes(1);
	            expect(coordinator.getDebugInfo().unloading).toBe(false);
	        });
	    });

    describe('error behavior', () => {
        test('logs and propagates executor errors when operation is not aborted', async () => {
            const executor = jest.fn().mockRejectedValue(new Error('boom'));
            const promise = coordinator.schedule('id', 'modify', '/a.md', executor);

            await advanceDebounce();
            await expect(promise).rejects.toThrow('boom');
            expect(logger.error).toHaveBeenCalledWith(
                'Update operation failed',
                expect.objectContaining({ id: 'id', error: expect.any(Error) })
            );
        });

        test('does not log or throw when rejection happens after abort', async () => {
            const executor = jest.fn().mockImplementation(
                () =>
                    new Promise<void>((_, reject) => {
                        setTimeout(() => reject(new Error('aborted')), 10);
                    })
            );
            const promise = coordinator.schedule('id', 'modify', '/a.md', executor);

            jest.advanceTimersByTime(CONSTANTS.DEBOUNCE_DELAY_MS);
            coordinator.cancel('id');
            jest.advanceTimersByTime(10);
            await promise;

            expect(logger.error).not.toHaveBeenCalled();
        });
    });
});
