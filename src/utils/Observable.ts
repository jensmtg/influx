import { logger } from './logger';
import { TFile } from 'obsidian';

export type Observer<T> = (data: T) => void | Promise<void>;

export class Observable<T> {
	private observers = new Map<string, Observer<T>>();
	private isNotifying = false;

	subscribe(id: string, observer: Observer<T>): () => void {
		this.observers.set(id, observer);

		// Return unsubscribe function
		return () => {
			this.observers.delete(id);
		};
	}

	async notify(data: T): Promise<void> {
		if (this.isNotifying) {
			return;
		}

		this.isNotifying = true;
		try {
			await this.notifyObservers(data);
		} finally {
			this.isNotifying = false;
		}
	}

	private async notifyObservers(data: T): Promise<void> {
		const promises: Promise<void>[] = [];

		for (const [id, observer] of this.observers) {
			try {
				const result = observer(data);
				if (result instanceof Promise) {
					promises.push(result.catch(e => {
						logger.error('Observer failed', { id, error: e });
					}));
				}
			} catch (e) {
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

