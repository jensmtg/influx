import { Root } from 'react-dom/client';
import { logger } from '../utils/logger';

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
	private filePathIndex = new Map<string, HTMLElement>();
	private unloading = false;

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

		// Unmount any existing root for this container
		this.unmount(container);

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
			// Unmount any existing root for this file path
			const existing = this.filePathIndex.get(filePath);
			if (existing && existing !== container) {
				this.unmount(existing);
			}
			this.filePathIndex.set(filePath, container);
		}

		logger.debug('Root registered', { type, filePath, totalRoots: this.roots.size });
	}

	/**
	 * Unregister a root without unmounting (useful for transfers)
	 * Note: This should only be called internally. Use unmount() for cleanup.
	 */
	unregister(container: HTMLElement): void {
		const info = this.roots.get(container);
		if (info) {
			if (info.filePath) {
				this.filePathIndex.delete(info.filePath);
			}
			this.roots.delete(container);
			logger.debug('Root unregistered', { type: info.type, filePath: info.filePath });
		}
	}

	/**
	 * Unmount and unregister a specific root
	 */
	unmount(container: HTMLElement): void {
		const info = this.roots.get(container);
		if (info) {
			try {
				info.root.unmount();
				logger.debug('Root unmounted', { type: info.type, filePath: info.filePath });
			} catch (e) {
				logger.error('Failed to unmount root', { error: e, container });
			}
			this.unregister(container);
		}
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
	unmountByFilePath(filePath: string): void {
		const container = this.filePathIndex.get(filePath);
		if (container) {
			this.unmount(container);
		}
	}

	/**
	 * Clean up roots for containers no longer in DOM
	 */
	cleanupStale(): number {
		let cleaned = 0;

		for (const [container, info] of this.roots) {
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
