import { logger } from './logger';
import { StyleSheetType } from '../createStyleSheet';
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
			// Prevent re-entrancy
			return;
		}

		this.isNotifying = true;

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
		this.isNotifying = false;
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
	stylesheet: StyleSheetType;
	file?: TFile;
}

// Singleton observables
export const influxUpdates$ = new Observable<InfluxUpdateEvent>();
