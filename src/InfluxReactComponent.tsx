import * as React from "react";
import InfluxFile from './InfluxFile';
import { ExtendedInlinkingFile } from './apiAdapter';
import { ObsidianInfluxSettings } from "./main";
import { createUseStyles } from 'react-jss'
import { TFile } from "obsidian";


interface StyleProps {
	theme: string;
	centered: boolean;
	margin: number;
	fontSize: number;
	lineHeight: number;
	largeFontSize: number;
	largeLineHeight: number;
	preview: boolean;
}

const useStyles = createUseStyles({

	root: {
		// border: '1px solid pink',
		fontSize: (props: StyleProps) => `${props.fontSize}px`,
		lineHeight: props => `${props.lineHeight}px`,
		padding: '8px',
		paddingRight: '0',
		maxWidth: props => !props.preview ? `calc(var(--line-width-adaptive) - var(--folding-offset))` : '',
		marginLeft: props => !props.preview ? `max(calc(50% + var(--folding-offset) - var(--line-width-adaptive)/ 2),calc(50% + var(--folding-offset) - var(--max-width)/ 2)) !important` : '',
		display: 'flex',
		flexDirection: 'column',
		'& h2': {
			fontSize: props => `${props.largeFontSize}px`,
			lineHeight: props => `${props.largeLineHeight}px`,
		},
		'& h3': {
			fontSize: props => `${props.fontSize}px`,
			lineHeight: props => `${props.lineHeight}px`,
			textTransform: 'uppercase',
			letterSpacing: '2px',
			margin: 0,
			color: 'lightsteelblue',
		},
	},

	openerButton: {
		marginRight: props => `${props.fontSize}px`,
		cursor: 'pointer',
	},

	inlinked: {
		display: 'flex',
		marginTop: props => `${props.margin}px`,
		marginBottom: props => props.centered ? `${props.margin}px` : '',
		flexDirection: props => props.centered ? 'row' : 'column',
	},

	inlinkedMetaDiv: props => props.centered ? {
		width: '160px',
		minWidth: '160px',
		display: 'flex',
		flexDirection: 'column',
		borderRight: '1px dashed lightsteelblue',
		paddingRight: '1rem',
	} : {
		borderTop: '1px dashed lightsteelblue',
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',
		// backgroundColor: '#fafafa'
	},

	inlinkedEntries: {
		width: '100%',
		flexGrow: 1,
		display: 'flex',
		flexDirection: 'column',
		paddingLeft: '1rem',
		'& h2': {
			marginTop: '9px',
			marginBottom: '9px',

		}
	},

	inlinkedEntry: {
		paddingLeft: '8px',
		marginLeft: '8px',
		paddingBottom: props => `${props.lineHeight}px !important`,
		'& input[type=checkbox]': {
			width: props => `${props.fontSize}px`,
			height: props => `${props.fontSize}px`,
			marginTop: props => `-${props.margin + 2}px`,
		},
		'& *': {
			marginBlockEnd: props => !props.preview ? `-${props.lineHeight}px !important` : '',
		},
		'& li:nth-child(1)': {
			marginBlockStart: props => !props.preview ? `-${props.lineHeight}px !important` : '',
		},
		'&> ul': {
			marginTop: props => `${0}px`,
		}
	}
})

interface InfluxReactComponentProps { influxFile: InfluxFile, rand: number, preview: boolean }

export default function InfluxReactComponent(props: InfluxReactComponentProps): JSX.Element {

	const {
		influxFile,
		preview,
		// rand,
	} = props

	// const [ident, setIdent] = React.useState(rand)
	const [components, setComponents] = React.useState(influxFile.components)

	const callback: (op: string, file: TFile) => void = async (op, file) => {
		// TODO: Add change diff for file vs this file. (Is file part of inlinked? Or referenced in inlinked?)
		// setIdent(Math.random())
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


	const length = influxFile?.inlinkingFiles.length || 0
	const shownLength = influxFile?.components.length || 0

	const settings: Partial<ObsidianInfluxSettings> = influxFile.api.getSettings()

	const sizing = settings.fontSize || 13
	const centered = settings.variant !== 'ROWS'

	const styleProps: StyleProps = {
		theme: '',
		centered: centered,
		margin: sizing,
		fontSize: sizing,
		lineHeight: sizing + sizing / 2,
		largeFontSize: sizing, // sizing + 2,
		largeLineHeight: sizing + sizing / 2, // sizing + 4,
		preview: props.preview,

	}

	const [isOpen, setIsOpen] = React.useState(!influxFile.collapsed)

	const classes = useStyles(styleProps)

	const hiddenLength = isOpen ? length - shownLength : length

	// console.log('show', influxFile.show)

	if (!influxFile.show) {
		return null
	}

	return <div className={classes.root}>

		{/* <p>{ident.toString()}</p> */}
		<h3>
			<span
				className={classes.openerButton}
				onClick={() => setIsOpen(!isOpen)}
			>{isOpen ? '➖' : '➕'}</span>
			{`Influx (${length}${hiddenLength > 0 ? ', ' + hiddenLength.toString() + ' hidden' : ''})`}</h3>

		{!isOpen ? null : components.map((extended: ExtendedInlinkingFile) => {

			const entryHeader = extended.titleInnerHTML ? (
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
	</div>


}