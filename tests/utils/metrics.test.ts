import { clearMetrics, recordMetric, summarizeMetrics } from '../../src/utils/metrics';

describe('metrics utilities', () => {
	beforeEach(() => {
		clearMetrics();
	});

	afterEach(() => {
		clearMetrics();
	});

	test('summarizeMetrics should aggregate by metric name and mode', () => {
		const settings = { metricsEnabled: true };
		recordMetric({
			name: 'influx.pipeline.total',
			mode: 'editor',
			durationMs: 100,
			settings,
			ctx: { filePath: 'A.md' },
		});
		recordMetric({
			name: 'influx.pipeline.total',
			mode: 'editor',
			durationMs: 200,
			settings,
			ctx: { filePath: 'B.md' },
		});
		recordMetric({
			name: 'influx.pipeline.total',
			mode: 'preview',
			durationMs: 50,
			settings,
			ctx: { filePath: 'C.md' },
		});

		const summary = summarizeMetrics();
		expect(summary.totalEvents).toBe(3);
		expect(summary.groups).toHaveLength(2);

		const editorGroup = summary.groups.find((group) =>
			group.name === 'influx.pipeline.total' && group.mode === 'editor'
		);
		expect(editorGroup).toBeDefined();
		expect(editorGroup?.count).toBe(2);
		expect(editorGroup?.avgMs).toBe(150);
		expect(editorGroup?.maxMs).toBe(200);
		expect(editorGroup?.p50Ms).toBe(100);
		expect(editorGroup?.p95Ms).toBe(100);
	});

	test('summarizeMetrics should filter by mode and prefix', () => {
		const settings = { metricsEnabled: true };
		recordMetric({
			name: 'influx.pipeline.total',
			mode: 'editor',
			durationMs: 100,
			settings,
		});
		recordMetric({
			name: 'influx.backlinks.fetch',
			mode: 'preview',
			durationMs: 80,
			settings,
		});

		const filtered = summarizeMetrics({ mode: 'editor', namePrefix: 'influx.pipeline' });
		expect(filtered.totalEvents).toBe(1);
		expect(filtered.groups).toHaveLength(1);
		expect(filtered.groups[0].mode).toBe('editor');
		expect(filtered.groups[0].name).toBe('influx.pipeline.total');
	});
});
