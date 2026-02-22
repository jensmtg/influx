import { CONSTANTS } from '../../src/constants';
import { UpdateCoordinator } from '../../src/utils/UpdateCoordinator';
import { logger } from '../../src/utils/logger';

jest.useFakeTimers();

jest.mock('../../src/utils/logger', () => ({
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
        coordinator = new UpdateCoordinator();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
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

        test('getDebugInfo exposes pending operation metadata', () => {
            coordinator.schedule('id', 'modify', '/a.md', jest.fn().mockResolvedValue(undefined));
            const info = coordinator.getDebugInfo();

            expect(info.unloading).toBe(false);
            expect(info.activeCount).toBe(1);
            expect(info.operations).toHaveLength(1);
            expect(info.operations[0]).toEqual(
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
