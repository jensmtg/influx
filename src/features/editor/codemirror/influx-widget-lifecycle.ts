import { CONSTANTS } from '../../../config/constants';

function defineInfluxElement(tagName: string): void {
	if (typeof customElements === 'undefined') {
		return;
	}

	if (customElements.get(tagName)) {
		return;
	}

	customElements.define(tagName, class extends HTMLElement {
		disconnectedCallback() {
			this.dispatchEvent(new CustomEvent('disconnected'));
		}
	});
}

export function ensureInfluxElementsDefined(): void {
	defineInfluxElement(CONSTANTS.INFLUX_ELEMENT_TAG);
	defineInfluxElement(CONSTANTS.INFLUX_ELEMENT_TAG_LEGACY);
}

export class InfluxWidgetHeightCache {
	private static readonly DEFAULT_ESTIMATED_HEIGHT_PX = 320;
	private static readonly MAX_HEIGHT_CACHE_SIZE = 500;
	private static measuredHeights = new Map<string, number>();

	static getEstimatedHeight(cacheKey: string | null): number {
		if (!cacheKey) {
			return InfluxWidgetHeightCache.DEFAULT_ESTIMATED_HEIGHT_PX;
		}
		const cached = InfluxWidgetHeightCache.measuredHeights.get(cacheKey);
		if (typeof cached === 'number' && cached > 0) {
			return cached;
		}
		return InfluxWidgetHeightCache.DEFAULT_ESTIMATED_HEIGHT_PX;
	}

	static persist(cacheKey: string | null, container: HTMLElement | null, explicitHeight?: number): void {
		if (!cacheKey || !container) {
			return;
		}
		const measured = Math.ceil(explicitHeight ?? container.offsetHeight);
		if (!Number.isFinite(measured) || measured <= 0) {
			return;
		}

		InfluxWidgetHeightCache.measuredHeights.set(cacheKey, measured);
		if (InfluxWidgetHeightCache.measuredHeights.size > InfluxWidgetHeightCache.MAX_HEIGHT_CACHE_SIZE) {
			const oldestKey = InfluxWidgetHeightCache.measuredHeights.keys().next().value as string | undefined;
			if (oldestKey) {
				InfluxWidgetHeightCache.measuredHeights.delete(oldestKey);
			}
		}
	}
}

export class InfluxWidgetDomLifecycle {
	private disconnectedHandler: (() => void) | null = null;
	private disconnectCallback: (() => void) | null = null;
	private currentContainer: HTMLElement | null = null;
	private currentDOMContainer: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

	attachContainer(container: HTMLElement, onDisconnect: () => void): void {
		this.clearDisconnectTimer();
		if (this.currentDOMContainer && this.disconnectedHandler) {
			this.currentDOMContainer.removeEventListener('disconnected', this.disconnectedHandler);
		}

		const deferredDisconnectHandler = () => {
			this.clearDisconnectTimer();
			this.disconnectTimer = setTimeout(() => {
				this.disconnectTimer = null;
				if (!container.isConnected) {
					onDisconnect();
				}
			}, 0);
		};

		container.addEventListener('disconnected', deferredDisconnectHandler);
		this.disconnectedHandler = deferredDisconnectHandler;
		this.disconnectCallback = onDisconnect;
		this.currentDOMContainer = container;
		this.currentContainer = container;
	}

	observeHeight(container: HTMLElement, onMeasure: (height?: number) => void): void {
		if (typeof ResizeObserver === 'undefined') {
			onMeasure();
			return;
		}

		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		}

		this.resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) {
				return;
			}
			onMeasure(entry.contentRect.height);
		});
		this.resizeObserver.observe(container);
	}

	stopObserving(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	cleanup(onPersistHeight: (container: HTMLElement | null) => void): void {
		onPersistHeight(this.currentContainer);
		this.stopObserving();
		this.clearDisconnectTimer();
		if (this.currentDOMContainer && this.disconnectedHandler) {
			this.currentDOMContainer.removeEventListener('disconnected', this.disconnectedHandler);
		}
		if (this.disconnectCallback) {
			this.disconnectCallback();
		}
		this.disconnectedHandler = null;
		this.disconnectCallback = null;
		this.currentContainer = null;
		this.currentDOMContainer = null;
	}

	private clearDisconnectTimer(): void {
		if (this.disconnectTimer) {
			clearTimeout(this.disconnectTimer);
			this.disconnectTimer = null;
		}
	}

	setDisconnectedHandlerForTests(handler: (() => void) | null): void {
		this.disconnectedHandler = handler;
	}

	getDisconnectedHandlerForTests(): (() => void) | null {
		return this.disconnectedHandler;
	}

	setCurrentContainerForTests(container: HTMLElement | null): void {
		this.currentContainer = container;
	}

	getCurrentContainerForTests(): HTMLElement | null {
		return this.currentContainer;
	}

	setCurrentDOMContainerForTests(container: HTMLElement | null): void {
		this.currentDOMContainer = container;
	}

	getCurrentDOMContainerForTests(): HTMLElement | null {
		return this.currentDOMContainer;
	}

	setResizeObserverForTests(observer: ResizeObserver | null): void {
		this.resizeObserver = observer;
	}

	getResizeObserverForTests(): ResizeObserver | null {
		return this.resizeObserver;
	}
}
