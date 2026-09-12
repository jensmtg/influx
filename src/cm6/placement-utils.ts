import { EditorState } from "@codemirror/state";

function isFrontmatterFence(text: string): boolean {
	return text.trim() === "---";
}

function markdownTableCells(text: string): string[] | null {
	const cells: string[] = [];
	let currentCell = "";
	let separatorCount = 0;

	for (let index = 0; index < text.length; index++) {
		const character = text[index];
		if (character === "|" && (index === 0 || text[index - 1] !== "\\")) {
			cells.push(currentCell.trim());
			currentCell = "";
			separatorCount++;
			continue;
		}
		currentCell += character;
	}
	cells.push(currentCell.trim());

	if (separatorCount === 0) {
		return null;
	}
	if (cells[0] === "") {
		cells.shift();
	}
	if (cells[cells.length - 1] === "") {
		cells.pop();
	}

	return cells.length >= 2 ? cells : null;
}

function isMarkdownTableRow(text: string): boolean {
	return markdownTableCells(text) !== null;
}

function isMarkdownTableDelimiterRow(text: string): boolean {
	const cells = markdownTableCells(text);
	return Boolean(cells?.length && cells.every(cell => /^:?-{3,}:?$/.test(cell)));
}

function isLineInMarkdownTable(state: EditorState, lineNumber: number): boolean {
	const { doc } = state;
	if (lineNumber < 1 || lineNumber > doc.lines || !isMarkdownTableRow(doc.line(lineNumber).text)) {
		return false;
	}

	let firstRow = lineNumber;
	while (firstRow > 1 && isMarkdownTableRow(doc.line(firstRow - 1).text)) {
		firstRow--;
	}

	let lastRow = lineNumber;
	while (lastRow < doc.lines && isMarkdownTableRow(doc.line(lastRow + 1).text)) {
		lastRow++;
	}

	// Markdown tables need a header followed by a delimiter row. Requiring that
	// structure prevents escaped pipes in link labels and image sizes from being
	// mistaken for tables.
	for (let row = firstRow + 1; row <= lastRow; row++) {
		if (isMarkdownTableDelimiterRow(doc.line(row).text)) {
			return true;
		}
	}

	return false;
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
	if (lineNumber > doc.lines || !isLineInMarkdownTable(state, lineNumber)) {
		return null;
	}

	while (lineNumber <= doc.lines && isLineInMarkdownTable(state, lineNumber)) {
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
		if (isLineInMarkdownTable(state, line.number)) {
			return true;
		}

		const previousLine = line.number > 1 ? doc.line(line.number - 1) : null;
		const nextLine = line.number < doc.lines ? doc.line(line.number + 1) : null;

		return line.text.trim() === "" && Boolean(
			(previousLine && isLineInMarkdownTable(state, previousLine.number)) ||
			(nextLine && isLineInMarkdownTable(state, nextLine.number))
		);
	});
}

export function containsMarkdownTable(state: EditorState): boolean {
	const { doc } = state;
	for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber++) {
		if (
			isMarkdownTableDelimiterRow(doc.line(lineNumber).text) &&
			isMarkdownTableRow(doc.line(lineNumber - 1).text)
		) {
			return true;
		}
	}
	return false;
}

/**
 * Whether Influx should be suppressed while editing a table. The caret must be
 * in a real Markdown table. A table somewhere else in the note is safe and
 * must not hide the whole Influx section. On mobile this check is especially useful:
 * IME/autocorrect composition produces rapid doc changes, and tap-to-move caret
 * changes the selection without changing the document, so suppression must be
 * checked cheaply and synchronously rather than only after doc-settle debounces.
 */
export function shouldSuppressInfluxForTableEditing(state: EditorState): boolean {
	return isSelectionInMarkdownTable(state);
}
