import type { ObsidianInfluxSettings } from '../types/settings';

type MetricMode = 'editor' | 'preview' | 'sidebar' | 'shared';
type MetricValue = string | number | boolean | undefined;

interface MetricEvent {
	name: string;
	durationMs: number;
	ts: number;
	mode: MetricMode;
	ctx: Record<string, MetricValue>;
}

const METRIC_BUFFER_MAX = 200;
const METRIC_MIN_DURATION_MS = 2;
const metricBuffer: MetricEvent[] = [];

function isMetricsEnabled(settings?: Partial<ObsidianInfluxSettings> | null): boolean {
	return settings?.metricsEnabled === true;
}

export function recordMetric(params: {
	name: string;
	mode: MetricMode;
	durationMs: number;
	ctx?: Record<string, MetricValue>;
	settings?: Partial<ObsidianInfluxSettings> | null;
	always?: boolean;
}): void {
	const { name, mode, durationMs, ctx = {}, settings, always = false } = params;
	if (!isMetricsEnabled(settings)) {
		return;
	}
	if (!always && durationMs < METRIC_MIN_DURATION_MS) {
		return;
	}

	const event: MetricEvent = {
		name,
		durationMs,
		ts: Date.now(),
		mode,
		ctx,
	};

	metricBuffer.push(event);
	if (metricBuffer.length > METRIC_BUFFER_MAX) {
		metricBuffer.shift();
	}

	console.debug(`[Influx] [METRIC] ${name}`, event);
}

export function getMetrics(): MetricEvent[] {
	return [...metricBuffer];
}

export function clearMetrics(): void {
	metricBuffer.length = 0;
}
