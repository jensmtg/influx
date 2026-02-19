import * as React from "react";
import InfluxFile from './InfluxFile';
import { ExtendedInlinkingFile } from './apiAdapter';
import { ObsidianInfluxSettings } from "./types";
import { TFile } from "obsidian";
import { CONSTANTS } from './constants';
import { influxUpdates$, InfluxUpdateEvent } from './utils/Observable';
import { CollapsedStateManager } from './utils/CollapsedStateManager';
import { InfluxErrorBoundary } from './components/InfluxErrorBoundary';
import type ObsidianInflux from './main';
import { logger } from './utils/logger';
import { debounce } from './utils/debounce';


interface InfluxReactComponentProps { influxFile: InfluxFile, preview: boolean, plugin: ObsidianInflux }

export default function InfluxReactComponent(props: InfluxReactComponentProps): React.ReactElement {

	const {
		influxFile,
		preview = false,
		plugin,
	} = props

	const [components, setComponents] = React.useState(influxFile.components)
	const [collapsedManager] = React.useState(() =>
		new CollapsedStateManager(
			influxFile.collapsed ? components.map(c => c.inlinkingFile.file.path) : []
		)
	)
	const [, forceUpdate] = React.useReducer(x => x + 1, 0)
	const [searchQuery, setSearchQuery] = React.useState('')
	const [isSearchExpanded, setIsSearchExpanded] = React.useState(false)
	const [isSearchFocused, setIsSearchFocused] = React.useState(false)

	React.useEffect(() => {
		return collapsedManager.subscribe(forceUpdate)
	}, [collapsedManager])

	const doToggle = (path: string) => {
		collapsedManager.toggle(path)
	}

	const toggleAll = () => {
		const allPaths = components.map(c => c.inlinkingFile.file.path)
		const nowAllCollapsed = collapsedManager.toggleAll(allPaths)
		setToggleAllToOpen(nowAllCollapsed)
	}

	const [toggleAllToOpen, setToggleAllToOpen] = React.useState(influxFile.collapsed)

	const influxFileRef = React.useRef(influxFile)
	influxFileRef.current = influxFile

	const filteredComponents = React.useMemo(() => {
		if (!searchQuery.trim()) return components;

		const query = searchQuery.toLowerCase().trim();
		return components.filter((item: ExtendedInlinkingFile) => {
			const basenameMatch = item.inlinkingFile.file.basename.toLowerCase().includes(query);

			const titleText = item.titleInnerHTML.replace(/<[^>]*>/g, '').toLowerCase();
			const titleMatch = titleText.includes(query);

			const contentText = item.inner.innerHTML.replace(/<[^>]*>/g, '').toLowerCase();
			const contentMatch = contentText.includes(query);

			return basenameMatch || titleMatch || contentMatch;
		});
	}, [components, searchQuery]);

	const handleSearchChange = debounce((value: string) => {
		setSearchQuery(value);
	}, 150);

	const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Escape') {
			setSearchQuery('');
			setIsSearchExpanded(false);
		}
	};

	const toggleSearch = () => {
		setIsSearchExpanded(!isSearchExpanded);
		if (!isSearchExpanded) {
			setIsSearchFocused(true);
			setTimeout(() => {
				const searchInput = document.querySelector('.influx-search-input') as HTMLInputElement;
				searchInput?.focus();
			}, 100);
		}
	};

	React.useEffect(() => {
		const abortController = new AbortController()

		const handleUpdate = async (event: InfluxUpdateEvent) => {
			logger.debug('React component received update', { op: event.op, file: event.file?.path });
			const current = influxFileRef.current
			if (abortController.signal.aborted) return
			if (event.op === 'modify' && !current.shouldUpdate(event.file)) {
				return
			}

			await current.makeInfluxList()
			if (abortController.signal.aborted) return
			const newComponents = await current.renderAllMarkdownBlocks();
			logger.debug('Setting new components', { count: newComponents.length });
			setComponents(newComponents);
		}

		const unsubscribe = influxUpdates$.subscribe(influxFile.uuid, handleUpdate)

		return () => {
			abortController.abort()
			unsubscribe()
		}
	}, [influxFile.uuid])

	// const length = influxFile?.inlinkingFiles.length || 0
	const shownLength = influxFile?.components.length || 0

	const settings: Partial<ObsidianInfluxSettings> = influxFile.api.getSettings()

	const centered = settings.variant !== 'ROWS'
	const fontSize = settings.fontSize || 13
	const lineHeight = fontSize * 1.5

	if (!influxFile.show || shownLength === 0) {
		return null
	}

	return (
		<InfluxErrorBoundary>
			<React.Fragment>

				<div
					className="embedded-backlinks influx-component"
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
										type="text"
										className="influx-search-input"
										placeholder="Search backlinks..."
										value={searchQuery}
										onChange={(e) => handleSearchChange(e.target.value)}
										onFocus={() => setIsSearchFocused(true)}
										onBlur={() => setIsSearchFocused(false)}
										onKeyDown={handleSearchKeyDown}
										aria-label="Search backlinks"
									/>
									{searchQuery && (
										<button
											className="search-clear-btn"
											onClick={() => setSearchQuery('')}
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
									{searchQuery ? `${filteredComponents.length} of ${components.length}` : components.length}
								</span>
							</div>
						</div>

						<div className="search-result-container">


							<div className="search-results-children" >

								{filteredComponents.map((extended: ExtendedInlinkingFile) => {

									const inlinkedCollapsed = collapsedManager.isCollapsed(extended.inlinkingFile.file.path)

									const entryHeader = settings.entryHeaderVisible && extended.titleInnerHTML && !extended.inlinkingFile.isLinkInTitle ? (
										<h2>
											<span
												dangerouslySetInnerHTML={{ __html: extended.titleInnerHTML }}
											/>
										</h2>
									) : null


									return (

										<div key={extended.inlinkingFile.file.basename}
											className={`tree-item search-result ${inlinkedCollapsed ? 'is-collapsed' : ''}`}
											style={centered ? { display: 'flex', alignItems: 'flex-start' } : {}}
										>
											<div className="tree-item-self search-result-file-title"
												style={centered ? { width: `${CONSTANTS.CENTERED_WIDTH_PX}px`, minWidth: `${CONSTANTS.CENTERED_WIDTH_PX}px` } : {}}>


												<div className="tree-item-icon collapse-icon"
													onClick={() => doToggle(extended.inlinkingFile.file.path)}
												>
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon right-triangle">
														<path d="M3 8L12 17L21 8"></path>
													</svg>
												</div>

												<div className="tree-item-inner">
													<a
														data-href={extended.inlinkingFile.file.basename}
														href={extended.inlinkingFile.file.basename}
														className="internal-link"
														target="_blank"
														rel="noopener"
													>
														{extended.inlinkingFile.file.basename}
													</a>
												</div>
											</div>
											<div className="search-result-file-matches"
												style={inlinkedCollapsed ? { display: 'none' }
													: centered ? { flexGrow: 1 } : {}
												}>

														<div className="influx-entries" >
															{entryHeader}
																<div
																	dangerouslySetInnerHTML={{ __html: extended.inner.innerHTML }}
																	className={`influx-entry ${preview ? 'is-preview' : ''}`}
																/>
														</div>
													</div>


										</div>


									)
								})}

								{filteredComponents.length === 0 && searchQuery && (
									<div className="no-search-results">
										No matching backlinks found
									</div>
								)}


							</div>

						</div>


					</div>

				</div>


			</React.Fragment>
		</InfluxErrorBoundary>
	);
}