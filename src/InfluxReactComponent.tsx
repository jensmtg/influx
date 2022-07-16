import * as React from "react";
import { MarkdownRenderer } from 'obsidian';
import InfluxFile, { InlinkingFile } from './InfluxFile';

interface InfluxReactComponentProps { influxFile: InfluxFile }
type ExtendedInlinkingFile = { 
	inlinkingFile: InlinkingFile;
	titleInnerHTML: string;
	inner: HTMLDivElement[];
}

export default function InfluxReactComponent (props: InfluxReactComponentProps) {

	const { influxFile } = props

	console.log('inf', influxFile)

	const [components, setComponents] = React.useState(null)

	const renderMarkdownBlock = async (md: string) => {
		const mdDiv = document.createElement('div');
		mdDiv.style.display = 'hidden';
		document.body.appendChild(mdDiv);
		await MarkdownRenderer.renderMarkdown(md, mdDiv, '/', null)
		return mdDiv
	}

	const renderAllMarkdownBlocks = async () => {
		return await Promise.all(influxFile.inlinkingFiles.map(async (inlinkingFile) => {

			// Parse title, and strip innerHTML of enclosing <p>:
			const titleAsMd = await renderMarkdownBlock(inlinkingFile.title)
			const titleInnerHTML = titleAsMd.innerHTML.slice(3, -4)

			const extended : ExtendedInlinkingFile = {
				inlinkingFile: inlinkingFile,
				titleInnerHTML: titleInnerHTML,
				inner: await Promise.all(inlinkingFile.contextSummaries.map(async (summary) => await renderMarkdownBlock(summary))),
			}

			return extended
		}))
	}

	React.useEffect(() => {
		(async () => {
			if (!components) {
				const dataWithInnerHtml = await renderAllMarkdownBlocks()
				setComponents(dataWithInnerHtml)
			}
		})();
	}, [components])

	// console.log('comp', components)

	if (components) {
		return <div

		>
			{components.map((extended: ExtendedInlinkingFile) => {

				return <div key={extended.inlinkingFile.file.basename}>
					<h2>{extended.inlinkingFile.file.basename} &nbsp; 
					<span
					style={{opacity: 0.5}}
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

	else {
		return null
	}

}