import { EditorState } from "@codemirror/state";
import { containsMarkdownTable, findInfluxWidgetPosition, isSelectionInMarkdownTable } from "./placement-utils";

function stateFromDoc(doc: string): EditorState {
	return EditorState.create({ doc });
}

function stateWithSelection(doc: string, selectionAnchor: string): EditorState {
	return EditorState.create({
		doc,
		selection: { anchor: doc.indexOf(selectionAnchor) },
	});
}

describe("CM6 placement utils", () => {
	test("places the widget after frontmatter for normal note content", () => {
		const doc = [
			"---",
			"title: Example",
			"---",
			"# Heading",
			"Body",
		].join("\n");

		expect(findInfluxWidgetPosition(stateFromDoc(doc))).toBe(doc.indexOf("# Heading"));
	});

	test("places the widget after a leading markdown table", () => {
		const doc = [
			"---",
			"title: Example",
			"---",
			"| Lorem ipsum | dolor sit amet |",
			"| --- | --- |",
			"| consectetur | [[lorem-ipsum]] |",
			"| sed do | eiusmod tempor |",
			"",
			"## Background",
			"Body",
		].join("\n");

		expect(findInfluxWidgetPosition(stateFromDoc(doc))).toBe(doc.indexOf("## Background"));
	});

	test("places the widget after a leading markdown table without outer pipes", () => {
		const doc = [
			"---",
			"title: Example",
			"---",
			"Lorem ipsum | dolor sit amet",
			"--- | ---",
			"consectetur | [[lorem-ipsum]]",
			"amet | lorem ipsum",
			"adipiscing | dolor sit amet",
			"sed do | eiusmod tempor",
			"Repositories | https://example.com/lorem-ipsum",
			"",
			"## Background",
			"Body",
		].join("\n");

		expect(findInfluxWidgetPosition(stateFromDoc(doc))).toBe(doc.indexOf("## Background"));
	});

	test("places the widget after a table that follows the note title", () => {
		const doc = [
			"---",
			"title: lorem-ipsum - dolor sit amet",
			"---",
			"# lorem-ipsum - dolor sit amet",
			"",
			"Lorem ipsum | dolor sit amet",
			"--- | ---",
			"consectetur | [[lorem-ipsum]]",
			"amet | lorem ipsum",
			"adipiscing | dolor sit amet",
			"sed do | eiusmod tempor",
			"Repositories | https://example.com/lorem-ipsum",
			"",
			"## Background",
			"Body",
		].join("\n");

		expect(findInfluxWidgetPosition(stateFromDoc(doc))).toBe(doc.indexOf("## Background"));
	});

	test("places the widget at the end when the note only contains frontmatter and a table", () => {
		const doc = [
			"---",
			"title: Example",
			"---",
			"| Lorem ipsum | dolor sit amet |",
			"| --- | --- |",
			"| consectetur | [[lorem-ipsum]] |",
		].join("\n");

		expect(findInfluxWidgetPosition(stateFromDoc(doc))).toBe(doc.length);
	});

	test("detects a selection inside a markdown table row", () => {
		const doc = [
			"# lorem-ipsum - dolor sit amet",
			"",
			"Lorem ipsum | dolor sit amet",
			"--- | ---",
			"adipiscing | dolor sit amet",
			"sed do | eiusmod tempor",
		].join("\n");

		expect(isSelectionInMarkdownTable(stateWithSelection(doc, "adipiscing"))).toBe(true);
	});

	test("detects a selection on a blank line between markdown table rows", () => {
		const doc = [
			"# lorem-ipsum - dolor sit amet",
			"",
			"Lorem ipsum | dolor sit amet",
			"--- | ---",
			"",
			"sed do | eiusmod tempor",
		].join("\n");

		expect(isSelectionInMarkdownTable(stateWithSelection(doc, "\n\nsed do"))).toBe(true);
	});

	test("detects a markdown table anywhere in the editor document", () => {
		const doc = [
			"# lorem-ipsum - dolor sit amet",
			"",
			"Lorem ipsum | dolor sit amet",
			"--- | ---",
			"sed do | eiusmod tempor",
			"",
			"## Background",
		].join("\n");

		expect(containsMarkdownTable(stateFromDoc(doc))).toBe(true);
	});

	test("does not detect normal prose as a markdown table", () => {
		const doc = [
			"# Background",
			"",
			"This line has no table.",
			"This line mentions lorem ipsum and dolor sit amet.",
		].join("\n");

		expect(containsMarkdownTable(stateFromDoc(doc))).toBe(false);
	});
});
