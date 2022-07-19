import * as React from "react";
import InfluxFile, { ExtendedInlinkingFile } from './InfluxFile';


interface InfluxReactComponentProps { influxFile: InfluxFile }

export default function InfluxReactComponent(props: InfluxReactComponentProps): JSX.Element {


	const { influxFile } = props

	
		return <div>
			{influxFile?.components.map((extended: ExtendedInlinkingFile) => {

				return <div key={extended.inlinkingFile.file.basename}>
					<h2>{extended.inlinkingFile.file.basename} &nbsp;
						<span
							style={{ opacity: 0.5 }}
							dangerouslySetInnerHTML={{ __html: extended.titleInnerHTML }}
						/>
					</h2>
					{extended.inner.map((div: HTMLDivElement, i: number) => (
						<div
							key={i}
							dangerouslySetInnerHTML={{ __html: div.innerHTML }}
							className={"dvutil"}
						/>
					))}

				</div>
			})}
		</div>
	

}