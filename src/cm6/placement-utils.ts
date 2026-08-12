import { EditorState } from "@codemirror/state";

function isFrontmatterFence(text: string): boolean {
	return text.trim() === "---";
}

function isMarkdownTableRow(text: string): boolean {
	const trimmed = text.trim();
	return trimmed.includes("|") && trimmed.split("|").length > 1;
}

function isMarkdownHeading(text: string): boolean {
	return /^#{1,6}\s+/.test(text.trim());
}

function skipBlankLines(state: EditorState, lineNumber: number): number {
	const { doc } = state;
	while (lineNumber <= doc.lines && doc.line(lineNumber).text.trim() === "") {
		lineNumber++;
	}
	return lineNumber;
}

function positionAfterTableStartingAt(state: EditorState, lineNumber: number): number | null {
	const { doc } = state;
	if (lineNumber > doc.lines || !isMarkdownTableRow(doc.line(lineNumber).text)) {
		return null;
	}

	while (lineNumber <= doc.lines && isMarkdownTableRow(doc.line(lineNumber).text)) {
		lineNumber++;
	}

	lineNumber = skipBlankLines(state, lineNumber);
	return lineNumber <= doc.lines ? doc.line(lineNumber).from : doc.length;
}

export function findInfluxWidgetPosition(state: EditorState): number {
	const { doc } = state;
	let lineNumber = 1;

	if (doc.lines > 0 && isFrontmatterFence(doc.line(1).text)) {
		lineNumber = 2;
		while (lineNumber <= doc.lines) {
			if (isFrontmatterFence(doc.line(lineNumber).text)) {
				lineNumber++;
				break;
			}
			lineNumber++;
		}
	}

	const firstContentLine = skipBlankLines(state, lineNumber);

	const positionAfterLeadingTable = positionAfterTableStartingAt(state, firstContentLine);
	if (positionAfterLeadingTable !== null) {
		return positionAfterLeadingTable;
	}

	if (firstContentLine <= doc.lines && isMarkdownHeading(doc.line(firstContentLine).text)) {
		const lineAfterHeading = skipBlankLines(state, firstContentLine + 1);
		const positionAfterTableAfterHeading = positionAfterTableStartingAt(state, lineAfterHeading);
		if (positionAfterTableAfterHeading !== null) {
			return positionAfterTableAfterHeading;
		}
	}

	return lineNumber <= doc.lines ? doc.line(lineNumber).from : doc.length;
}

export function isSelectionInMarkdownTable(state: EditorState): boolean {
	const { doc, selection } = state;
	const ranges = [selection.main.anchor, selection.main.head];

	return ranges.some((position) => {
		const line = doc.lineAt(position);
		if (isMarkdownTableRow(line.text)) {
			return true;
		}

		const previousLine = line.number > 1 ? doc.line(line.number - 1) : null;
		const nextLine = line.number < doc.lines ? doc.line(line.number + 1) : null;

		return Boolean(
			previousLine && nextLine &&
			isMarkdownTableRow(previousLine.text) &&
			isMarkdownTableRow(nextLine.text)
		);
	});
}

export function containsMarkdownTable(state: EditorState): boolean {
	const { doc } = state;
	for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
		if (isMarkdownTableRow(doc.line(lineNumber).text)) {
			return true;
		}
	}
	return false;
}
