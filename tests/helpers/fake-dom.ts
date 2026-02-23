export const FAKE_NODE_TYPES = {
	ELEMENT: 1,
	TEXT: 3,
} as const;

export class FakeClassList {
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

export class FakeStyle {
	private values = new Map<string, string>();

	setProperty(name: string, value: string, priority?: string): void {
		const normalizedPriority = priority ? ` !${priority}` : '';
		this.values.set(name, `${value}${normalizedPriority}`);
	}

	getPropertyValue(name: string): string {
		return this.values.get(name) ?? '';
	}
}

export class FakeNodeList {
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

export class FakeNode {
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

export class FakeText extends FakeNode {
	constructor(text: string) {
		super(FAKE_NODE_TYPES.TEXT, text);
	}
}

export class FakeElement extends FakeNode {
	tagName: string;
	classList = new FakeClassList();
	style = new FakeStyle();
	childNodes = new FakeNodeList();
	private attrs = new Map<string, string>();

	constructor(tagName: string) {
		super(FAKE_NODE_TYPES.ELEMENT, '');
		this.tagName = tagName.toUpperCase();
	}

	get firstChild(): FakeNode | null {
		return this.childNodes.item(0) ?? null;
	}

	get firstElementChild(): FakeElement | null {
		return this.children[0] ?? null;
	}

	get children(): FakeElement[] {
		return this.childNodes.toArray().filter((node): node is FakeElement => node.nodeType === FAKE_NODE_TYPES.ELEMENT) as FakeElement[];
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

export function createFakeElement(tagName: string): FakeElement {
	return new FakeElement(tagName);
}

export function asHTMLElement(element: FakeElement): HTMLElement {
	return element as unknown as HTMLElement;
}

export function createHTMLElementFactory(): (tagName: string) => HTMLElement {
	return (tagName: string) => asHTMLElement(createFakeElement(tagName));
}
