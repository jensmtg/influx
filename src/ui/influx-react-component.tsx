import * as React from 'react';
import InfluxFile from '../domain/backlinks/influx-file';
import type { ExtendedInlinkingFile } from '../domain/backlinks/types';
import { ObsidianInfluxSettings } from '../types';
import { influxUpdates$, InfluxUpdateEvent } from '../platform/events/influx-updates';
import { CollapsedStateManager } from './state/collapsed-state-manager';
import { InfluxErrorBoundary } from './influx-error-boundary';
import { debounce } from '../shared/async/debounce';
import { recordMetric } from '../platform/diagnostics/metrics';
import type { InfluxUiPlugin } from './influx-ui-plugin';
import { attachInfluxLinkInteractions } from '../platform/obsidian/link-interactions';
import {
	collectBasenameCounts,
	collectComponentPaths,
	areAllComponentPathsCollapsed,
	collectInitialCollapsedPaths,
	createInitialSearchUiState,
	filterComponentsBySearch,
	getNextVisibleCount,
	getEmptyBacklinksMessage,
	getLoadMoreBacklinksLabel,
	getLinkedMentionsCountLabel,
	getLinkedMentionsCountTooltip,
	getNoSearchResultsMessage,
	handleSearchChangeInput,
	handleSearchKeyPress,
	INITIAL_VISIBLE_COMPONENTS_BY_MODE,
	type InfluxRenderMode,
	reduceSearchUiState,
	resetSearchUi,
	shouldAttachAutoLoadObserver,
	shouldLoadMoreFromObserver,
	toggleSearchPanel,
	VISIBLE_COMPONENTS_CHUNK_BY_MODE,
} from './influx-react-component-helpers';
import { resolveInfluxUpdateEntries } from './influx-update-helpers';
import {
	getCenteredTitleStyle,
	InfluxResultGroup,
	InfluxSummaryRow,
	InfluxToolbar,
} from './influx-react-component-parts';

interface InfluxReactComponentProps { influxFile: InfluxFile, preview: boolean, plugin: InfluxUiPlugin }

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_FOCUS_DELAY_MS = 100;

export default function InfluxReactComponent(props: InfluxReactComponentProps): React.ReactElement | null {

	const {
		influxFile,
		preview = false,
		plugin,
	} = props;

	const [components, setComponents] = React.useState(influxFile.components);
	const [searchUi, dispatchSearchUi] = React.useReducer(reduceSearchUiState, undefined, createInitialSearchUiState);
	const { inputValue, searchQuery, isSearchExpanded, isSearchFocused } = searchUi;
	const [collapsedManager] = React.useState(() => {
		return new CollapsedStateManager(
			collectInitialCollapsedPaths({
				collapsed: influxFile.collapsed,
				components: influxFile.components,
			})
		);
	});
	const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
	const searchInputRef = React.useRef<HTMLInputElement>(null);
	const searchResultsContainerRef = React.useRef<HTMLDivElement>(null);
	const loadMoreTriggerRef = React.useRef<HTMLDivElement>(null);
	const rootRef = React.useRef<HTMLDivElement>(null);
	const searchFocusTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const updateSeqRef = React.useRef(0);

	React.useEffect(() => {
		setComponents(influxFile.components);
	}, [influxFile.components]);

	React.useEffect(() => {
		return collapsedManager.subscribe(forceUpdate);
	}, [collapsedManager]);

	const doToggle = (path: string) => {
		collapsedManager.toggle(path);
	};
	const basenameCounts = React.useMemo(() => collectBasenameCounts(components), [components]);
	const componentPaths = React.useMemo(() => collectComponentPaths(components), [components]);
	const allVisibleComponentsCollapsed = areAllComponentPathsCollapsed(
		componentPaths,
		(path) => collapsedManager.isCollapsed(path)
	);

	const toggleAll = () => {
		collapsedManager.toggleAll(componentPaths);
	};

	const influxFileRef = React.useRef(influxFile);
	influxFileRef.current = influxFile;
	const settings: Partial<ObsidianInfluxSettings> = influxFile.api.getSettings();
	const targetFilePath = influxFile.file?.path ?? 'unknown';
	const renderMode: InfluxRenderMode = settings.showInfluxInSidebar ? 'sidebar' : preview ? 'preview' : 'editor';
	const isEditorMode = renderMode === 'editor';
	const showToolbarSummary = renderMode === 'editor' || renderMode === 'preview';
	const autoLoadByObserver = renderMode !== 'editor';

	React.useEffect(() => {
		const container = rootRef.current;
		if (!container) {
			return;
		}

		return attachInfluxLinkInteractions({
			container,
			plugin,
			renderMode,
			fallbackSourcePath: targetFilePath,
		});
	}, [plugin, renderMode, targetFilePath]);

	const filteredComponents = React.useMemo(() => {
		const startTime = performance.now();
		const filtered = filterComponentsBySearch(components, searchQuery);
		recordMetric({
			name: 'influx.ui.filter',
			mode: renderMode,
			durationMs: performance.now() - startTime,
			settings,
				ctx: {
					filePath: targetFilePath,
					componentCount: components.length,
					filteredCount: filtered.length,
					queryLength: searchQuery.length,
				}
			});
			return filtered;
	}, [components, searchQuery, renderMode, settings, targetFilePath]);
	const [visibleCount, setVisibleCount] = React.useState(INITIAL_VISIBLE_COMPONENTS_BY_MODE[renderMode]);
	const visibleComponents = React.useMemo(
		() => filteredComponents.slice(0, visibleCount),
		[filteredComponents, visibleCount]
	);
	const hasMoreVisible = visibleCount < filteredComponents.length;

	const loadMoreComponents = React.useCallback((trigger: 'observer' | 'button') => {
		setVisibleCount((count) => {
			const nextVisibleCount = getNextVisibleCount({
				currentVisibleCount: count,
				chunkSize: VISIBLE_COMPONENTS_CHUNK_BY_MODE[renderMode],
				totalFilteredCount: filteredComponents.length,
			});
			if (nextVisibleCount !== count) {
				recordMetric({
					name: 'influx.ui.virtualize.append',
					mode: renderMode,
					durationMs: 0,
					settings,
					always: true,
					ctx: {
						filePath: targetFilePath,
						prevVisibleCount: count,
						nextVisibleCount,
						totalFilteredCount: filteredComponents.length,
						trigger,
					}
				});
			}
			return nextVisibleCount;
		});
	}, [filteredComponents.length, renderMode, settings, targetFilePath]);

	React.useEffect(() => {
		setVisibleCount(Math.min(INITIAL_VISIBLE_COMPONENTS_BY_MODE[renderMode], filteredComponents.length));
	}, [filteredComponents, renderMode]);

	React.useEffect(() => {
		const trigger = loadMoreTriggerRef.current;
		if (!shouldAttachAutoLoadObserver({
			autoLoadByObserver,
			hasMoreVisible,
			hasIntersectionObserver: typeof IntersectionObserver !== 'undefined',
			hasTrigger: trigger !== null,
		})) {
			return;
		}
		if (!trigger) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (shouldLoadMoreFromObserver(entries)) {
					loadMoreComponents('observer');
				}
			},
			{
				root: searchResultsContainerRef.current,
				rootMargin: '200px',
			}
		);
		observer.observe(trigger);
		return () => observer.disconnect();
		}, [autoLoadByObserver, hasMoreVisible, loadMoreComponents, visibleCount]);

	const debouncedSetSearchQuery = React.useMemo(
		() => debounce((value: string) => {
			dispatchSearchUi({ type: 'QUERY_COMMITTED', value });
		}, SEARCH_DEBOUNCE_MS),
		[]
	);

	React.useEffect(() => {
		return () => {
			debouncedSetSearchQuery.cancel();
		};
	}, [debouncedSetSearchQuery]);

	const clearSearchFocusTimeout = React.useCallback(() => {
		if (searchFocusTimeoutRef.current !== null) {
			clearTimeout(searchFocusTimeoutRef.current);
			searchFocusTimeoutRef.current = null;
		}
	}, []);

	React.useEffect(() => clearSearchFocusTimeout, [clearSearchFocusTimeout]);

	const handleSearchChange = (value: string) => {
		handleSearchChangeInput({
			value,
			dispatch: dispatchSearchUi,
			commitDebouncedQuery: debouncedSetSearchQuery,
		});
	};

	const resetSearch = (closePanel: boolean) => {
		clearSearchFocusTimeout();
		resetSearchUi({
			closePanel,
			dispatch: dispatchSearchUi,
			cancelDebouncedQuery: debouncedSetSearchQuery.cancel,
		});
	};

	const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		handleSearchKeyPress({ key: e.key, resetSearch });
	};

	const toggleSearch = () => {
		toggleSearchPanel({
			isSearchExpanded,
			dispatch: dispatchSearchUi,
			cancelScheduledFocus: clearSearchFocusTimeout,
			scheduleFocus: (callback, delayMs) => {
				searchFocusTimeoutRef.current = setTimeout(() => {
					searchFocusTimeoutRef.current = null;
					callback();
				}, delayMs);
			},
			focusDelayMs: SEARCH_FOCUS_DELAY_MS,
			focusSearchInput: () => searchInputRef.current?.focus(),
		});
	};

	React.useEffect(() => {
		const abortController = new AbortController();

		const handleUpdate = async (event: InfluxUpdateEvent) => {
			const seq = ++updateSeqRef.current;
			const current = influxFileRef.current;
			const newComponents = await resolveInfluxUpdateEntries({
				event,
				current,
				seq,
				getLatestSeq: () => updateSeqRef.current,
				isAborted: () => abortController.signal.aborted,
			});
			if (!newComponents) {
				return;
			}
			setComponents(newComponents);
		};

		const unsubscribe = influxUpdates$.subscribe(influxFile.uuid, handleUpdate);

		return () => {
			abortController.abort();
			unsubscribe();
		};
	}, [influxFile.uuid]);

	const shownLength = components.length || 0;

	const centered = settings.variant !== 'ROWS';
	const fontSize = settings.fontSize || 13;
	const lineHeight = fontSize * 1.5;
	const centeredTitleStyle = getCenteredTitleStyle({ centered, renderMode });
	const mentionsCountLabel = getLinkedMentionsCountLabel({
		totalEntryCount: influxFile.totalEntryCount ?? 0,
		listLimit: settings.listLimit || 0,
		renderedCount: components.length,
		filteredCount: filteredComponents.length,
		hasSearch: searchQuery.length > 0,
	});
	const mentionsCountTooltip = getLinkedMentionsCountTooltip({
		totalEntryCount: influxFile.totalEntryCount ?? 0,
		listLimit: settings.listLimit || 0,
		renderedCount: components.length,
		filteredCount: filteredComponents.length,
		hasSearch: searchQuery.length > 0,
	});
	const loadMoreButtonLabel = getLoadMoreBacklinksLabel({
		visibleCount,
		totalFilteredCount: filteredComponents.length,
		chunkSize: VISIBLE_COMPONENTS_CHUNK_BY_MODE[renderMode],
	});
	const emptyBacklinksMessage = getEmptyBacklinksMessage({
		totalEntryCount: influxFile.totalEntryCount ?? 0,
		renderedCount: components.length,
	});
	const summaryRowLabel = allVisibleComponentsCollapsed ? 'Expand all linked mentions' : 'Collapse all linked mentions';
	const listLimitHoverLabel = settings.listLimit
		? `List limit: ${settings.listLimit} backlinks`
		: 'List limit: all backlinks';
	const sortHoverLabel =
		settings.sortingPrinciple === 'OLDEST_FIRST' ? 'Sort order: oldest first' : 'Sort order: newest first';
	const frontmatterHoverLabel = settings.includeFrontmatterLinks
		? 'Frontmatter links: included'
		: 'Frontmatter links: excluded';

	if (!influxFile.show) {
		return null;
	}

		return (
			<InfluxErrorBoundary>
				<React.Fragment>

					<div
						ref={rootRef}
						className={`influx-root influx-component influx-component--${renderMode}`}
						style={{
							animation: 'fadeIn .6s',
							'--influx-font-size': `${fontSize}px`,
							'--influx-line-height': `${lineHeight}px`
						} as React.CSSProperties}
					>

					<InfluxToolbar
						showToolbarSummary={showToolbarSummary}
						isEditorMode={isEditorMode}
						mentionsCountLabel={mentionsCountLabel}
						mentionsCountTooltip={mentionsCountTooltip}
						summaryRowLabel={summaryRowLabel}
						allVisibleComponentsCollapsed={allVisibleComponentsCollapsed}
						onToggleAll={toggleAll}
						isSearchExpanded={isSearchExpanded}
						isSearchFocused={isSearchFocused}
						inputValue={inputValue}
						searchQuery={searchQuery}
						searchInputRef={searchInputRef}
						onToggleSearch={toggleSearch}
						onSearchChange={handleSearchChange}
						onSearchFocusChange={(focused) => dispatchSearchUi({ type: 'FOCUS_CHANGED', focused })}
						onSearchKeyDown={handleSearchKeyDown}
						onResetSearch={resetSearch}
						onCycleListLimit={() => plugin.cycleListLimit()}
						onToggleSortOrder={() => plugin.toggleSortOrder()}
						onToggleFrontmatterLinks={() => plugin.toggleFrontmatterLinks()}
						listLimitHoverLabel={listLimitHoverLabel}
						sortHoverLabel={sortHoverLabel}
						frontmatterHoverLabel={frontmatterHoverLabel}
						includeFrontmatterLinks={Boolean(settings.includeFrontmatterLinks)}
					/>

						<div className="influx-pane">

						{!showToolbarSummary && (
							<InfluxSummaryRow
								variant="pane"
								mentionsCountLabel={mentionsCountLabel}
								mentionsCountTooltip={mentionsCountTooltip}
							/>
						)}

						<div className="influx-results-scroll" ref={searchResultsContainerRef}>
							{searchQuery && (
								<div className="influx-search-status" role="status" aria-live="polite">
									Searching source notes, section titles, and excerpts for <span className="influx-search-status-query">&quot;{searchQuery.trim()}&quot;</span>
								</div>
							)}


							<div className="influx-results-list" >

							{visibleComponents.map((extended: ExtendedInlinkingFile) => (
								<InfluxResultGroup
									key={extended.sourcePath}
									extended={extended}
									basenameCounts={basenameCounts}
									searchQuery={searchQuery}
									collapsed={collapsedManager.isCollapsed(extended.sourcePath)}
									onToggleCollapse={doToggle}
										centered={centered}
										centeredTitleStyle={centeredTitleStyle}
									settings={settings}
									preview={preview}
									renderMode={renderMode}
									influxFileUuid={influxFile.uuid}
									app={plugin.app}
								/>
								))}

							{filteredComponents.length === 0 && searchQuery && (
								<div className="influx-no-search-results">
									{getNoSearchResultsMessage(searchQuery)}
								</div>
							)}

							{!searchQuery && shownLength === 0 && (
								<div className="influx-empty-state">
									{emptyBacklinksMessage}
								</div>
							)}

								{hasMoreVisible && (
									<React.Fragment>
										{autoLoadByObserver && <div ref={loadMoreTriggerRef} style={{ height: 1 }} />}
									{(!autoLoadByObserver || typeof IntersectionObserver === 'undefined') && (
										<button
											type="button"
											className="influx-load-more-btn influx-clickable"
											onClick={() => loadMoreComponents('button')}
										>
											{loadMoreButtonLabel}
										</button>
									)}
								</React.Fragment>
								)}


							</div>

						</div>


					</div>

				</div>


			</React.Fragment>
		</InfluxErrorBoundary>
	);
}
