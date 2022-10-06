import * as React from "react";
import InfluxFile from './InfluxFile';
import { ExtendedInlinkingFile } from './apiAdapter';
import { ObsidianInfluxSettings } from "./main";
import { TFile } from "obsidian";
import { StyleSheetType } from "./createStyleSheet";
// import { ChakraProvider, Box, Text } from '@chakra-ui/react'


interface InfluxReactComponentProps { influxFile: InfluxFile, rand: number, preview: boolean, sheet: StyleSheetType }

export default function InfluxReactComponent(props: InfluxReactComponentProps): JSX.Element {

	const {
		influxFile,
		preview,
		sheet,
		// rand,
	} = props

	const [components, setComponents] = React.useState(influxFile.components)
	const [stylesheet, setStyleSheet] = React.useState(sheet)

	const callback: (op: string, file: TFile, stylesheet: StyleSheetType) => void = async (op, file, stylesheet) => {
		// TODO: Add change diff for file vs this file. (Is file part of inlinked? Or referenced in inlinked?)
		setStyleSheet(stylesheet)
		await influxFile.makeInfluxList()
		setComponents(await influxFile.renderAllMarkdownBlocks())
	}


	React.useEffect(() => {
		if (preview === false) {
			influxFile.influx.registerInfluxComponent(influxFile.id, callback)

		}
		return () => {
		}
	}, [])

	const classes = stylesheet.classes

	const length = influxFile?.inlinkingFiles.length || 0
	const shownLength = influxFile?.components.length || 0

	const settings: Partial<ObsidianInfluxSettings> = influxFile.api.getSettings()

	const centered = settings.variant !== 'ROWS'


	const [isOpen, setIsOpen] = React.useState(!influxFile.collapsed)

	const hiddenLength = isOpen ? length - shownLength : length


	if (!influxFile.show) {
		return null
	}

	return <div className={classes.root}>

		<h3>
			<span
				className={classes.openerButton}
				onClick={() => setIsOpen(!isOpen)}
			>{isOpen ? '➖' : '➕'}</span>
			{`Influx (${length}${hiddenLength > 0 ? ', ' + hiddenLength.toString() + ' hidden' : ''})`}</h3>

		{!isOpen ? null : components.map((extended: ExtendedInlinkingFile) => {

			const entryHeader = settings.entryHeaderVisible && extended.titleInnerHTML && !extended.inlinkingFile.isLinkInTitle ? (
				<h2>
					<span
						dangerouslySetInnerHTML={{ __html: extended.titleInnerHTML }}
					/>
				</h2>
			) : null

			return (
				<div
					key={extended.inlinkingFile.file.basename}
					className={classes.inlinked}
				>

					<div
						className={classes.inlinkedMetaDiv}
					>

						<a
							data-href={extended.inlinkingFile.file.basename}
							href={extended.inlinkingFile.file.basename}
							className="internal-link"
							target="_blank"
							rel="noopener"
						>
							<h2>
								{extended.inlinkingFile.file.basename}
							</h2>
						</a>

						{centered ? null : entryHeader}

					</div>

					<div
						className={classes.inlinkedEntries}
					>
						{centered ? entryHeader : null}

						{extended.inner.map((div: HTMLDivElement, i: number) => (
							<div
								key={i}
								dangerouslySetInnerHTML={{ __html: div.innerHTML }}
								className={classes.inlinkedEntry}
							/>
						))}
					</div>

				</div>
			)
		})}

		<style
			dangerouslySetInnerHTML={{ __html: stylesheet.toString() }}
		/>

	</div>
}