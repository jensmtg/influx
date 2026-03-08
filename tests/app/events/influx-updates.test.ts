import { Observable } from '@/platform/events/influx-updates';
import { logger } from '@/platform/diagnostics/logger';

jest.mock('@/platform/diagnostics/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

describe('Observable', () => {
    let observable: Observable<string>;

    beforeEach(() => {
        observable = new Observable<string>();
        jest.clearAllMocks();
    });

    describe('subscription lifecycle', () => {
        test('subscribe registers observers and duplicate ids overwrite existing observer', () => {
            observable.subscribe('a', jest.fn());
            observable.subscribe('b', jest.fn());
            observable.subscribe('a', jest.fn());
            expect(observable.observerCount).toBe(2);
        });

        test('subscribe returns unsubscribe function and unsubscribeAll clears registry', () => {
            const unsubA = observable.subscribe('a', jest.fn());
            observable.subscribe('b', jest.fn());
            unsubA();
            expect(observable.observerCount).toBe(1);

            observable.unsubscribeAll();
            expect(observable.observerCount).toBe(0);
        });
    });

    describe('notification behavior', () => {
        test('notify invokes sync and async observers with the payload', async () => {
            const sync = jest.fn();
            const asyncObserver = jest.fn().mockResolvedValue(undefined);
            observable.subscribe('sync', sync);
            observable.subscribe('async', asyncObserver);

            await observable.notify('payload');

            expect(sync).toHaveBeenCalledWith('payload');
            expect(asyncObserver).toHaveBeenCalledWith('payload');
        });

		test('notify delivers nested re-entrant payloads after the current observer pass', async () => {
			const seen: string[] = [];
			const observer = jest.fn().mockImplementation(async (value: string) => {
				seen.push(value);
				if (value === 'outer') {
					await observable.notify('nested');
				}
			});
			observable.subscribe('o', observer);

			await observable.notify('outer');

			expect(seen).toEqual(['outer', 'nested']);
			expect(observer).toHaveBeenCalledTimes(2);
		});

		test('notify suppresses trivial self-reentrant repeats of the exact in-flight payload', async () => {
			const sharedPayload = { op: 'outer' };
			const objectObservable = new Observable<{ op: string }>();
			const seen: Array<{ op: string }> = [];
			const observer = jest.fn().mockImplementation((value: { op: string }) => {
				seen.push(value);
				void objectObservable.notify(value);
			});
			objectObservable.subscribe('o', observer as unknown as (data: { op: string }) => void);

			await objectObservable.notify(sharedPayload);

			expect(seen).toEqual([sharedPayload]);
			expect(observer).toHaveBeenCalledTimes(1);
		});

        test('notify coalesces concurrent external notifications to the latest payload', async () => {
            const seen: string[] = [];
            let releaseFirst: (() => void) | undefined;
            const gate = new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });

            const observer = jest.fn().mockImplementation(async (value: string) => {
                seen.push(value);
                if (value === 'first') {
                    await gate;
                }
            });
            observable.subscribe('o', observer);

            const firstRun = observable.notify('first');
            await Promise.resolve();
            await observable.notify('second');
            await observable.notify('third');
            releaseFirst?.();
            await firstRun;

            expect(seen).toEqual(['first', 'third']);
        });
    });

    describe('error handling', () => {
        test('continues after synchronous observer failures and logs them', async () => {
            const bad = jest.fn(() => {
                throw new Error('sync fail');
            });
            const good = jest.fn();
            observable.subscribe('bad', bad);
            observable.subscribe('good', good);

            await observable.notify('payload');

            expect(good).toHaveBeenCalledWith('payload');
            expect(logger.error).toHaveBeenCalledWith(
                'Observer failed synchronously',
                expect.objectContaining({ id: 'bad', error: expect.any(Error) })
            );
        });

        test('continues after asynchronous observer failures and logs them', async () => {
            const bad = jest.fn().mockRejectedValue(new Error('async fail'));
            const good = jest.fn();
            observable.subscribe('bad', bad);
            observable.subscribe('good', good);

            await observable.notify('payload');

            expect(good).toHaveBeenCalledWith('payload');
            expect(logger.error).toHaveBeenCalledWith(
                'Observer failed',
                expect.objectContaining({ id: 'bad', error: expect.any(Error) })
            );
        });
    });
});
