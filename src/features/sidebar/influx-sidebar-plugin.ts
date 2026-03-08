import type { ObsidianInfluxSettings } from '../../types';
import type { ApiAdapter } from '../../domain/backlinks/api-adapter';
import type { InfluxUiPlugin } from '../../ui/influx-ui-plugin';

export interface InfluxSidebarPlugin extends InfluxUiPlugin {
	data: { settings: ObsidianInfluxSettings };
	api: ApiAdapter;
}
