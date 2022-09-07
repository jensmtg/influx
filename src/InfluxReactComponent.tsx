import * as React from "react";
import InfluxFile, { ExtendedInlinkingFile } from './InfluxFile';


interface InfluxReactComponentProps { influxFile: InfluxFile }

export default function InfluxReactComponent(props: InfluxReactComponentProps): JSX.Element {


	const { influxFile } = props

	const length = influxFile?.components.length || 0

	return <div className="influx">

		<h3>Influx ({length})</h3>

		{influxFile?.components.map((extended: ExtendedInlinkingFile) => {

			return (
				<div
					key={extended.inlinkingFile.file.basename}
					className="influx-inlinked">
					<div className="influx-inlinked-metacol">

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

					</div>
					<div className="influx-inlinked-entries">
						<h2><span
							dangerouslySetInnerHTML={{ __html: extended.titleInnerHTML }}
						/></h2>
						{extended.inner.map((div: HTMLDivElement, i: number) => (
							<div
								key={i}
								dangerouslySetInnerHTML={{ __html: div.innerHTML }}
								className={"influx-inlinked-entry"}
							/>
						))}
					</div>

				</div>
			)
		})}
	</div>


}