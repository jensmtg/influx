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
	const [toggled, setToggled]: [string[], React.Dispatch<React.SetStateAction<string[]>>] = React.useState([])
	const [toggleAllToOpen, setToggleAllToOpen] = React.useState(influxFile.collapsed)

	const doToggle = (basename: string) => {
		if (toggled.includes(basename)) {
			setToggled(toggled.filter(name => name !== basename))
		}
		else {
			setToggled([...toggled, basename])
		}
	}

	const toggleAll = () => {
		if (toggleAllToOpen) {
			const all = components.map(component => component.inlinkingFile.file.basename)
			setToggled(all)
			setToggleAllToOpen(false)
		}
		else {
			setToggled([])
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
	// const shownLength = influxFile?.components.length || 0

	const settings: Partial<ObsidianInfluxSettings> = influxFile.api.getSettings()

	const centered = settings.variant !== 'ROWS'


	if (!influxFile.show) {
		return null
	}

	return <React.Fragment>


		<div className="embedded-backlinks">

			<div className="nav-header">
				<div className="nav-buttons-container">
					{/* <div className="nav-action-button" 
					aria-label="Collapse results"
					>
						<svg viewBox="0 0 100 100" className="bullet-list" width="20" height="20">
							<path fill="currentColor" stroke="currentColor" d="M16.4,16.4c-3.5,0-6.4,2.9-6.4,6.4s2.9,6.4,6.4,6.4s6.4-2.9,6.4-6.4S19.9,16.4,16.4,16.4z M16.4,19.6 c1.8,0,3.2,1.4,3.2,3.2c0,1.8-1.4,3.2-3.2,3.2s-3.2-1.4-3.2-3.2C13.2,21,14.6,19.6,16.4,19.6z M29.2,21.2v3.2H90v-3.2H29.2z M16.4,43.6c-3.5,0-6.4,2.9-6.4,6.4s2.9,6.4,6.4,6.4s6.4-2.9,6.4-6.4S19.9,43.6,16.4,43.6z M16.4,46.8c1.8,0,3.2,1.4,3.2,3.2 s-1.4,3.2-3.2,3.2s-3.2-1.4-3.2-3.2S14.6,46.8,16.4,46.8z M29.2,48.4v3.2H90v-3.2H29.2z M16.4,70.8c-3.5,0-6.4,2.9-6.4,6.4 c0,3.5,2.9,6.4,6.4,6.4s6.4-2.9,6.4-6.4C22.8,73.7,19.9,70.8,16.4,70.8z M16.4,74c1.8,0,3.2,1.4,3.2,3.2c0,1.8-1.4,3.2-3.2,3.2 s-3.2-1.4-3.2-3.2C13.2,75.4,14.6,74,16.4,74z M29.2,75.6v3.2H90v-3.2H29.2z">
							</path>
						</svg>
					</div> */}
					<div 
					className="nav-action-button" 
					aria-label={toggleAllToOpen ? 'Expand all' : 'Collapse all'}
					onClick={() => toggleAll()}
					>
						<svg viewBox="0 0 100 100" className="expand-vertically" width="20" height="20">
							<path fill="currentColor" stroke="currentColor" d="M92,92H8v-4h84V92z M50,86.8L34.6,71.4l2.8-2.8L48,79.2V20.8L37.4,31.4l-2.8-2.8L50,13.2l15.4,15.4l-2.8,2.8L52,20.8v58.3 l10.6-10.6l2.8,2.8L50,86.8z M92,12H8V8h84V12z">
							</path>
						</svg>
					</div>
					<div
						className="nav-action-button"
						aria-label="Change sort order"
						onClick={() => influxFile.influx.toggleSortOrder()}
					>
						<svg viewBox="0 0 100 100" className="up-and-down-arrows" width="20" height="20">
							<path fill="currentColor" stroke="currentColor" d="M25.8,5.9c-0.1,0-0.2,0-0.3,0.1c-0.1,0-0.1,0-0.2,0.1c-0.1,0-0.1,0-0.2,0.1c-0.1,0.1-0.3,0.2-0.4,0.3 c-0.1,0.1-0.2,0.1-0.3,0.2c-0.1,0.1-0.2,0.2-0.3,0.3L8.6,22.6c-0.8,0.8-0.8,2.1,0,2.9c0.8,0.8,2.1,0.8,2.9,0L24,12.9V76 c0,0.7,0.4,1.4,1,1.8c0.6,0.4,1.4,0.4,2,0c0.6-0.4,1-1,1-1.8V12.9l12.6,12.6c0.8,0.8,2.1,0.8,2.9,0c0.8-0.8,0.8-2.1,0-2.9 L27.7,6.9c-0.1-0.2-0.3-0.4-0.6-0.6c-0.2-0.2-0.5-0.3-0.8-0.3C26.2,6,26,5.9,25.8,5.9L25.8,5.9z M74,6c-1.1,0-2,0.9-2,2s0.9,2,2,2 s2-0.9,2-2S75.1,6,74,6z M74,14c-1.1,0-2,0.9-2,2s0.9,2,2,2s2-0.9,2-2S75.1,14,74,14z M73.8,21.9c-0.1,0-0.2,0-0.3,0.1 c-0.9,0.2-1.6,1-1.6,2v63.1L59.4,74.6c-0.5-0.5-1.2-0.7-1.9-0.6c-0.8,0.1-1.4,0.7-1.6,1.4c-0.2,0.7,0,1.5,0.6,2l15.8,15.7 c0,0.1,0.1,0.1,0.1,0.2l0.1,0.1c0,0,0.1,0.1,0.1,0.1c0,0,0,0,0.1,0c0.1,0.1,0.3,0.2,0.4,0.3c0,0,0,0,0.1,0c0,0,0.1,0,0.1,0.1 c0,0,0,0,0.1,0c0.1,0,0.1,0,0.2,0.1c0.2,0,0.4,0,0.6,0c0,0,0.1,0,0.1,0c0.2,0,0.3-0.1,0.5-0.2c0.3-0.1,0.5-0.3,0.7-0.6l15.9-15.8 c0.8-0.8,0.8-2.1,0-2.9c-0.8-0.8-2.1-0.8-2.9,0L76,87.1V24c0-0.6-0.2-1.1-0.6-1.5C75,22.1,74.4,21.9,73.8,21.9L73.8,21.9z M26,82 c-1.1,0-2,0.9-2,2c0,1.1,0.9,2,2,2c1.1,0,2-0.9,2-2C28,82.9,27.1,82,26,82z M26,90c-1.1,0-2,0.9-2,2s0.9,2,2,2c1.1,0,2-0.9,2-2 C28,90.9,27.1,90,26,90z">
							</path>
						</svg>
					</div>
					<div className="nav-action-button" aria-label="Show search filter" style={{ display: "none" }}>
						<svg viewBox="0 0 100 100" className="magnifying-glass" width="20" height="20">
							<path fill="currentColor" stroke="currentColor" d="M42,6C23.2,6,8,21.2,8,40s15.2,34,34,34c7.4,0,14.3-2.4,19.9-6.4l26.3,26.3l5.6-5.6l-26-26.1c5.1-6,8.2-13.7,8.2-22.1 C76,21.2,60.8,6,42,6z M42,10c16.6,0,30,13.4,30,30S58.6,70,42,70S12,56.6,12,40S25.4,10,42,10z">
							</path>
						</svg>
					</div>
				</div>
			</div>


			<div className="search-input-container" style={{ display: "none" }}>
				<input type="search" spellCheck="false" placeholder="Type to start search..."></input>
				<div className="search-input-clear-button" aria-label="Clear search" style={{ display: "none" }}>
				</div>
			</div>


			<div className="backlink-pane">

				<div
					//onClick={toggleOpen}
					className={`tree-item-self is-clickable 
					${
					'' //	isOpen ? '' : 'is-collapsed'
					}`}
					// aria-label={isOpen ? "Click to collapse" : "Click to expand"}
				>

					{/* <span className="tree-item-icon collapse-icon">
					<svg viewBox="0 0 100 100" className="right-triangle" width="8" height="8">
					<path fill="currentColor" stroke="currentColor" d="M94.9,20.8c-1.4-2.5-4.1-4.1-7.1-4.1H12.2c-3,0-5.7,1.6-7.1,4.1c-1.3,2.4-1.2,5.2,0.2,7.6L43.1,88c1.5,2.3,4,3.7,6.9,3.7 s5.4-1.4,6.9-3.7l37.8-59.6C96.1,26,96.2,23.2,94.9,20.8L94.9,20.8z">
					</path></svg></span> */}

					<div className="tree-item-inner">
						Linked mentions (influx)
					</div>

				</div>
				<div className="tree-item-flair-outer"><span className="tree-item-flair">6</span></div>


				<div className="search-result-container">


					<div className="search-results-children" >

						{components.map((extended: ExtendedInlinkingFile) => {

							const inlinkedCollapsed = (influxFile.collapsed && !toggled.includes(extended.inlinkingFile.file.basename))
							|| (!influxFile.collapsed && toggled.includes(extended.inlinkingFile.file.basename))

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
									<div className="tree-item-self search-result-file-title is-clickable"
										style={centered ? { width: '160px', minWidth: '160px' } : {}}>

										<div className="tree-item-icon collapse-icon"
											onClick={() => doToggle(extended.inlinkingFile.file.basename)}>
											<svg viewBox="0 0 100 100" className="right-triangle" width="8" height="8">
												<path fill="currentColor" stroke="currentColor" d="M94.9,20.8c-1.4-2.5-4.1-4.1-7.1-4.1H12.2c-3,0-5.7,1.6-7.1,4.1c-1.3,2.4-1.2,5.2,0.2,7.6L43.1,88c1.5,2.3,4,3.7,6.9,3.7 s5.4-1.4,6.9-3.7l37.8-59.6C96.1,26,96.2,23.2,94.9,20.8L94.9,20.8z">
												</path>
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
										<div className="tree-item-flair-outer">
											<span className="tree-item-flair">1</span>
										</div>
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