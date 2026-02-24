import { CollapsedStateManager } from '@/ui/state/collapsed-state-manager';
import { logger } from '@/platform/diagnostics/logger';

jest.mock('@/platform/diagnostics/logger', () => ({
    logger: {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    },
}));

describe('CollapsedStateManager', () => {
    let manager: CollapsedStateManager;

    beforeEach(() => {
        manager = new CollapsedStateManager();
        (logger.error as jest.Mock).mockClear();
    });

    describe('normalization and initialization', () => {
        test('normalizes path separators and case', () => {
            manager.toggle('Test\\Path\\FILE.md');
            expect(manager.isCollapsed('test/path/file.md')).toBe(true);
            expect(manager.getAllCollapsed()).toEqual(['test/path/file.md']);
        });

        test('constructor deduplicates normalized initial paths', () => {
            const initialized = new CollapsedStateManager(['path1', 'PATH1', 'Path2']);
            expect(initialized.getAllCollapsed()).toEqual(['path1', 'path2']);
        });
    });

    describe('single path toggle', () => {
        test('toggle returns collapse state and flips membership', () => {
            expect(manager.isCollapsed('a.md')).toBe(false);
            expect(manager.toggle('a.md')).toBe(true);
            expect(manager.isCollapsed('a.md')).toBe(true);
            expect(manager.toggle('A.md')).toBe(false);
            expect(manager.isCollapsed('a.md')).toBe(false);
        });
    });

    describe('bulk operations', () => {
        test('collapseAll adds all provided paths', () => {
            manager.collapseAll(['a.md', 'b.md']);
            expect(manager.isCollapsed('a.md')).toBe(true);
            expect(manager.isCollapsed('b.md')).toBe(true);
        });

        test('expandAll clears current collapsed state', () => {
            manager.collapseAll(['a.md', 'b.md']);
            manager.expandAll();
            expect(manager.getAllCollapsed()).toEqual([]);
        });

        test.each([
            [['a.md', 'b.md'], ['a.md', 'b.md'], false],
            [['a.md'], ['a.md', 'b.md'], true],
            [[], ['a.md', 'b.md'], true],
            [[], [], false],
        ])(
            'toggleAll(initial=%p, target=%p) returns %p',
            (initialCollapsed, targetPaths, expectedReturn) => {
                manager.collapseAll(initialCollapsed);
                expect(manager.toggleAll(targetPaths)).toBe(expectedReturn);
            }
        );

        test('toggleAll updates final set according to returned state', () => {
            manager.collapseAll(['a.md']);
            const collapsed = manager.toggleAll(['a.md', 'b.md']);
            expect(collapsed).toBe(true);
            expect(manager.getAllCollapsed()).toEqual(['a.md', 'b.md']);

            const expanded = manager.toggleAll(['a.md', 'b.md']);
            expect(expanded).toBe(false);
            expect(manager.getAllCollapsed()).toEqual([]);
        });
    });

    describe('subscriptions', () => {
        test('subscribe returns an unsubscribe function that stops notifications', () => {
            const listener = jest.fn();
            const unsubscribe = manager.subscribe(listener);

            manager.toggle('a.md');
            unsubscribe();
            manager.toggle('a.md');

            expect(listener).toHaveBeenCalledTimes(1);
        });

        test('notifies all listeners for state updates', () => {
            const a = jest.fn();
            const b = jest.fn();
            manager.subscribe(a);
            manager.subscribe(b);

            manager.collapseAll(['a.md']);
            manager.expandAll();

            expect(a).toHaveBeenCalledTimes(2);
            expect(b).toHaveBeenCalledTimes(2);
        });

        test('continues notifying listeners when one throws and logs the error', () => {
            const bad = jest.fn(() => {
                throw new Error('boom');
            });
            const good = jest.fn();
            manager.subscribe(bad);
            manager.subscribe(good);

            expect(() => manager.toggle('a.md')).not.toThrow();
            expect(good).toHaveBeenCalledTimes(1);
            expect(logger.error).toHaveBeenCalledTimes(1);
        });

        test('handles non-function listener values without throwing', () => {
            manager.subscribe(null as any);
            expect(() => manager.toggle('a.md')).not.toThrow();
            expect(logger.error).toHaveBeenCalledTimes(1);
        });
    });
});
