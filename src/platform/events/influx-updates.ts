import { logger } from '../diagnostics/logger';
import { TFile } from 'obsidian';

export type Observer<T> = (data: T) => void | Promise<void>;
export type InfluxUpdateOp =
	| 'delete'
	| 'file-open'
	| 'layout-change'
	| 'mode-change'
	| 'modify'
	| 'rename'
	| 'save-settings';

export class Observable<T> {
	private observers = new Map<string, Observer<T>>();
	private isNotifying = false;
	private isInsideObserverCallback = false;
	private pendingData: T | undefined;
	private currentData: T | undefined;

	subscribe(id: string, observer: Observer<T>): () => void {
		this.observers.set(id, observer);

		return () => {
			this.observers.delete(id);
		};
	}

	async notify(data: T): Promise<void> {
		if (this.isNotifying) {
			if (!(this.isInsideObserverCallback && Object.is(data, this.currentData))) {
				this.pendingData = data;
			}
			return;
		}

		this.isNotifying = true;
		try {
			let nextData: T | undefined = data;
			while (nextData !== undefined) {
				this.currentData = nextData;
				this.pendingData = undefined;
				await this.notifyObservers(nextData);
				nextData = this.pendingData;
			}
		} finally {
			this.currentData = undefined;
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
					promises.push(result.catch((error) => {
						logger.error('Observer failed', { id, error });
					}));
				}
			} catch (error) {
				this.isInsideObserverCallback = false;
				logger.error('Observer failed synchronously', { id, error });
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

export interface InfluxUpdateEvent {
	op: InfluxUpdateOp;
	file?: TFile;
}

export const influxUpdates$ = new Observable<InfluxUpdateEvent>();
