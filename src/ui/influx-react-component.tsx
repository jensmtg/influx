import * as React from 'react';
import InfluxFile from '../domain/backlinks/influx-file';
import type { ExtendedInlinkingFile } from '../domain/backlinks/types';
import { ObsidianInfluxSettings } from '../types';
import { CONSTANTS } from '../config/constants';
import { influxUpdates$, InfluxUpdateEvent } from '../app/events/influx-updates';
import { CollapsedStateManager } from './state/collapsed-state-manager';
import { InfluxErrorBoundary } from './influx-error-boundary';
import MarkdownMount from './markdown-mount';
import type ObsidianInflux from '../app/influx-plugin';
import { debounce } from '../shared/async/debounce';
import { recordMetric } from '../platform/diagnostics/metrics';
import {
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
	INITIAL_VISIBLE_COMPONENTS_BY_MODE,
	type InfluxRenderMode,
	reduceSearchUiState,
	resolveInfluxUpdateEntries,
	VISIBLE_COMPONENTS_CHUNK_BY_MODE,
} from './influx-react-component-helpers';

interface InfluxReactComponentProps { influxFile: InfluxFile, preview: boolean, plugin: ObsidianInflux }

const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_FOCUS_DELAY_MS = 100;

export default function InfluxReactComponent(props: InfluxReactComponentProps): React.ReactElement {

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
	const renderMode: InfluxRenderMode = settings.showInfluxInSidebar ? 'sidebar' : preview ? 'preview' : 'editor';
	const isEditorMode = renderMode === 'editor';
	const showToolbarSummary = renderMode === 'editor' || renderMode === 'preview';
	const autoLoadByObserver = renderMode !== 'editor';

	const filteredComponents = React.useMemo(() => {
		const startTime = performance.now();
		const filtered = filterComponentsBySearch(components, searchQuery);
		recordMetric({
			name: 'influx.ui.filter',
			mode: renderMode,
			durationMs: performance.now() - startTime,
			settings,
			ctx: {
				filePath: influxFile.file?.path,
				componentCount: components.length,
				filteredCount: filtered.length,
				queryLength: searchQuery.length,
			}
		});
		return filtered;
	}, [components, searchQuery, renderMode, settings, influxFile.file?.path]);
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
						filePath: influxFile.file?.path,
						prevVisibleCount: count,
						nextVisibleCount,
						totalFilteredCount: filteredComponents.length,
						trigger,
					}
				});
			}
			return nextVisibleCount;
		});
	}, [filteredComponents.length, renderMode, settings, influxFile.file?.path]);

	React.useEffect(() => {
		setVisibleCount(Math.min(INITIAL_VISIBLE_COMPONENTS_BY_MODE[renderMode], filteredComponents.length));
	}, [filteredComponents, renderMode]);

	React.useEffect(() => {
		if (!autoLoadByObserver || !hasMoreVisible || typeof IntersectionObserver === 'undefined') {
			return;
		}
		const trigger = loadMoreTriggerRef.current;
		if (!trigger) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
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

	const handleSearchChange = (value: string) => {
		dispatchSearchUi({ type: 'INPUT_CHANGED', value });
		debouncedSetSearchQuery(value);
	};

	const resetSearch = (closePanel: boolean) => {
		debouncedSetSearchQuery.cancel();
		dispatchSearchUi({ type: 'RESET', closePanel });
	};

	const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Escape') {
			resetSearch(true);
		}
	};

	const toggleSearch = () => {
		const willOpen = !isSearchExpanded;
		dispatchSearchUi({ type: 'TOGGLE_PANEL' });
		if (willOpen) {
			setTimeout(() => {
				searchInputRef.current?.focus();
			}, SEARCH_FOCUS_DELAY_MS);
		}
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
	const centeredTitleStyle = centered
		&& renderMode !== 'editor'
		? {
			width: `min(${CONSTANTS.CENTERED_WIDTH_PX}px, 42vw)`,
			minWidth: '112px',
			maxWidth: '45%',
		}
		: {};
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
	const renderSummaryRow = (variant: 'toolbar' | 'pane') => (
		<button
			type="button"
			onClick={toggleAll}
			className={`influx-summary-row influx-clickable${variant === 'toolbar' ? ' influx-summary-row--toolbar' : ''}`}
			aria-label={summaryRowLabel}
		>
			<div className="influx-summary-title">
				Linked mentions (influx)
			</div>
			<div className="influx-summary-count-wrap">
				<span className="influx-summary-count" title={mentionsCountTooltip}>
					{mentionsCountLabel}
				</span>
			</div>
		</button>
	);

	if (!influxFile.show) {
		return null;
	}

		return (
			<InfluxErrorBoundary>
				<React.Fragment>

					<div
						className={`influx-root influx-component influx-component--${renderMode}`}
						style={{
							animation: 'fadeIn .6s',
							'--influx-font-size': `${fontSize}px`,
							'--influx-line-height': `${lineHeight}px`
						} as React.CSSProperties}
					>

					<div className={`influx-toolbar${isEditorMode ? ' influx-toolbar--editor' : ''}`}>

						{showToolbarSummary && renderSummaryRow('toolbar')}

						<div className="influx-toolbar-actions" role="toolbar" aria-label="Influx actions">
							<button
								type="button"
								className="influx-icon-button influx-toolbar-button"
								aria-label={isSearchExpanded ? 'Close search' : 'Search backlinks'}
								onClick={toggleSearch}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--search">
									<circle cx="11" cy="11" r="8"></circle>
									<path d="m21 21-4.3-4.3"></path>
								</svg>
							</button>
							{isSearchExpanded && (
								<div className={`influx-search-wrap ${isSearchFocused ? 'influx-is-focused' : ''}`}>
									<input
										ref={searchInputRef}
										type="text"
										className="influx-search-input"
										placeholder="Search backlinks..."
										value={inputValue}
										onChange={(e) => handleSearchChange(e.target.value)}
										onFocus={() => dispatchSearchUi({ type: 'FOCUS_CHANGED', focused: true })}
										onBlur={() => dispatchSearchUi({ type: 'FOCUS_CHANGED', focused: false })}
										onKeyDown={handleSearchKeyDown}
										aria-label="Search backlinks"
									/>
									{searchQuery && (
										<button
											type="button"
											className="influx-search-clear"
											onClick={() => resetSearch(false)}
											aria-label="Clear search"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--clear">
												<line x1="18" y1="6" x2="6" y2="18"></line>
												<line x1="6" y1="6" x2="18" y2="18"></line>
											</svg>
										</button>
									)}
								</div>
							)}
							<button
								type="button"
								className="influx-icon-button influx-toolbar-button"
								aria-label={allVisibleComponentsCollapsed ? 'Expand all' : 'Collapse all'}
								onClick={() => toggleAll()}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--expand-collapse-all">
									<polyline points="8 18 12 22 16 18">
									</polyline>
									<polyline points="8 6 12 2 16 6">
									</polyline>
									<line x1="12" y1="2" x2="12" y2="22">
									</line>
								</svg>
							</button>
							<details className="influx-toolbar-menu">
								<summary className="influx-icon-button influx-toolbar-button" aria-label="More Influx actions">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--more">
										<circle cx="12" cy="12" r="1"></circle>
										<circle cx="19" cy="12" r="1"></circle>
										<circle cx="5" cy="12" r="1"></circle>
									</svg>
								</summary>
								<div className="influx-toolbar-menu-panel">
									<button type="button" className="influx-toolbar-menu-item" onClick={() => plugin.cycleListLimit()}>
										Cycle list limit
									</button>
									<button type="button" className="influx-toolbar-menu-item" onClick={() => plugin.toggleSortOrder()}>
										Change sort order
									</button>
									<button type="button" className="influx-toolbar-menu-item" onClick={() => plugin.toggleFrontmatterLinks()}>
										{settings.includeFrontmatterLinks ? 'Exclude frontmatter links' : 'Include frontmatter links'}
									</button>
								</div>
							</details>
						</div>

					</div>

						<div className="influx-pane">

						{!showToolbarSummary && renderSummaryRow('pane')}

						<div className="influx-results-scroll" ref={searchResultsContainerRef}>


							<div className="influx-results-list" >

								{visibleComponents.map((extended: ExtendedInlinkingFile) => {
									const filePath = extended.inlinkingFile.file?.path;

									if (!filePath) {
										return null;
									}

									const fileBasename = extended.inlinkingFile.file?.basename ?? 'unknown';
									const safePathToken = filePath.replace(/[^a-zA-Z0-9_-]/g, '-');
									const matchesRegionId = `${influxFile.uuid}-matches-${safePathToken}`;

									const inlinkedCollapsed = collapsedManager.isCollapsed(filePath);

									const entryHeader = settings.entryHeaderVisible && extended.titleText && !extended.inlinkingFile.isLinkInTitle ? (
										<h2>
											<span>{extended.titleText}</span>
										</h2>
									) : null;


									return (

										<div key={filePath}
											className={`influx-result-group ${inlinkedCollapsed ? 'influx-is-collapsed' : ''}${centered ? ' influx-result-group--split' : ''}`}
										>
											<div className="influx-result-head"
												style={centeredTitleStyle}>


											<button
												type="button"
												className="influx-collapse-toggle"
												onClick={() => doToggle(filePath)}
												aria-label={inlinkedCollapsed ? `Expand ${fileBasename}` : `Collapse ${fileBasename}`}
												aria-expanded={!inlinkedCollapsed}
												aria-controls={matchesRegionId}
											>
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--collapse-chevron">
														<path d="M3 8L12 17L21 8"></path>
													</svg>
											</button>

												<div className="influx-result-source">
													<a
														data-href={fileBasename}
														href={fileBasename}
														className="internal-link influx-internal-link"
														target="_blank"
														rel="noopener"
												>
													{fileBasename}
												</a>
												</div>
											</div>
											<div className="influx-result-body"
												id={matchesRegionId}
												hidden={inlinkedCollapsed}
												style={centered ? { flexGrow: 1 } : {}}>

														<div className="influx-entries" >
															{entryHeader}
																<MarkdownMount
																	markdown={extended.summaryMarkdown}
																	sourcePath={extended.sourcePath}
																	className={`influx-entry ${preview ? 'is-preview' : ''} influx-entry--${renderMode}`}
																	mode={renderMode}
																/>
														</div>
													</div>


										</div>


									);
								})}

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
