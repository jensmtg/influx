/**
 * Creates a debounced version of a function that delays invoking until wait milliseconds
 * have elapsed since the last time it was invoked.
 *
 * @param func - Function to debounce
 * @param wait - Milliseconds to wait before invoking
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
