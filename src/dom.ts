// Building real DOM nodes, with no virtual DOM.
//
// h("button", { onClick: fn, class: () => cls() }, "Count: ", count)
//
// Any prop or child that is a *function* is treated as reactive: it runs
// inside an effect, so only that one attribute or text node updates when
// its signals change.

import { effect } from "./signal.ts";

type Primitive = string | number | boolean | null | undefined;

/** Something that can be rendered as a child. Functions are reactive. */
export type Child = Node | Primitive | (() => Primitive) | Child[];

export type Props = Record<string, unknown>;

/** A component is a function that takes props and returns a DOM node. */
export type Component<P extends Props = Props> = (
  props: P & { children?: Child[] },
) => Node;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K];
export function h<P extends Props>(
  tag: Component<P>,
  props?: P | null,
  ...children: Child[]
): Node;
export function h(
  tag: string | Component,
  props?: Props | null,
  ...children: Child[]
): Node {
  if (typeof tag === "function") return tag({ ...props, children });

  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (typeof value === "function") {
      effect(() => setProp(el, key, (value as () => unknown)()));
    } else {
      setProp(el, key, value);
    }
  }

  appendChildren(el, children);
  return el;
}

function setProp(el: HTMLElement, key: string, value: unknown): void {
  if (key in el) {
    (el as unknown as Record<string, unknown>)[key] = value;
  } else if (value == null || value === false) {
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, String(value));
  }
}

function appendChildren(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (Array.isArray(child)) {
      appendChildren(parent, child);
    } else if (child == null || child === false) {
      continue;
    } else if (typeof child === "function") {
      const text = document.createTextNode("");
      effect(() => {
        text.data = String(child() ?? "");
      });
      parent.appendChild(text);
    } else if (child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
}

/** Render a component into `target`, replacing its contents. */
export function mount(component: () => Node, target: Element): void {
  target.replaceChildren(component());
}
