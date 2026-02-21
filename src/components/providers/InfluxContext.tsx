import * as React from 'react';
import type { TFile } from 'obsidian';
import type ObsidianInflux from '../../main';
import { ObsidianInfluxSettings, DEFAULT_SETTINGS } from '../../types/settings';

/**
 * Central state management for Influx plugin
 * Consolidates state from multiple sources into a single context
 */

export interface InfluxState {
	// Settings
	settings: ObsidianInfluxSettings;

	// Active file tracking
	activeFilePath: string | null;

	// Collapsed state per file
	collapsedFiles: Set<string>;

	// Search state (per component)
	searchQueries: Map<string, string>;

	// Loading states
	loadingFiles: Set<string>;

	// Update tracking
	lastUpdateId: number;
}

export interface InfluxActions {
	// Settings actions
	updateSettings: (settings: Partial<ObsidianInfluxSettings>) => void;

	// File actions
	setActiveFile: (path: string | null) => void;

	// Collapsed state actions
	toggleCollapsed: (path: string) => void;
	setCollapsed: (path: string, collapsed: boolean) => void;
	toggleAllCollapsed: (paths: string[]) => void;

	// Search actions
	setSearchQuery: (componentId: string, query: string) => void;

	// Loading actions
	setLoading: (path: string, loading: boolean) => void;

	// Update actions
	incrementUpdateId: () => void;
}

const initialState: InfluxState = {
	settings: DEFAULT_SETTINGS,
	activeFilePath: null,
	collapsedFiles: new Set(),
	searchQueries: new Map(),
	loadingFiles: new Set(),
	lastUpdateId: 0,
};

export interface InfluxContextValue {
	state: InfluxState;
	dispatch: React.Dispatch<InfluxAction>;
	actions: InfluxActions;
}

type InfluxAction =
	| { type: 'UPDATE_SETTINGS'; settings: Partial<ObsidianInfluxSettings> }
	| { type: 'SET_ACTIVE_FILE'; path: string | null }
	| { type: 'TOGGLE_COLLAPSED'; path: string }
	| { type: 'SET_COLLAPSED'; path: string; collapsed: boolean }
	| { type: 'TOGGLE_ALL_COLLAPSED'; paths: string[] }
	| { type: 'SET_SEARCH_QUERY'; componentId: string; query: string }
	| { type: 'SET_LOADING'; path: string; loading: boolean }
	| { type: 'INCREMENT_UPDATE_ID' };

function reducer(state: InfluxState, action: InfluxAction): InfluxState {
	switch (action.type) {
		case 'UPDATE_SETTINGS':
			return {
				...state,
				settings: { ...state.settings, ...action.settings }
			};

		case 'SET_ACTIVE_FILE':
			return {
				...state,
				activeFilePath: action.path
			};

		case 'TOGGLE_COLLAPSED': {
			const newCollapsed = new Set(state.collapsedFiles);
			const normalizedPath = action.path.toLowerCase();
			if (newCollapsed.has(normalizedPath)) {
				newCollapsed.delete(normalizedPath);
			} else {
				newCollapsed.add(normalizedPath);
			}
			return {
				...state,
				collapsedFiles: newCollapsed
			};
		}

		case 'SET_COLLAPSED': {
			const newCollapsed = new Set(state.collapsedFiles);
			const normalizedPath = action.path.toLowerCase();
			if (action.collapsed) {
				newCollapsed.add(normalizedPath);
			} else {
				newCollapsed.delete(normalizedPath);
			}
			return {
				...state,
				collapsedFiles: newCollapsed
			};
		}

		case 'TOGGLE_ALL_COLLAPSED': {
			const allCollapsed = action.paths.every(p =>
				state.collapsedFiles.has(p.toLowerCase())
			);
			const newCollapsed = allCollapsed
				? new Set<string>()
				: new Set(action.paths.map(p => p.toLowerCase()));
			return {
				...state,
				collapsedFiles: newCollapsed
			};
		}

		case 'SET_SEARCH_QUERY': {
			const newSearchQueries = new Map(state.searchQueries);
			if (action.query) {
				newSearchQueries.set(action.componentId, action.query);
			} else {
				newSearchQueries.delete(action.componentId);
			}
			return {
				...state,
				searchQueries: newSearchQueries
			};
		}

		case 'SET_LOADING': {
			const newLoadingFiles = new Set(state.loadingFiles);
			if (action.loading) {
				newLoadingFiles.add(action.path);
			} else {
				newLoadingFiles.delete(action.path);
			}
			return {
				...state,
				loadingFiles: newLoadingFiles
			};
		}

		case 'INCREMENT_UPDATE_ID':
			return {
				...state,
				lastUpdateId: state.lastUpdateId + 1
			};

		default:
			return state;
	}
}

const InfluxContext = React.createContext<InfluxContextValue | undefined>(undefined);

export function InfluxProvider({ children, plugin }: { children: React.ReactNode; plugin: ObsidianInflux }) {
	const [state, dispatch] = React.useReducer(reducer, initialState);

	// Initialize settings from plugin
	React.useEffect(() => {
		if (plugin.data?.settings) {
			dispatch({ type: 'UPDATE_SETTINGS', settings: plugin.data.settings });
		}
	}, [plugin]);

	const value = React.useMemo(() => {
		const actions: InfluxActions = {
			updateSettings: (settings) => dispatch({ type: 'UPDATE_SETTINGS', settings }),
			setActiveFile: (path) => dispatch({ type: 'SET_ACTIVE_FILE', path }),
			toggleCollapsed: (path) => dispatch({ type: 'TOGGLE_COLLAPSED', path }),
			setCollapsed: (path, collapsed) => dispatch({ type: 'SET_COLLAPSED', path, collapsed }),
			toggleAllCollapsed: (paths) => dispatch({ type: 'TOGGLE_ALL_COLLAPSED', paths }),
			setSearchQuery: (componentId, query) => dispatch({ type: 'SET_SEARCH_QUERY', componentId, query }),
			setLoading: (path, loading) => dispatch({ type: 'SET_LOADING', path, loading }),
			incrementUpdateId: () => dispatch({ type: 'INCREMENT_UPDATE_ID' }),
		};

		return { state, dispatch, actions };
	}, [state]);

	return (
		<InfluxContext.Provider value={value}>
			{children}
		</InfluxContext.Provider>
	);
}

export function useInfluxState(): InfluxContextValue {
	const context = React.useContext(InfluxContext);
	if (!context) {
		throw new Error('useInfluxState must be used within InfluxProvider');
	}
	return context;
}

export function useInfluxActions(): InfluxActions {
	const context = React.useContext(InfluxContext);
	if (!context) {
		throw new Error('useInfluxActions must be used within InfluxProvider');
	}
	return context.actions;
}
