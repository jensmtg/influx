import * as React from "react";
import InfluxFile from './InfluxFile';
import { ExtendedInlinkingFile } from './apiAdapter';
import { ObsidianInfluxSettings } from "./types";
import { TFile } from "obsidian";
import { StyleSheetType } from "./createStyleSheet";
import { CONSTANTS } from './constants';
import { influxUpdates$, InfluxUpdateEvent } from './utils/Observable';
import { CollapsedStateManager } from './utils/CollapsedStateManager';
import { InfluxErrorBoundary } from './components/InfluxErrorBoundary';


interface InfluxReactComponentProps { influxFile: InfluxFile, preview: boolean, sheet: StyleSheetType }

export default function InfluxReactComponent(props: InfluxReactComponentProps): React.ReactElement {

	const {
		influxFile,
		preview = false,
		sheet,
	} = props

	const [components, setComponents] = React.useState(influxFile.components)
	const [stylesheet, setStyleSheet] = React.useState(sheet)
	const [collapsedManager] = React.useState(() =>
		new CollapsedStateManager(
			influxFile.collapsed ? components.map(c => c.inlinkingFile.file.path) : []
		)
	)
	const [, forceUpdate] = React.useReducer(x => x + 1, 0)

	React.useEffect(() => {
		return collapsedManager.subscribe(forceUpdate)
	}, [collapsedManager])

	const doToggle = (path: string) => {
		collapsedManager.toggle(path)
	}

	const toggleAll = () => {
		const allPaths = components.map(c => c.inlinkingFile.file.path)
		collapsedManager.toggleAll(allPaths)
	}

	const [toggleAllToOpen, setToggleAllToOpen] = React.useState(influxFile.collapsed)

	React.useEffect(() => {

		const handleUpdate = async (event: InfluxUpdateEvent) => {
			if (event.op === 'modify' && !influxFile.shouldUpdate(event.file)) {
				return
			}

			setStyleSheet(event.stylesheet)
			await influxFile.makeInfluxList()
			setComponents(await influxFile.renderAllMarkdownBlocks())
		}

		const unsubscribe = influxUpdates$.subscribe(influxFile.uuid, handleUpdate)

		return () => {
			unsubscribe()
		}
	}, [influxFile.uuid])

	const classes = stylesheet.classes

	// const length = influxFile?.inlinkingFiles.length || 0
	const shownLength = influxFile?.components.length || 0

	const settings: Partial<ObsidianInfluxSettings> = influxFile.api.getSettings()

	const centered = settings.variant !== 'ROWS'

	if (!influxFile.show || shownLength === 0) {
		return null
	}
	
	return (
		<InfluxErrorBoundary>
			<React.Fragment>

				<div className={`embedded-backlinks ${classes.influxComponent}`}
				style={{
					animation: 'fadeIn .6s'
				}}
				>

					<div className="nav-header">

						<div className="nav-buttons-container">
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
							<div className="clickable-icon nav-action-button"
								aria-label="Change sort order"
								onClick={() => influxFile.influx.toggleSortOrder()}
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


					<div className="search-input-container" style={{ display: "none" }}>
						<input type="search" spellCheck="false" placeholder="Type to start search...">

						</input>
						<div className="search-input-clear-button" aria-label="Clear search" style={{ display: "none" }}>
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
								<span className="tree-item-flair">{components.length}</span>
							</div>
						</div>

						<div className="search-result-container">


							<div className="search-results-children" >

								{components.map((extended: ExtendedInlinkingFile) => {

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
												<div className="">

													<div className={classes.inlinkedEntries} >
														{entryHeader}
														<div
																dangerouslySetInnerHTML={{ __html: extended.inner.innerHTML }}
																className={classes.inlinkedEntry}
															/>
													</div>
												</div>
											</div>


										</div>


									)
								})}


							</div>

						</div>


					</div>

				</div>


				<style
					dangerouslySetInnerHTML={{ __html: stylesheet.toString() }}
				/>

			</React.Fragment>
		</InfluxErrorBoundary>
	);
}