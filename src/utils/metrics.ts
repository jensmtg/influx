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

function hashString(value: string): string {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash << 5) - hash + value.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash).toString(36);
}

function shouldAnonymizeKey(key: string): boolean {
	const keyLower = key.toLowerCase();
	return keyLower.includes('path') || keyLower.includes('file');
}

function normalizeMetricValue(key: string, value: MetricValue): string | number | boolean {
	if (typeof value === 'string' && shouldAnonymizeKey(key)) {
		return `note_${hashString(value)}`;
	}
	return value as string | number | boolean;
}

function normalizeContext(ctx: Record<string, MetricValue>): Record<string, string | number | boolean> {
	const normalized: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(ctx)) {
		if (value !== undefined) {
			normalized[key] = normalizeMetricValue(key, value);
		}
	}
	return normalized;
}

function formatContextForLog(ctx: Record<string, string | number | boolean>): string {
	const entries = Object.entries(ctx);
	if (entries.length === 0) {
		return 'ctx=none';
	}
	return entries.map(([key, value]) => `${key}=${String(value)}`).join(' ');
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
	const normalizedCtx = normalizeContext(ctx);

	const event: MetricEvent = {
		name,
		durationMs,
		ts: Date.now(),
		mode,
		ctx: normalizedCtx,
	};

	metricBuffer.push(event);
	if (metricBuffer.length > METRIC_BUFFER_MAX) {
		metricBuffer.shift();
	}

	const ctxSummary = formatContextForLog(normalizedCtx);
	console.debug(
		`[Influx] [METRIC] ${name} mode=${mode} durationMs=${durationMs.toFixed(1)} ${ctxSummary}`
	);
}

export function getMetrics(): MetricEvent[] {
	return [...metricBuffer];
}

export function clearMetrics(): void {
	metricBuffer.length = 0;
}
