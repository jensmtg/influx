import { InfluxSidebarView } from '@/features/sidebar/influx-sidebar-view';
import { mockTFile } from '../../mocks';
import InfluxFile from '@/domain/backlinks/influx-file';

jest.mock('react-dom/client', () => ({
	createRoot: jest.fn(() => ({
		render: jest.fn(),
		unmount: jest.fn(),
	})),
}));

jest.mock('@/domain/backlinks/influx-file', () => ({
	__esModule: true,
	default: {
		create: jest.fn(),
	},
}));

jest.mock('@/platform/diagnostics/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

describe('InfluxSidebarView', () => {
	const createContext = () => {
		const fileA = mockTFile('A.md', 'A');
		const fileB = mockTFile('B.md', 'B');

		const plugin = {
			data: {
				settings: {
					liveUpdate: true,
				},
			},
			api: {
				getShowStatus: jest.fn().mockReturnValue(true),
				invalidateFileCache: jest.fn(),
			},
		};

		const leaf = {};
		const view = new InfluxSidebarView(leaf as any, plugin as any);
		(view as any).root = {
			render: jest.fn(),
			unmount: jest.fn(),
		};

		return {
			view,
			plugin,
			fileA,
			fileB,
		};
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	test('updateView short-circuits when file is unchanged', async () => {
		const { view, fileA } = createContext();
		(view as any).currentFile = fileA;

		await view.updateView(fileA);

		expect((InfluxFile as any).create).not.toHaveBeenCalled();
	});

	test('updateView cancels previous request and renders null when file should not show', async () => {
		const { view, fileA, fileB } = createContext();
		const abort = jest.fn();
		(view as any).abortController = { abort, signal: { aborted: false } };

		(InfluxFile as any).create.mockResolvedValue({
			show: false,
			makeInfluxList: jest.fn(),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		});

		await view.updateView(fileA);

		expect(abort).toHaveBeenCalledTimes(1);
		expect((view as any).currentFile).toBe(fileA);
		expect((view as any).root.render).toHaveBeenCalledWith(null);

		await view.updateView(fileB);
		expect((InfluxFile as any).create).toHaveBeenCalledWith('B.md', (view as any).plugin.api);
	});

	test('handleEditorChange clears sidebar render when current file should be hidden', async () => {
		const { view, plugin, fileA } = createContext();
		(plugin.api.getShowStatus as jest.Mock).mockReturnValue(false);
		(view as any).currentFile = fileA;
		(view as any).influxFile = {
			show: true,
			makeInfluxList: jest.fn(),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		};

		await (view as any).handleEditorChange();

		expect(plugin.api.invalidateFileCache).not.toHaveBeenCalled();
		expect((view as any).root.render).toHaveBeenCalledWith(null);
	});
});
