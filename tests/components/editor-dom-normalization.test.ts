import {
	headingLevelFromTagName,
	normalizeEditorListItems,
} from '../../src/components/ui/editor-dom-normalization';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

class FakeClassList {
	private values = new Set<string>();

	add(...tokens: string[]): void {
		for (const token of tokens) {
			if (token) {
				this.values.add(token);
			}
		}
	}

	remove(...tokens: string[]): void {
		for (const token of tokens) {
			this.values.delete(token);
		}
	}

	contains(token: string): boolean {
		return this.values.has(token);
	}

	get length(): number {
		return this.values.size;
	}

	item(index: number): string | null {
		const items = Array.from(this.values);
		return items[index] ?? null;
	}
}

class FakeStyle {
	private values = new Map<string, string>();

	setProperty(name: string, value: string, priority?: string): void {
		const normalizedPriority = priority ? ` !${priority}` : '';
		this.values.set(name, `${value}${normalizedPriority}`);
	}

	getPropertyValue(name: string): string {
		return this.values.get(name) ?? '';
	}
}

class FakeNodeList {
	private nodes: FakeNode[] = [];

	get length(): number {
		return this.nodes.length;
	}

	item(index: number): FakeNode {
		return this.nodes[index];
	}

	push(node: FakeNode): void {
		this.nodes.push(node);
	}

	insert(index: number, node: FakeNode): void {
		this.nodes.splice(index, 0, node);
	}

	remove(node: FakeNode): void {
		const index = this.nodes.indexOf(node);
		if (index >= 0) {
			this.nodes.splice(index, 1);
		}
	}

	toArray(): FakeNode[] {
		return [...this.nodes];
	}
}

class FakeNode {
	nodeType: number;
	parentNode: FakeElement | null = null;
	private value: string;

	constructor(nodeType: number, text: string) {
		this.nodeType = nodeType;
		this.value = text;
	}

	get textContent(): string {
		return this.value;
	}

	set textContent(value: string) {
		this.value = value;
	}
}

class FakeText extends FakeNode {
	constructor(text: string) {
		super(TEXT_NODE, text);
	}
}

class FakeElement extends FakeNode {
	tagName: string;
	classList = new FakeClassList();
	style = new FakeStyle();
	childNodes = new FakeNodeList();
	private attrs = new Map<string, string>();

	constructor(tagName: string) {
		super(ELEMENT_NODE, '');
		this.tagName = tagName.toUpperCase();
	}

	get firstChild(): FakeNode | null {
		return this.childNodes.item(0) ?? null;
	}

	get firstElementChild(): FakeElement | null {
		return this.children[0] ?? null;
	}

	get children(): FakeElement[] {
		return this.childNodes.toArray().filter((node): node is FakeElement => node.nodeType === ELEMENT_NODE) as FakeElement[];
	}

	override get textContent(): string {
		return this.childNodes
			.toArray()
			.map((node) => node.textContent)
			.join('');
	}

	appendChild(node: FakeNode): FakeNode {
		if (node.parentNode) {
			node.parentNode.removeChild(node);
		}
		this.childNodes.push(node);
		node.parentNode = this;
		return node;
	}

	insertBefore(node: FakeNode, referenceNode: FakeNode): FakeNode {
		if (node.parentNode) {
			node.parentNode.removeChild(node);
		}
		const index = this.childNodes.toArray().indexOf(referenceNode);
		if (index < 0) {
			this.childNodes.push(node);
		} else {
			this.childNodes.insert(index, node);
		}
		node.parentNode = this;
		return node;
	}

	removeChild(node: FakeNode): FakeNode {
		this.childNodes.remove(node);
		node.parentNode = null;
		return node;
	}

	replaceWith(node: FakeNode): void {
		if (!this.parentNode) {
			return;
		}
		this.parentNode.insertBefore(node, this);
		this.parentNode.removeChild(this);
	}

	remove(): void {
		if (this.parentNode) {
			this.parentNode.removeChild(this);
		}
	}

	setAttribute(name: string, value: string): void {
		this.attrs.set(name, value);
	}

	getAttribute(name: string): string | null {
		return this.attrs.get(name) ?? null;
	}

	matches(selector: string): boolean {
		const tag = this.tagName.toLowerCase();
		return selector
			.split(',')
			.map((part) => part.trim().toLowerCase())
			.filter(Boolean)
			.includes(tag);
	}

	querySelectorAll(selector: string): FakeElement[] {
		const normalized = selector.trim().toLowerCase();
		if (!normalized) {
			return [];
		}
		const results: FakeElement[] = [];
		const visit = (element: FakeElement): void => {
			for (const child of element.children) {
				if (child.tagName.toLowerCase() === normalized) {
					results.push(child);
				}
				visit(child);
			}
		};
		visit(this);
		return results;
	}
}

function createElement(tagName: string): FakeElement {
	return new FakeElement(tagName);
}

function createHeadingListFixture(): {
	container: FakeElement;
	rootItem: FakeElement;
	heading: FakeElement;
} {
	const container = createElement('div');
	const list = createElement('ul');
	const item = createElement('li');
	const heading = createElement('h2');
	heading.setAttribute('dir', 'auto');
	heading.setAttribute('data-heading', 'Heading');
	heading.appendChild(new FakeText('Heading'));
	const nestedList = createElement('ul');
	const nestedItem = createElement('li');
	nestedItem.appendChild(new FakeText('child'));
	nestedList.appendChild(nestedItem);

	item.appendChild(new FakeText('\n'));
	item.appendChild(heading);
	item.appendChild(new FakeText('\n'));
	item.appendChild(nestedList);
	list.appendChild(item);
	container.appendChild(list);

	return { container, rootItem: item, heading };
}

describe('editor-dom-normalization', () => {
	test('headingLevelFromTagName recognizes heading tags', () => {
		expect(headingLevelFromTagName('h1')).toBe(1);
		expect(headingLevelFromTagName('H6')).toBe(6);
		expect(headingLevelFromTagName('div')).toBeNull();
		expect(headingLevelFromTagName('h9')).toBeNull();
	});

	test('normalizeEditorListItems converts list-leading heading into inline span', () => {
		const { container, rootItem } = createHeadingListFixture();

		normalizeEditorListItems(container as unknown as HTMLElement, (tag) => createElement(tag) as unknown as HTMLElement);

		const firstChild = rootItem.firstElementChild;
		expect(firstChild).not.toBeNull();
		expect(firstChild?.tagName).toBe('SPAN');
		expect(firstChild?.getAttribute('role')).toBe('heading');
		expect(firstChild?.getAttribute('aria-level')).toBe('2');
		expect(firstChild?.classList.contains('influx-inline-heading')).toBe(true);
		expect(firstChild?.style.getPropertyValue('display')).toBe('inline !important');
		expect(rootItem.classList.contains('influx-li-leading-heading')).toBe(true);
		expect(rootItem.style.getPropertyValue('display')).toBe('list-item !important');
		expect(rootItem.childNodes.toArray().some((node) => node.nodeType === TEXT_NODE && !node.textContent.trim())).toBe(false);
	});

	test('normalizeEditorListItems unwraps paragraph-wrapped heading and marks heading-only items', () => {
		const container = createElement('div');
		const list = createElement('ul');
		const item = createElement('li');
		const paragraph = createElement('p');
		const heading = createElement('h3');
		heading.appendChild(new FakeText('Title'));
		paragraph.appendChild(heading);
		item.appendChild(paragraph);
		list.appendChild(item);
		container.appendChild(list);

		normalizeEditorListItems(container as unknown as HTMLElement, (tag) => createElement(tag) as unknown as HTMLElement);

		expect(item.firstElementChild?.tagName).toBe('SPAN');
		expect(item.children.some((child) => child.tagName === 'P')).toBe(false);
		expect(item.classList.contains('influx-li-leading-heading')).toBe(true);
		expect(item.classList.contains('influx-li-heading-only')).toBe(true);
	});
});
