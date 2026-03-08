export interface InfluxDebugHelpers {
	getReactRoots: () => unknown;
	getCache?: () => unknown;
	getUpdates?: () => unknown;
	getMetrics?: () => unknown;
	summarizeMetrics?: () => unknown;
	snapshot?: () => unknown;
	clearMetrics?: () => void;
}

export interface InfluxWindowGlobals {
	influxPlugin?: unknown;
	influxDebug?: InfluxDebugHelpers;
	testInfluxReadingView?: () => void;
}

export type InfluxWindow = Window & InfluxWindowGlobals;
