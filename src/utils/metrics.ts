import type { ObsidianInfluxSettings } from '../types/settings';

export type MetricMode = 'editor' | 'preview' | 'sidebar' | 'shared';
export type MetricValue = string | number | boolean | undefined;

export interface MetricEvent {
	name: string;
	durationMs: number;
	ts: number;
	mode: MetricMode;
	ctx: Record<string, MetricValue>;
}

export interface MetricAggregate {
	name: string;
	mode: MetricMode;
	count: number;
	totalMs: number;
	avgMs: number;
	p50Ms: number;
	p95Ms: number;
	maxMs: number;
	lastTs: number;
	lastCtx: Record<string, MetricValue>;
}

export interface MetricSummary {
	totalEvents: number;
	groups: MetricAggregate[];
	slowest: MetricEvent[];
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

function quantile(sorted: number[], percentile: number): number {
	if (sorted.length === 0) {
		return 0;
	}
	if (sorted.length === 1) {
		return sorted[0];
	}
	const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((percentile / 100) * (sorted.length - 1))));
	return sorted[index];
}

export function summarizeMetrics(params?: {
	mode?: MetricMode;
	namePrefix?: string;
}): MetricSummary {
	const { mode, namePrefix } = params || {};
	const filtered = metricBuffer.filter((event) => {
		if (mode && event.mode !== mode) {
			return false;
		}
		if (namePrefix && !event.name.startsWith(namePrefix)) {
			return false;
		}
		return true;
	});

	const groupsMap = new Map<string, MetricEvent[]>();
	for (const event of filtered) {
		const key = `${event.name}::${event.mode}`;
		const bucket = groupsMap.get(key);
		if (bucket) {
			bucket.push(event);
		} else {
			groupsMap.set(key, [event]);
		}
	}

	const groups: MetricAggregate[] = Array.from(groupsMap.entries()).map(([key, events]) => {
		const [name, eventMode] = key.split('::') as [string, MetricMode];
		const durations = events.map((event) => event.durationMs).sort((a, b) => a - b);
		const totalMs = durations.reduce((acc, value) => acc + value, 0);
		const lastEvent = events[events.length - 1];
		return {
			name,
			mode: eventMode,
			count: events.length,
			totalMs,
			avgMs: totalMs / events.length,
			p50Ms: quantile(durations, 50),
			p95Ms: quantile(durations, 95),
			maxMs: durations[durations.length - 1],
			lastTs: lastEvent.ts,
			lastCtx: lastEvent.ctx,
		};
	});

	groups.sort((a, b) => b.totalMs - a.totalMs);

	const slowest = [...filtered]
		.sort((a, b) => b.durationMs - a.durationMs)
		.slice(0, 10);

	return {
		totalEvents: filtered.length,
		groups,
		slowest,
	};
}
