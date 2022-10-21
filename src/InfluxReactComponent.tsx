import * as React from "react";
import InfluxFile from './InfluxFile';
import { ExtendedInlinkingFile } from './apiAdapter';
import { ObsidianInfluxSettings } from "./main";
import { TFile } from "obsidian";
import { StyleSheetType } from "./createStyleSheet";


interface InfluxReactComponentProps { influxFile: InfluxFile, preview: boolean, sheet: StyleSheetType }

export default function InfluxReactComponent(props: InfluxReactComponentProps): JSX.Element {

	const {
		influxFile,
		preview,
		sheet,
	} = props

	const [components, setComponents] = React.useState(influxFile.components)
	const [stylesheet, setStyleSheet] = React.useState(sheet)
	const [collapsed, setCollapsed]: [string[], React.Dispatch<React.SetStateAction<string[]>>] = React.useState(influxFile.collapsed ? components.map(component => component.inlinkingFile.file.basename) : [])
	const [toggleAllToOpen, setToggleAllToOpen] = React.useState(influxFile.collapsed)

	const doToggle = (basename: string) => {
		if (collapsed.includes(basename)) {
			setCollapsed(collapsed.filter(name => name !== basename))
		}
		else {
			setCollapsed([...collapsed, basename])
		}
	}

	const toggleAll = () => {
		const all = components.map(component => component.inlinkingFile.file.basename)
		if (toggleAllToOpen) {
			setCollapsed([])
			setToggleAllToOpen(false)
		}
		else {
			setCollapsed(all)
			setToggleAllToOpen(true)
		}
	}

	React.useEffect(() => {

		const respondToUpdateTrigger: (op: string, stylesheet: StyleSheetType, file?: TFile) => void = async (op, stylesheet, file) => {

			if (op === 'modify' && !influxFile.shouldUpdate(file)) {
				return
			}

			setStyleSheet(stylesheet)
			await influxFile.makeInfluxList()
			setComponents(await influxFile.renderAllMarkdownBlocks())

		}

		if (preview === false) {
			influxFile.influx.registerInfluxComponent(influxFile.uuid, respondToUpdateTrigger)

		}
		return () => {
		}
	}, [])

	const classes = stylesheet.classes

	// const length = influxFile?.inlinkingFiles.length || 0
	const shownLength = influxFile?.components.length || 0

	const settings: Partial<ObsidianInfluxSettings> = influxFile.api.getSettings()

	const centered = settings.variant !== 'ROWS'


	if (!influxFile.show || shownLength === 0) {
		return null
	}

	return <React.Fragment>


		<div className={`embedded-backlinks ${classes.influxComponent}`}> 

			<div className="nav-header">

				<div className="nav-buttons-container">
					{/* <div className="clickable-icon nav-action-button" aria-label="Collapse results">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-list">
							<line x1="8" y1="6" x2="21" y2="6">
							</line>
							<line x1="8" y1="12" x2="21" y2="12">
							</line>
							<line x1="8" y1="18" x2="21" y2="18">
							</line>
							<line x1="3" y1="6" x2="3.01" y2="6">
							</line>
							<line x1="3" y1="12" x2="3.01" y2="12">
							</line>
							<line x1="3" y1="18" x2="3.01" y2="18">
							</line>
						</svg>
					</div> */}
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
					{/* <div className="clickable-icon nav-action-button" aria-label="Show search filter">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-search">
							<circle cx="11" cy="11" r="8">
							</circle>
							<line x1="21" y1="21" x2="16.65" y2="16.65">
							</line>
						</svg>
					</div> */}
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
					className={`tree-item-self is-clickable 
					${'' //	isOpen ? '' : 'is-collapsed'
						}`}
				// aria-label={isOpen ? "Click to collapse" : "Click to expand"}
				>

					{/* <span className="tree-item-icon collapse-icon">
					<svg viewBox="0 0 100 100" className="right-triangle" width="8" height="8">
					<path fill="currentColor" stroke="currentColor" d="M94.9,20.8c-1.4-2.5-4.1-4.1-7.1-4.1H12.2c-3,0-5.7,1.6-7.1,4.1c-1.3,2.4-1.2,5.2,0.2,7.6L43.1,88c1.5,2.3,4,3.7,6.9,3.7 s5.4-1.4,6.9-3.7l37.8-59.6C96.1,26,96.2,23.2,94.9,20.8L94.9,20.8z">
					</path></svg></span> */}

					<div className="tree-item-inner" >
						Linked mentions (influx)
					</div>


					<div className="tree-item-flair-outer">
						<span className="tree-item-flair">{components.length}</span>
					</div>
				</div>

				<div className="search-result-container">


					<div className="search-results-children" >

						{components.map((extended: ExtendedInlinkingFile) => {

							const inlinkedCollapsed = collapsed.includes(extended.inlinkingFile.file.basename)

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
										style={centered ? { width: '160px', minWidth: '160px' } : {}}>


										<div className="tree-item-icon collapse-icon"
											onClick={() => doToggle(extended.inlinkingFile.file.basename)}
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
										{/* <div className="tree-item-flair-outer">
											<span className="tree-item-flair">1</span>
										</div> */}
									</div>
									<div className="search-result-file-matches"
										style={inlinkedCollapsed ? { display: 'none' }
											: centered ? { flexGrow: 1 } : {}
										}>
										<div className="">

											<div className={classes.inlinkedEntries} >
												{entryHeader}
												{extended.inner.map((div: HTMLDivElement, i: number) => (
													<div
														key={i}
														dangerouslySetInnerHTML={{ __html: div.innerHTML }}
														className={classes.inlinkedEntry}
													/>
												))}
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
}