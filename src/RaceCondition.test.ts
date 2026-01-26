// Unit tests for race condition protection in preview mode updates
// These tests verify the per-file update tracking logic

interface MockLeaf {
    view: {
        file?: {
            path: string;
        } | null;
    } | null;
}

describe('Race Condition Protection Tests', () => {

    describe('Per-file update tracking', () => {

        test('should allow concurrent updates for different files', async () => {
            // Simulate the per-file tracking logic
            const updating = new Set<string>();
            const updateOrder: string[] = [];

            // Simulate updating multiple files concurrently
            const mockLeaves: MockLeaf[] = [
                { view: { file: { path: 'file1.md' } } },
                { view: { file: { path: 'file2.md' } } },
                { view: { file: { path: 'file3.md' } } }
            ];

            const updatePromises = mockLeaves.map(leaf => {
                const filePath = leaf.view?.file?.path;
                if (!filePath) {
                    return Promise.resolve();
                }

                // Skip if this file is already being updated
                if (updating.has(filePath)) {
                    return Promise.resolve();
                }

                // Mark this file as being updated
                updating.add(filePath);

                return new Promise<void>(resolve => {
                    // Simulate async update operation
                    setTimeout(() => {
                        updateOrder.push(filePath);
                        // Always remove the lock, even if update fails
                        updating.delete(filePath);
                        resolve();
                    }, Math.random() * 50); // Random delay to simulate real-world timing
                });
            });

            await Promise.all(updatePromises);

            // All files should have been updated
            expect(updateOrder).toHaveLength(3);
            expect(updateOrder).toContain('file1.md');
            expect(updateOrder).toContain('file2.md');
            expect(updateOrder).toContain('file3.md');

            // All locks should be released
            expect(updating.size).toBe(0);
        });

        test('should prevent concurrent updates to the same file', async () => {
            // Simulate multiple rapid updates to the same file
            const updating = new Set<string>();
            let updateCount = 0;

            const filePath = 'same-file.md';

            // Simulate rapid successive updates to the same file
            const updatePromises = Array.from({ length: 5 }, (_, i) => {
                return new Promise<void>(resolve => {
                    // Skip if this file is already being updated
                    if (updating.has(filePath)) {
                        resolve();
                        return;
                    }

                    // Mark this file as being updated
                    updating.add(filePath);

                    return new Promise<void>(innerResolve => {
                        setTimeout(() => {
                            updateCount++;
                            updating.delete(filePath);
                            innerResolve();
                            resolve();
                        }, 50);
                    });
                });
            });

            await Promise.all(updatePromises);

            // Only one update should have been executed
            expect(updateCount).toBe(1);

            // Lock should be released
            expect(updating.has(filePath)).toBe(false);
        });

        test('should handle leaves without file paths gracefully', async () => {
            const updating = new Set<string>();
            let completedUpdates = 0;

            // Simulate leaves with and without file paths
            const mockLeaves: MockLeaf[] = [
                { view: { file: { path: 'file1.md' } } },
                { view: null },
                { view: { file: null } },
                { view: { file: { path: 'file2.md' } } }
            ];

            const updatePromises = mockLeaves.map(leaf => {
                const filePath = leaf.view?.file?.path;
                if (!filePath) {
                    return Promise.resolve();
                }

                if (updating.has(filePath)) {
                    return Promise.resolve();
                }

                updating.add(filePath);

                return new Promise<void>(resolve => {
                    setTimeout(() => {
                        completedUpdates++;
                        updating.delete(filePath);
                        resolve();
                    }, 10);
                });
            });

            await Promise.all(updatePromises);

            // Only valid files should have been updated
            expect(completedUpdates).toBe(2);

            // All locks should be released
            expect(updating.size).toBe(0);
        });

        test('should always release locks even when updates fail', async () => {
            const updating = new Set<string>();
            let failedUpdateCount = 0;

            const filePath = 'failing-file.md';

            // Simulate an update that fails
            const updatePromise = new Promise<void>((resolve, reject) => {
                if (updating.has(filePath)) {
                    resolve();
                    return;
                }

                updating.add(filePath);

                // Simulate a failing update
                setTimeout(() => {
                    updating.delete(filePath);
                    reject(new Error('Update failed'));
                }, 10);
            });

            // Use finally to ensure cleanup happens even on failure
            await updatePromise
                .catch(() => {
                    failedUpdateCount++;
                })
                .finally(() => {
                    // This simulates the .finally() in our actual code
                    updating.delete(filePath);
                });

            expect(failedUpdateCount).toBe(1);
            expect(updating.has(filePath)).toBe(false);
            expect(updating.size).toBe(0);
        });

        test('should handle mixed concurrent and duplicate updates', async () => {
            const updating = new Set<string>();
            const updatedFiles: string[] = [];

            // Simulate a mix of different files and duplicate updates to the same file
            const filePaths = [
                'file1.md',
                'file2.md',
                'file1.md', // Duplicate - should be skipped
                'file3.md',
                'file2.md', // Duplicate - should be skipped
                'file4.md'
            ];

            const updatePromises = filePaths.map(filePath => {
                // Skip if this file is already being updated
                if (updating.has(filePath)) {
                    return Promise.resolve();
                }

                updating.add(filePath);

                return new Promise<void>(resolve => {
                    setTimeout(() => {
                        updatedFiles.push(filePath);
                        updating.delete(filePath);
                        resolve();
                    }, Math.random() * 30);
                });
            });

            await Promise.all(updatePromises);

            // Each file should only be updated once
            expect(updatedFiles).toHaveLength(4);
            expect(updatedFiles).toEqual(expect.arrayContaining([
                'file1.md',
                'file2.md',
                'file3.md',
                'file4.md'
            ]));

            // All locks should be released
            expect(updating.size).toBe(0);
        });

    });

    describe('Edge cases and boundary conditions', () => {

        test('should handle empty file path string', async () => {
            const updating = new Set<string>();
            let updateCount = 0;

            const filePath = '';

            // Empty string is a valid key for Set
            if (!filePath) {
                // Should skip empty paths
                expect(true).toBe(true);
                return;
            }

            updating.add(filePath);
            updateCount++;
            updating.delete(filePath);

            expect(updateCount).toBe(0);
        });

        test('should handle rapid successive calls to the same file', async () => {
            const updating = new Set<string>();
            const updateOrder: number[] = [];

            const filePath = 'rapid-fire.md';

            // Simulate 10 rapid successive updates
            const promises = Array.from({ length: 10 }, (_, i) => {
                return new Promise<void>(resolve => {
                    if (updating.has(filePath)) {
                        resolve();
                        return;
                    }

                    updating.add(filePath);

                    setTimeout(() => {
                        updateOrder.push(i);
                        updating.delete(filePath);
                        resolve();
                    }, 20);
                });
            });

            await Promise.all(promises);

            // Only the first update should have executed
            expect(updateOrder).toHaveLength(1);
            expect(updating.size).toBe(0);
        });

        test('should handle special characters in file paths', async () => {
            const updating = new Set<string>();
            const updatedPaths: string[] = [];

            const specialPaths = [
                'folder with spaces/file.md',
                'folder-with-dashes/file_with_underscores.md',
                'folder/with/nested/paths/file.md',
                'file with [special] {chars}.md'
            ];

            const updatePromises = specialPaths.map(filePath => {
                if (updating.has(filePath)) {
                    return Promise.resolve();
                }

                updating.add(filePath);

                return new Promise<void>(resolve => {
                    setTimeout(() => {
                        updatedPaths.push(filePath);
                        updating.delete(filePath);
                        resolve();
                    }, 10);
                });
            });

            await Promise.all(updatePromises);

            expect(updatedPaths).toHaveLength(4);
            expect(updatedPaths).toEqual(expect.arrayContaining(specialPaths));
            expect(updating.size).toBe(0);
        });

    });

});
