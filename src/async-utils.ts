/** Map items with a fixed worker pool while keeping result order stable. */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (items.length === 0) {
        return [];
    }

    const workerCount = Math.min(
        items.length,
        Math.max(1, Math.floor(concurrency) || 1),
    );
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    let firstError: unknown;
    let failed = false;

    const worker = async () => {
        while (!failed && nextIndex < items.length) {
            const index = nextIndex++;
            try {
                results[index] = await mapper(items[index], index);
            } catch (error) {
                if (!failed) {
                    failed = true;
                    firstError = error;
                }
            }
        }
    };

    await Promise.all(Array.from({ length: workerCount }, worker));
    if (failed) {
        throw firstError;
    }
    return results;
}

/** Limit demand-driven async work without starting a timer or background loop. */
export function createConcurrencyLimiter(concurrency: number) {
    const limit = Math.max(1, Math.floor(concurrency) || 1);
    const queue: Array<{ start: () => void; reject: (reason?: unknown) => void }> = [];
    let active = 0;

    const startNext = () => {
        while (active < limit && queue.length > 0) {
            queue.shift()!.start();
        }
    };

    return {
        run<T>(task: () => Promise<T>): Promise<T> {
            return new Promise<T>((resolve, reject) => {
                queue.push({
                    reject,
                    start: () => {
                        active++;
                        Promise.resolve()
                            .then(task)
                            .then(resolve, reject)
                            .finally(() => {
                                active--;
                                startNext();
                            });
                    },
                });
                startNext();
            });
        },
        cancelQueued(reason: unknown = new Error('Queued work cancelled')): void {
            const queued = queue.splice(0);
            for (const item of queued) {
                item.reject(reason);
            }
        },
    };
}
