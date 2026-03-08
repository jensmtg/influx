import { normalizePath } from 'obsidian';
import { logger } from '../../platform/diagnostics/logger';

export class CollapsedStateManager {
	private collapsedPaths = new Set<string>();
	private listeners = new Set<() => void>();

	constructor(initialPaths: string[] = []) {
		for (const path of initialPaths) {
			this.collapsedPaths.add(this.normalize(path));
		}
	}

	private normalize(path: string): string {
		return normalizePath(path);
	}

	isCollapsed(path: string): boolean {
		return this.collapsedPaths.has(this.normalize(path));
	}

	toggle(path: string): boolean {
		const normalized = this.normalize(path);
		const isNowCollapsed = !this.collapsedPaths.has(normalized);

		if (isNowCollapsed) {
			this.collapsedPaths.add(normalized);
		} else {
			this.collapsedPaths.delete(normalized);
		}

		this.notifyListeners();
		return isNowCollapsed;
	}

	collapseAll(paths: string[]): void {
		for (const path of paths) {
			this.collapsedPaths.add(this.normalize(path));
		}
		this.notifyListeners();
	}

	expandAll(): void {
		this.collapsedPaths.clear();
		this.notifyListeners();
	}

	toggleAll(paths: string[]): boolean {
		const allCollapsed = paths.every(p => this.isCollapsed(p));

		if (allCollapsed) {
			this.expandAll();
			return false; // Now all expanded
		} else {
			this.collapseAll(paths);
			return true; // Now all collapsed
		}
	}

	getAllCollapsed(): string[] {
		return Array.from(this.collapsedPaths);
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notifyListeners(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (e) {
				logger.error('Collapsed state listener failed', { error: e });
			}
		}
	}
}
