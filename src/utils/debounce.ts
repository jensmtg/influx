/**
 * Creates a debounced version of a function that delays invoking until wait milliseconds
 * have elapsed since the last time it was invoked.
 *
 * @param func - Function to debounce
 * @param wait - Milliseconds to wait before invoking
 * @returns Debounced function
 */
export type DebouncedFunction<T extends (...args: unknown[]) => unknown> = ((
    ...args: Parameters<T>
) => void) & { cancel: () => void };

export function debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number
): DebouncedFunction<T> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const debounced = (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
    debounced.cancel = () => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
    };
    return debounced;
}
