import * as React from "react";
import InfluxFile, { ExtendedInlinkingFile } from './InfluxFile';
import { ObsidianInfluxSettings } from "./main";
import { createUseStyles } from 'react-jss'


interface StyleProps {
	theme: string;
	centered: boolean;
	margin: number;
	fontSize: number;
	lineHeight: number;
	largeFontSize: number;
	largeLineHeight: number;
}

const useStyles = createUseStyles({

	root: {
		fontSize: (props: StyleProps) => `${props.fontSize}px`,
		lineHeight: props => `${props.lineHeight}px`,
		padding: '8px',
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
		marginRight:  props => `${props.fontSize}px`,
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
		display: 'flex',
		flexDirection: 'column',
		borderRight: '1px dotted #ccc',
		paddingRight: '1rem',
	} : {
		borderTop: '1px dashed #ccc',
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
		paddingLeft: '1rem'
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
			marginBlockEnd: props => `-${props.lineHeight}px !important`,
		},
		'& li:nth-child(1)': {
			marginBlockStart: props => `-${props.lineHeight}px !important`,
		},
		'&> ul': {
			marginTop: props => `${0}px`,
		}
	}
})

interface InfluxReactComponentProps { influxFile: InfluxFile }

export default function InfluxReactComponent(props: InfluxReactComponentProps): JSX.Element {


	const { influxFile } = props

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
		lineHeight: sizing + sizing/2,
		largeFontSize: sizing, // sizing + 2,
		largeLineHeight: sizing + sizing/2, // sizing + 4,

	}

	const [isOpen, setIsOpen] = React.useState(true)

	const classes = useStyles(styleProps)

	const hiddenLength = isOpen ? length - shownLength : length


	return <div className={classes.root}>

		<h3>
			<span 
			className={classes.openerButton}
			onClick={() => setIsOpen(!isOpen)}
			>{isOpen ? '➖' : '➕' }</span>
			{`Influx (${length}${hiddenLength > 0 ? ', ' + hiddenLength.toString() + ' hidden' : ''})`}</h3>

		{!isOpen ? null : influxFile?.components.map((extended: ExtendedInlinkingFile) => {

			const entryHeader = extended.titleInnerHTML ? (
				<h2>
					<span
						dangerouslySetInnerHTML={{ __html: extended.titleInnerHTML }}
					/>
				</h2>
				): null

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