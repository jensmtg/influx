import { Plugin, Vault, Workspace, MarkdownView, MarkdownRenderer } from 'obsidian';
import * as React from "react";
import { createRoot } from "react-dom/client";
import { getInlinkedPages, makeSubtrees } from './utils';

const ReactApp = (props: any) => {

	const { data, view } = props

	const [components, setComponent] = React.useState(null)

	const getMd = async (_reparse: string) => {
		const mdDiv = document.createElement('div');
		mdDiv.style.display = 'hidden';
		document.body.appendChild(mdDiv);
		await MarkdownRenderer.renderMarkdown(_reparse, mdDiv, '/', view)
		return mdDiv
	}

	const rebaked = async () => {
		return await Promise.all(data.map(async (p: any) => {
			return {
				...p,
				inner: await getMd(p.reparse)
			}
		}))
	}

	React.useEffect(() => {
		(async () => {
			if (!components) {
				const x = await rebaked()
				setComponent(x)
			}
		})();
	}, [components])


	if (components) {
		return <div 

		>
			{components.map((p: any) => {

				return <div key={p.fileName}>
					<h2>{p.fileName}</h2>
					<div dangerouslySetInnerHTML={{__html: p.inner.innerHTML}} 
					className={"dvutil"} />
				</div>
			})}
		</div>
	}

	else {
		return null
	}

}


export default class DiagramsNet extends Plugin {


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


		this.registerMarkdownCodeBlockProcessor('crossmark', async (source, el) => {

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


