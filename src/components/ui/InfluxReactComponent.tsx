import * as React from 'react';
import InfluxFile from '../../InfluxFile';
import type { ExtendedInlinkingFile } from '../../domain/backlinks/types';
import { ObsidianInfluxSettings } from '../../types';
import { CONSTANTS } from '../../constants';
import { influxUpdates$, InfluxUpdateEvent } from '../../app/events/influx-updates';
import { CollapsedStateManager } from '../../utils/CollapsedStateManager';
import { InfluxErrorBoundary } from './InfluxErrorBoundary';
import MarkdownMount from './MarkdownMount';
import type ObsidianInflux from '../../app/InfluxPlugin';
import { debounce } from '../../shared/async/debounce';
import { recordMetric } from '../../platform/diagnostics/metrics';

interface InfluxReactComponentProps { influxFile: InfluxFile, preview: boolean, plugin: ObsidianInflux }

const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_FOCUS_DELAY_MS = 100;
type InfluxRenderMode = 'editor' | 'preview' | 'sidebar';
const INITIAL_VISIBLE_COMPONENTS_BY_MODE: Record<InfluxRenderMode, number> = {
	editor: 40,
	preview: 80,
	sidebar: 80,
};
const VISIBLE_COMPONENTS_CHUNK_BY_MODE: Record<InfluxRenderMode, number> = {
	editor: 30,
	preview: 50,
	sidebar: 50,
};

function collectComponentPaths(components: ExtendedInlinkingFile[]): string[] {
	return components
		.map((component) => component.inlinkingFile.file?.path)
		.filter((path): path is string => path !== undefined);
}

function collectInitialCollapsedPaths(influxFile: InfluxFile): string[] {
	if (!influxFile.collapsed || influxFile.components.length === 0) {
		return [];
	}
	return collectComponentPaths(influxFile.components);
}

const searchTextCache = new WeakMap<ExtendedInlinkingFile, string>();

function getSearchText(item: ExtendedInlinkingFile): string {
	const cached = searchTextCache.get(item);
	if (cached) {
		return cached;
	}
	const basename = item.inlinkingFile.file?.basename ?? '';
	const text = `${basename} ${item.titleText} ${item.summaryMarkdown}`.toLowerCase();
	searchTextCache.set(item, text);
	return text;
}

function filterComponentsBySearch(components: ExtendedInlinkingFile[], searchQuery: string): ExtendedInlinkingFile[] {
	const normalizedQuery = searchQuery.toLowerCase().trim();
	if (!normalizedQuery) {
		return components;
	}

	return components.filter((item) => getSearchText(item).includes(normalizedQuery));
}

function getLinkedMentionsCountLabel(params: {
	totalEntryCount: number;
	listLimit: number;
	renderedCount: number;
	filteredCount: number;
	hasSearch: boolean;
}): string {
	const {
		totalEntryCount,
		listLimit,
		renderedCount,
		filteredCount,
		hasSearch,
	} = params;
	const hasListLimit = listLimit > 0 && totalEntryCount > listLimit;

	if (hasSearch && hasListLimit) {
		return `${filteredCount} of ${totalEntryCount}`;
	}
	if (hasListLimit) {
		return `${renderedCount} of ${totalEntryCount}`;
	}
	if (hasSearch) {
		return `${filteredCount} of ${renderedCount}`;
	}
	return totalEntryCount.toString();
}

export default function InfluxReactComponent(props: InfluxReactComponentProps): React.ReactElement {

	const {
		influxFile,
		preview = false,
		plugin,
	} = props;

	const [components, setComponents] = React.useState(influxFile.components);
	const [inputValue, setInputValue] = React.useState('');
	const [collapsedManager] = React.useState(() => {
		return new CollapsedStateManager(collectInitialCollapsedPaths(influxFile));
	});
	const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
	const [searchQuery, setSearchQuery] = React.useState('');
	const [isSearchExpanded, setIsSearchExpanded] = React.useState(false);
	const [isSearchFocused, setIsSearchFocused] = React.useState(false);
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
			setSearchQuery(value);
		}, SEARCH_DEBOUNCE_MS),
		[]
	);

	React.useEffect(() => {
		return () => {
			debouncedSetSearchQuery.cancel();
		};
	}, [debouncedSetSearchQuery]);

	const handleSearchChange = (value: string) => {
		setInputValue(value);
		debouncedSetSearchQuery(value);
	};

	const resetSearch = (closePanel: boolean) => {
		debouncedSetSearchQuery.cancel();
		setInputValue('');
		setSearchQuery('');
		if (closePanel) {
			setIsSearchExpanded(false);
			setIsSearchFocused(false);
		}
	};

	const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Escape') {
			resetSearch(true);
		}
	};

	const toggleSearch = () => {
		setIsSearchExpanded(!isSearchExpanded);
		if (!isSearchExpanded) {
			setIsSearchFocused(true);
			setTimeout(() => {
				searchInputRef.current?.focus();
			}, SEARCH_FOCUS_DELAY_MS);
		} else {
			setIsSearchFocused(false);
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
			if (event.op === 'layout-change' || event.op === 'file-open') {
				return;
			}

			const currentPath = current.file?.path;
			if (!currentPath) {
				return;
			}

			if ((event.op === 'modify' || event.op === 'rename' || event.op === 'delete') && event.file) {
				const touchesCurrentFile = event.file.path === currentPath;
				const affectsBacklinks = current.shouldUpdate(event.file);
				if (!touchesCurrentFile && !affectsBacklinks) {
					return;
				}
			}

			if ((event.op === 'modify' || event.op === 'rename' || event.op === 'delete') && !event.file) {
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

	if (!influxFile.show || shownLength === 0) {
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
							<div className="clickable-icon nav-action-button"
								aria-label={isSearchExpanded ? 'Close search' : 'Search backlinks'}
								onClick={toggleSearch}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-search">
									<circle cx="11" cy="11" r="8"></circle>
									<path d="m21 21-4.3-4.3"></path>
								</svg>
							</div>
							{isSearchExpanded && (
								<div className={`search-input-wrapper ${isSearchFocused ? 'is-focused' : ''}`}>
									<input
										ref={searchInputRef}
										type="text"
										className="influx-search-input"
										placeholder="Search backlinks..."
										value={inputValue}
										onChange={(e) => handleSearchChange(e.target.value)}
										onFocus={() => setIsSearchFocused(true)}
										onBlur={() => setIsSearchFocused(false)}
										onKeyDown={handleSearchKeyDown}
										aria-label="Search backlinks"
									/>
									{searchQuery && (
										<button
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
							<div className="clickable-icon nav-action-button"
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
							</div>
							<div className="clickable-icon nav-action-button"
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
							</div>
							<div
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
							</div>
							<div className="clickable-icon nav-action-button"
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
							</div>
						</div>

					</div>

					<div className="backlink-pane">

						<div
							onClick={() => toggleAll()}
							className="tree-item-self is-clickable"
						>

							<div className="tree-item-inner" >
								Linked mentions
							</div>


							<div className="tree-item-flair-outer">
								<span className="tree-item-flair">
									{mentionsCountLabel}
								</span>
							</div>
						</div>

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


												<div className="tree-item-icon collapse-icon"
													onClick={() => doToggle(filePath)}
												>
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon right-triangle">
														<path d="M3 8L12 17L21 8"></path>
													</svg>
												</div>

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
										No matching backlinks found
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
												Load more backlinks
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
