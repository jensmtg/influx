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
	collectInitialCollapsedPaths,
	createInitialSearchUiState,
	filterComponentsBySearch,
	getEmptyBacklinksMessage,
	getLoadMoreBacklinksLabel,
	getLinkedMentionsCountLabel,
	getLinkedMentionsCountTooltip,
	getNoSearchResultsMessage,
	INITIAL_VISIBLE_COMPONENTS_BY_MODE,
	type InfluxRenderMode,
	reduceSearchUiState,
	shouldProcessInfluxUpdateEvent,
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

	const toggleAll = () => {
		const nowAllCollapsed = collapsedManager.toggleAll(collectComponentPaths(components));
		setToggleAllToOpen(nowAllCollapsed);
	};

	const [toggleAllToOpen, setToggleAllToOpen] = React.useState(influxFile.collapsed);

	const influxFileRef = React.useRef(influxFile);
	influxFileRef.current = influxFile;
	const settings: Partial<ObsidianInfluxSettings> = influxFile.api.getSettings();
	const renderMode: InfluxRenderMode = settings.showInfluxInSidebar ? 'sidebar' : preview ? 'preview' : 'editor';
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
			const nextVisibleCount = Math.min(count + VISIBLE_COMPONENTS_CHUNK_BY_MODE[renderMode], filteredComponents.length);
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
			if (abortController.signal.aborted) {
				return;
			}
			const currentPath = current.file?.path;
			const affectsBacklinks = event.file ? current.shouldUpdate(event.file) : false;
			if (!shouldProcessInfluxUpdateEvent({ event, currentPath, affectsBacklinks })) {
				return;
			}

			await current.makeInfluxList();
			if (abortController.signal.aborted) {
				return;
			}
			const newComponents = current.toEntries();
			if (abortController.signal.aborted || seq !== updateSeqRef.current) {
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

	if (!influxFile.show) {
		return null;
	}

		return (
			<InfluxErrorBoundary>
				<React.Fragment>

					<div
						className={`embedded-backlinks influx-component influx-component--${renderMode}`}
						style={{
							animation: 'fadeIn .6s',
							'--influx-font-size': `${fontSize}px`,
							'--influx-line-height': `${lineHeight}px`
						} as React.CSSProperties}
					>

					<div className="nav-header">

						<div className="nav-buttons-container">
							<button
								type="button"
								className="clickable-icon nav-action-button"
								aria-label={isSearchExpanded ? 'Close search' : 'Search backlinks'}
								onClick={toggleSearch}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-search">
									<circle cx="11" cy="11" r="8"></circle>
									<path d="m21 21-4.3-4.3"></path>
								</svg>
							</button>
							{isSearchExpanded && (
								<div className={`search-input-wrapper ${isSearchFocused ? 'is-focused' : ''}`}>
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
											className="search-clear-btn"
											onClick={() => resetSearch(false)}
											aria-label="Clear search"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-x">
												<line x1="18" y1="6" x2="6" y2="18"></line>
												<line x1="6" y1="6" x2="18" y2="18"></line>
											</svg>
										</button>
									)}
								</div>
							)}
							<button
								type="button"
								className="clickable-icon nav-action-button"
								aria-label="Cycle list limit"
								onClick={() => plugin.cycleListLimit()}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-list">
									<line x1="8" y1="6" x2="21" y2="6"></line>
									<line x1="8" y1="12" x2="21" y2="12"></line>
									<line x1="8" y1="18" x2="21" y2="18"></line>
									<line x1="3" y1="6" x2="3.01" y2="6"></line>
									<line x1="3" y1="12" x2="3.01" y2="12"></line>
									<line x1="3" y1="18" x2="3.01" y2="18"></line>
								</svg>
							</button>
							<button
								type="button"
								className="clickable-icon nav-action-button"
								aria-label={toggleAllToOpen ? 'Expand all' : 'Collapse all'}
								onClick={() => toggleAll()}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-move-vertical">
									<polyline points="8 18 12 22 16 18">
									</polyline>
									<polyline points="8 6 12 2 16 6">
									</polyline>
									<line x1="12" y1="2" x2="12" y2="22">
									</line>
								</svg>
							</button>
							<button
								type="button"
								className="clickable-icon nav-action-button"
								aria-label={settings.includeFrontmatterLinks ? 'Exclude frontmatter links' : 'Include frontmatter links'}
								onClick={() => plugin.toggleFrontmatterLinks()}
							>
								{settings.includeFrontmatterLinks ? (
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-eye">
										<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
										<circle cx="12" cy="12" r="3"></circle>
									</svg>
								) : (
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-eye-off">
										<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
										<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
										<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
										<line x1="2" x2="22" y1="2" y2="22"></line>
									</svg>
								)}
							</button>
							<button
								type="button"
								className="clickable-icon nav-action-button"
								aria-label="Change sort order"
								onClick={() => plugin.toggleSortOrder()}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-sort-asc">
									<path d="M11 5h4">
									</path>
									<path d="M11 9h7">
									</path>
									<path d="M11 13h10">
									</path>
									<path d="m3 17 3 3 3-3">
									</path>
									<path d="M6 18V4">
									</path>
								</svg>
							</button>
						</div>

					</div>

						<div className="backlink-pane">

						<button
							type="button"
							onClick={toggleAll}
							className="tree-item-self is-clickable"
							aria-label={toggleAllToOpen ? 'Expand all linked mentions' : 'Collapse all linked mentions'}
						>

							<div className="tree-item-inner" >
								Linked mentions
							</div>


							<div className="tree-item-flair-outer">
								<span className="tree-item-flair" title={mentionsCountTooltip}>
									{mentionsCountLabel}
								</span>
							</div>
						</button>

						<div className="search-result-container" ref={searchResultsContainerRef}>


							<div className="search-results-children" >

								{visibleComponents.map((extended: ExtendedInlinkingFile) => {
									const filePath = extended.inlinkingFile.file?.path;
									const fileBasename = extended.inlinkingFile.file?.basename ?? 'unknown';

									if (!filePath) {
										return null;
									}

									const inlinkedCollapsed = collapsedManager.isCollapsed(filePath);

									const entryHeader = settings.entryHeaderVisible && extended.titleText && !extended.inlinkingFile.isLinkInTitle ? (
										<h2>
											<span>{extended.titleText}</span>
										</h2>
									) : null;


									return (

										<div key={filePath}
											className={`tree-item search-result ${inlinkedCollapsed ? 'is-collapsed' : ''}`}
											style={centered ? { display: 'flex', alignItems: 'flex-start' } : {}}
										>
											<div className="tree-item-self search-result-file-title"
												style={centered ? { width: `${CONSTANTS.CENTERED_WIDTH_PX}px`, minWidth: `${CONSTANTS.CENTERED_WIDTH_PX}px` } : {}}>


											<button
												type="button"
												className="tree-item-icon collapse-icon collapse-icon-button"
												onClick={() => doToggle(filePath)}
												aria-label={inlinkedCollapsed ? `Expand ${fileBasename}` : `Collapse ${fileBasename}`}
												aria-expanded={!inlinkedCollapsed}
											>
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon right-triangle">
														<path d="M3 8L12 17L21 8"></path>
													</svg>
											</button>

											<div className="tree-item-inner">
												<a
													data-href={fileBasename}
													href={fileBasename}
													className="internal-link"
													target="_blank"
													rel="noopener"
												>
													{fileBasename}
												</a>
											</div>
											</div>
											<div className="search-result-file-matches"
												style={inlinkedCollapsed ? { display: 'none' }
													: centered ? { flexGrow: 1 } : {}
												}>

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
								<div className="no-search-results">
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
											className="tree-item-self is-clickable"
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
