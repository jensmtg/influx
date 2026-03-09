import {
	headingLevelFromTagName,
	normalizeEditorListItems,
} from '@/ui/editor-dom-normalization';
import {
	asHTMLElement,
	createFakeElement,
	createHTMLElementFactory,
	FAKE_NODE_TYPES,
	FakeElement,
	FakeText,
} from '../helpers/fake-dom';

function createHeadingListFixture(): {
	container: FakeElement;
	rootItem: FakeElement;
} {
	const container = createFakeElement('div');
	const list = createFakeElement('ul');
	const item = createFakeElement('li');
	const heading = createFakeElement('h2');
	heading.setAttribute('dir', 'auto');
	heading.setAttribute('data-heading', 'Heading');
	heading.appendChild(new FakeText('Heading'));

	const nestedList = createFakeElement('ul');
	const nestedItem = createFakeElement('li');
	nestedItem.appendChild(new FakeText('child'));
	nestedList.appendChild(nestedItem);

	item.appendChild(new FakeText('\n'));
	item.appendChild(heading);
	item.appendChild(new FakeText('\n'));
	item.appendChild(nestedList);
	list.appendChild(item);
	container.appendChild(list);

	return { container, rootItem: item };
}

function createParagraphWrappedHeadingFixture(): {
	container: FakeElement;
	rootItem: FakeElement;
} {
	const container = createFakeElement('div');
	const list = createFakeElement('ul');
	const item = createFakeElement('li');
	const paragraph = createFakeElement('p');
	const heading = createFakeElement('h3');

	heading.appendChild(new FakeText('Title'));
	paragraph.appendChild(heading);
	item.appendChild(paragraph);
	list.appendChild(item);
	container.appendChild(list);

	return { container, rootItem: item };
}

describe('editor-dom-normalization', () => {
	test('headingLevelFromTagName recognizes heading tags', () => {
		expect(headingLevelFromTagName('h1')).toBe(1);
		expect(headingLevelFromTagName('H6')).toBe(6);
		expect(headingLevelFromTagName('div')).toBeNull();
		expect(headingLevelFromTagName('h9')).toBeNull();
	});

	test('normalizeEditorListItems preserves heading semantics and nested content for list-leading headings', () => {
		const { container, rootItem } = createHeadingListFixture();

		normalizeEditorListItems(asHTMLElement(container), createHTMLElementFactory());

		const firstChild = rootItem.firstElementChild;
		expect(firstChild).not.toBeNull();
		expect(firstChild?.tagName).not.toBe('H2');
		expect(firstChild?.getAttribute('role')).toBe('heading');
		expect(firstChild?.getAttribute('aria-level')).toBe('2');
		expect(firstChild?.textContent).toBe('Heading');
		expect(rootItem.children.some((child) => child.tagName === 'UL')).toBe(true);
		expect(rootItem.textContent).toContain('child');
		expect(rootItem.childNodes.toArray().some((node) => node.nodeType === FAKE_NODE_TYPES.TEXT && !node.textContent.trim())).toBe(false);
	});

	test('normalizeEditorListItems unwraps paragraph-wrapped headings without leaving extra wrappers', () => {
		const { container, rootItem } = createParagraphWrappedHeadingFixture();

		normalizeEditorListItems(asHTMLElement(container), createHTMLElementFactory());

		expect(rootItem.firstElementChild?.tagName).not.toBe('H3');
		expect(rootItem.firstElementChild?.getAttribute('role')).toBe('heading');
		expect(rootItem.firstElementChild?.getAttribute('aria-level')).toBe('3');
		expect(rootItem.firstElementChild?.textContent).toBe('Title');
		expect(rootItem.children.some((child) => child.tagName === 'P')).toBe(false);
		expect(rootItem.children).toHaveLength(1);
	});
});
