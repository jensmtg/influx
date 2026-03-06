import { Root } from 'react-dom/client';
import { logger } from '../diagnostics/logger';

export type RootType = 'preview' | 'editor' | 'sidebar';

export interface RootInfo {
	root: Root;
	container: HTMLElement;
	type: RootType;
	filePath?: string;
	createdAt: number;
	metadata?: Record<string, unknown>;
}

export class RootManager {
	private roots = new Map<HTMLElement, RootInfo>();
	private filePathIndex = new Map<string, Set<HTMLElement>>();
	private unloading = false;

	private scheduleRootUnmount(root: Root, metadata?: Record<string, unknown>): void {
		logger.debug('Scheduling deferred root unmount', metadata);
		setTimeout(() => {
			try {
				root.unmount();
				logger.debug('Deferred root unmounted', metadata);
			} catch (e) {
				logger.error('Failed to unmount root', { error: e, metadata });
			}
		}, 0);
	}

	private getAndUnregister(container: HTMLElement): RootInfo | undefined {
		const info = this.roots.get(container);
		if (!info) {
			return undefined;
		}
		this.unregister(container);
		return info;
	}

	/**
	 * Register a new React root
	 */
	register(
		container: HTMLElement,
		root: Root,
		type: RootType,
		filePath?: string,
		metadata?: Record<string, unknown>
	): void {
		if (this.unloading) {
			logger.warn('Attempted to register root during unload', { type, filePath });
			root.unmount();
			return;
		}

		// Replace any existing root for this container.
		// Defer unmount to avoid React warning about synchronous unmount while rendering.
		const existing = this.roots.get(container);
		if (existing) {
			this.unregister(container);
			logger.debug('Replacing existing root registration', {
				type: existing.type,
				filePath: existing.filePath,
			});
			this.scheduleRootUnmount(existing.root, {
				reason: 'register-replace',
				type: existing.type,
				filePath: existing.filePath,
			});
		}

		const info: RootInfo = {
			root,
			container,
			type,
			filePath,
			createdAt: Date.now(),
			metadata
		};

		this.roots.set(container, info);

		if (filePath) {
			const containers = this.filePathIndex.get(filePath) ?? new Set<HTMLElement>();
			containers.add(container);
			this.filePathIndex.set(filePath, containers);
		}
	}

	/**
	 * Unregister a root without unmounting (useful for transfers)
	 * Note: This should only be called internally. Use unmount() for cleanup.
	 */
	unregister(container: HTMLElement): void {
		const info = this.roots.get(container);
		if (info) {
			if (info.filePath) {
				const containers = this.filePathIndex.get(info.filePath);
				if (containers) {
					containers.delete(container);
					if (containers.size === 0) {
						this.filePathIndex.delete(info.filePath);
					}
				}
			}
			this.roots.delete(container);
		}
	}

	/**
	 * Unmount and unregister a specific root
	 */
	unmount(container: HTMLElement): void {
		const info = this.getAndUnregister(container);
		if (info) {
			logger.debug('Unmounting root synchronously', {
				type: info.type,
				filePath: info.filePath,
			});
			try {
				info.root.unmount();
			} catch (e) {
				logger.error('Failed to unmount root', { error: e, container });
			}
		}
	}

	/**
	 * Unmount asynchronously to avoid React sync-unmount warnings
	 * when called from render-driven cleanup paths.
	 */
	unmountDeferred(container: HTMLElement): void {
		const info = this.getAndUnregister(container);
		if (!info) {
			return;
		}
		logger.debug('Unmounting root asynchronously', {
			type: info.type,
			filePath: info.filePath,
		});
		this.scheduleRootUnmount(info.root, {
			reason: 'deferred-unmount',
			type: info.type,
			filePath: info.filePath,
		});
	}

	/**
	 * Unmount all roots (call during plugin unload)
	 */
	unmountAll(): void {
		this.unloading = true;
		logger.info('Unmounting all roots', { count: this.roots.size });

		for (const [, info] of this.roots) {
			try {
				info.root.unmount();
			} catch (e) {
				logger.error('Failed to unmount root during cleanup', { error: e });
			}
		}

		this.roots.clear();
		this.filePathIndex.clear();
		this.unloading = false;
	}

	/**
	 * Unmount all roots for a specific file path
	 */
	unmountByFilePath(filePath: string, type?: RootType): void {
		const containers = this.filePathIndex.get(filePath);
		if (!containers || containers.size === 0) {
			return;
		}

		const targets = Array.from(containers);
		for (const container of targets) {
			if (type) {
				const info = this.roots.get(container);
				if (!info || info.type !== type) {
					continue;
				}
			}
			this.unmount(container);
		}
	}

	/**
	 * Unmount all roots of a specific type.
	 */
	unmountByType(type: RootType): void {
		const targets: HTMLElement[] = [];
		for (const [container, info] of this.roots) {
			if (info.type === type) {
				targets.push(container);
			}
		}

		for (const container of targets) {
			this.unmount(container);
		}
	}

	/**
	 * Clean up roots for containers no longer in DOM
	 */
	cleanupStale(): number {
		let cleaned = 0;

		for (const [container, info] of this.roots) {
			// Editor widget roots can be temporarily detached by CM6 viewport virtualization.
			// Let widget lifecycle manage those to avoid churn while scrolling long notes.
			if (info.type === 'editor') {
				continue;
			}
			if (!document.body.contains(container)) {
				this.unmount(container);
				cleaned++;
			}
		}

		if (cleaned > 0) {
			logger.info('Cleaned up stale roots', { count: cleaned });
		}

		return cleaned;
	}

	/**
	 * Get root info for a container
	 */
	get(container: HTMLElement): RootInfo | undefined {
		return this.roots.get(container);
	}

	/**
	 * Check if a root exists for a container
	 */
	has(container: HTMLElement): boolean {
		return this.roots.has(container);
	}

	/**
	 * Get count of tracked roots
	 */
	get size(): number {
		return this.roots.size;
	}

	/**
	 * Get all root info (for debugging)
	 */
	getDebugInfo(): Array<{ container: HTMLElement; inDom: boolean; info: RootInfo }> {
		return Array.from(this.roots.entries()).map(([container, info]) => ({
			container,
			inDom: document.body.contains(container),
			info
		}));
	}
}

// Singleton instance
export const rootManager = new RootManager();
