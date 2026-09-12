import { createConcurrencyLimiter, mapWithConcurrency } from './async-utils';

describe('mapWithConcurrency', () => {
    test('caps concurrent work and keeps input order', async () => {
        let active = 0;
        let peak = 0;

        const result = await mapWithConcurrency([1, 2, 3, 4], 2, async value => {
            active++;
            peak = Math.max(peak, active);
            await new Promise<void>(resolve => queueMicrotask(resolve));
            active--;
            return value * 10;
        });

        expect(result).toEqual([10, 20, 30, 40]);
        expect(peak).toBe(2);
    });

    test('handles empty input without starting workers', async () => {
        const mapper = jest.fn(async (value: number) => value);

        await expect(mapWithConcurrency([], 4, mapper)).resolves.toEqual([]);
        expect(mapper).not.toHaveBeenCalled();
    });

    test('uses at least one worker for invalid limits', async () => {
        await expect(mapWithConcurrency([1, 2], 0, async value => value)).resolves.toEqual([1, 2]);
    });

    test('stops dequeuing after an error and waits for active workers', async () => {
        const started: number[] = [];
        let activeWorkerFinished = false;

        await expect(mapWithConcurrency([1, 2, 3, 4], 2, async value => {
            started.push(value);
            if (value === 2) {
                throw new Error('failed');
            }
            await new Promise<void>(resolve => queueMicrotask(resolve));
            activeWorkerFinished = true;
            return value;
        })).rejects.toThrow('failed');

        expect(started).toEqual([1, 2]);
        expect(activeWorkerFinished).toBe(true);
    });
});

describe('createConcurrencyLimiter', () => {
    test('caps demand-driven work and drains its queue', async () => {
        const limit = createConcurrencyLimiter(2);
        let active = 0;
        let peak = 0;

        const results = await Promise.all([1, 2, 3, 4].map(value => limit.run(async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise<void>(resolve => queueMicrotask(resolve));
            active--;
            return value * 2;
        })));

        expect(results).toEqual([2, 4, 6, 8]);
        expect(peak).toBe(2);
    });

    test('can cancel work that has not started', async () => {
        const limit = createConcurrencyLimiter(1);
        let finishFirst: () => void = () => undefined;
        const first = limit.run(async () => {
            await new Promise<void>(resolve => {
                finishFirst = resolve;
            });
            return 1;
        });
        await Promise.resolve();
        const second = limit.run(async () => 2);
        const secondExpectation = expect(second).rejects.toThrow('stopped');

        limit.cancelQueued(new Error('stopped'));
        finishFirst();

        await expect(first).resolves.toBe(1);
        await secondExpectation;
    });
});
