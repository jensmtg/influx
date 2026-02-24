import { logger } from '../../platform/diagnostics/logger';
import { TFile } from 'obsidian';

export type Observer<T> = (data: T) => void | Promise<void>;

export class Observable<T> {
	private observers = new Map<string, Observer<T>>();
	private isNotifying = false;
	private isInsideObserverCallback = false;
	private pendingData: T | undefined;

	subscribe(id: string, observer: Observer<T>): () => void {
		this.observers.set(id, observer);

		// Return unsubscribe function
		return () => {
			this.observers.delete(id);
		};
	}

	async notify(data: T): Promise<void> {
		if (this.isNotifying) {
			// Prevent re-entrant notify loops from within observers.
			if (!this.isInsideObserverCallback) {
				// Coalesce to the latest pending payload.
				this.pendingData = data;
			}
			return;
		}

		this.isNotifying = true;
		try {
			let nextData: T | undefined = data;
			while (nextData !== undefined) {
				this.pendingData = undefined;
				await this.notifyObservers(nextData);
				nextData = this.pendingData;
			}
		} finally {
			this.pendingData = undefined;
			this.isInsideObserverCallback = false;
			this.isNotifying = false;
		}
	}

	private async notifyObservers(data: T): Promise<void> {
		const promises: Promise<void>[] = [];

		for (const [id, observer] of this.observers) {
			try {
				this.isInsideObserverCallback = true;
				const result = observer(data);
				this.isInsideObserverCallback = false;
				if (result instanceof Promise) {
					promises.push(result.catch(e => {
						logger.error('Observer failed', { id, error: e });
					}));
				}
			} catch (e) {
				this.isInsideObserverCallback = false;
				logger.error('Observer failed synchronously', { id, error: e });
			}
		}

		await Promise.all(promises);
	}

	unsubscribeAll(): void {
		this.observers.clear();
	}

	get observerCount(): number {
		return this.observers.size;
	}
}

// Typed update events
export interface InfluxUpdateEvent {
	op: string;
	file?: TFile;
}

// Singleton observables
export const influxUpdates$ = new Observable<InfluxUpdateEvent>();

