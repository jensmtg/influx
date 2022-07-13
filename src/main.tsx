import { Plugin, Vault, Workspace, MarkdownView, MarkdownRenderer, MarkdownPostProcessorContext, PluginSettingTab, Setting } from 'obsidian';
import * as React from "react";
import { createRoot } from "react-dom/client";
import { getInlinkedPages, makeSubtrees } from './utils';

const ReactApp = (props: any) => {

	const { data } = props

	const [components, setComponents] = React.useState(null)

	const renderMarkdownBlock = async (_reparse: string) => {
		const mdDiv = document.createElement('div');
		mdDiv.style.display = 'hidden';
		document.body.appendChild(mdDiv);
		await MarkdownRenderer.renderMarkdown(_reparse, mdDiv, '/', null)
		return mdDiv
	}

	const renderAllMarkdownBlocks = async () => {
		return await Promise.all(data.map(async (p: any) => {

			// Parse title, and strip innerHTML of enclosing <p>:
			const titleAsMd = await renderMarkdownBlock(p.title)
			const titleInnerHTML = titleAsMd.innerHTML.slice(3, -4)

			return {
				...p,
				titleInnerHTML: titleInnerHTML,
				inner: await Promise.all(p.reparse.map(async (reparse: string) => await renderMarkdownBlock(reparse)
				))
			}
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

	console.log('comp', components)

	if (components) {
		return <div

		>
			{components.map((p: any) => {

				return <div key={p.fileName}>
					<h2>{p.fileName} &nbsp; 
					<span
					style={{opacity: 0.5}}
					dangerouslySetInnerHTML={{ __html: p.titleInnerHTML }}
					/>
					</h2>
					{p.inner.map((div: any, i: number) => (
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


interface MyPluginSettings {
	mySetting: string;
}

// const DEFAULT_SETTINGS: MyPluginSettings = {
// 	mySetting: 'default'
// }

export default class ObsidianInflux extends Plugin {

	settings: MyPluginSettings;
	vault: Vault;
	workspace: Workspace;
	data: any;
	dv: any;
	anchor: any;


	async onload() {

		this.vault = this.app.vault;
		this.workspace = this.app.workspace;
		this.dv = this.getDataviewPluginIfEnabled()


		// this.addRibbonIcon("diagram", "Devrun", () => this.prepareData());
		this.addCommand({
			id: 'devrun',
			name: 'devrun',
			callback: () => {
				// this.prepareData()
				// this.addButtonInEdit(app)
			}
		})


		this.registerMarkdownCodeBlockProcessor('influx', async (source, el, ctx) => {
			this.awaitDataviewPluginInitialized(
				() => this.processInfluxCodeblock(source, el, ctx)
			)
		})

		this.registerMarkdownCodeBlockProcessor('influx__DEPR1', async (source, el, ctx) => {

			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView && activeView.editor && this.dv) {

				const page = this.dv.page(activeView.file.path)

				const inlinkedPages = getInlinkedPages(this.dv, page)
				const data = await makeSubtrees(this.dv, page, inlinkedPages)

				

				const div = el.createEl("div");
				this.anchor = createRoot(div)
				this.anchor.render(<ReactApp data={data} view={activeView} />);

			}

		})

	}


	async processInfluxCodeblock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {

		if (el && ctx.sourcePath && this.dv) {

			const page = await this.dv.page(ctx.sourcePath)
			
			const inlinkedPages = getInlinkedPages(this.dv, page)
			const data = await makeSubtrees(this.dv, page, inlinkedPages)

			const div = el.createEl("div");
			this.anchor = createRoot(div)
			this.anchor.render(<ReactApp data={data} />);

		}
	}


	/** Help wait until dataview is done indexing before rendering 
	 * code blocks that depend on dataview.
	 */
	async awaitDataviewPluginInitialized(delayedFunction: () => void) {
		if (!this.dv) {
			return false
		}
		else if (this.dv?.index?.initialized !== true) {
			window.setTimeout(() => this.awaitDataviewPluginInitialized(delayedFunction), 100);
		} else {
			await delayedFunction()
		}
	}


	getDataviewPluginIfEnabled() {
		if (this.app.plugins.enabledPlugins.has('dataview')
			&& this.app.plugins.plugins.dataview?.api) {
			return this.app.plugins.plugins.dataview.api
		}
		else {
			return null
		}
	}


	async onunload() {
		if (this.anchor) {
			this.anchor.unmount();
		}
	}

}


