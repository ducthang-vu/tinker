// The renderer: the only place that touches the DOM.
//
// Today this is a thin layer over the browser's DOM API, and DomRenderer is
// its only implementation. It exists to keep the door open: directives (and
// later the template engine) never call `document` directly, they go through
// a Renderer. That way Tinker can render to other targets in the future
// (server-side HTML strings, a canvas, native views, a test or logging
// renderer) by adding another implementation, without touching the code
// that uses it. Angular's Renderer2 follows the same idea.

/** The DOM operations the view layer needs. */
export interface Renderer {
  // Creating nodes
  createElement(name: string): Element;
  createText(value: string): Text;
  createComment(value: string): Comment;

  // Building the tree
  appendChild(parent: Node, child: Node): void;
  /** Insert `child` before `reference`, or at the end if `reference` is null. */
  insertBefore(parent: Node, child: Node, reference: Node | null): void;
  removeChild(parent: Node, child: Node): void;

  // Changing nodes
  setText(node: Text, value: string): void;
  setAttribute(element: Element, name: string, value: string): void;
  removeAttribute(element: Element, name: string): void;
  /** Set a DOM property (e.g. `value`, `disabled`), not an attribute. */
  setProperty(element: Element, name: string, value: unknown): void;
  addClass(element: Element, name: string): void;
  removeClass(element: Element, name: string): void;
  setStyle(element: HTMLElement, property: string, value: string): void;
  removeStyle(element: HTMLElement, property: string): void;

  // Events
  /** Add an event listener. Returns a function that removes it. */
  listen(target: EventTarget, event: string, handler: (event: Event) => void): () => void;
}

/** A Renderer that works on a real DOM document (the browser, or jsdom in tests). */
export class DomRenderer implements Renderer {
  /** @param document The document to create nodes in (default: the global one). */
  constructor(private readonly document: Document = globalThis.document) {}

  createElement(name: string): Element {
    return this.document.createElement(name);
  }

  createText(value: string): Text {
    return this.document.createTextNode(value);
  }

  createComment(value: string): Comment {
    return this.document.createComment(value);
  }

  appendChild(parent: Node, child: Node): void {
    parent.appendChild(child);
  }

  insertBefore(parent: Node, child: Node, reference: Node | null): void {
    parent.insertBefore(child, reference);
  }

  removeChild(parent: Node, child: Node): void {
    parent.removeChild(child);
  }

  setText(node: Text, value: string): void {
    node.data = value;
  }

  setAttribute(element: Element, name: string, value: string): void {
    element.setAttribute(name, value);
  }

  removeAttribute(element: Element, name: string): void {
    element.removeAttribute(name);
  }

  setProperty(element: Element, name: string, value: unknown): void {
    (element as unknown as Record<string, unknown>)[name] = value;
  }

  addClass(element: Element, name: string): void {
    element.classList.add(name);
  }

  removeClass(element: Element, name: string): void {
    element.classList.remove(name);
  }

  setStyle(element: HTMLElement, property: string, value: string): void {
    element.style.setProperty(property, value);
  }

  removeStyle(element: HTMLElement, property: string): void {
    element.style.removeProperty(property);
  }

  listen(target: EventTarget, event: string, handler: (event: Event) => void): () => void {
    target.addEventListener(event, handler);
    return () => target.removeEventListener(event, handler);
  }
}
