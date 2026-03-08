import { isInfluxUiPlugin } from '@/ui/influx-ui-plugin';

describe('influx-ui-plugin', () => {
	test('accepts the minimum toolbar plugin shape', () => {
		expect(
			isInfluxUiPlugin({
				data: { settings: {} },
				cycleListLimit: jest.fn(),
				toggleSortOrder: jest.fn(),
				toggleFrontmatterLinks: jest.fn(),
			})
		).toBe(true);
	});

	test('rejects missing toolbar actions', () => {
		expect(
			isInfluxUiPlugin({
				data: { settings: {} },
				cycleListLimit: jest.fn(),
				toggleSortOrder: jest.fn(),
			})
		).toBe(false);
	});
});
