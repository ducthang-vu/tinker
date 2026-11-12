// Building real DOM nodes, with no virtual DOM.
//
// h("button", { onClick: fn, class: () => cls() }, "Count: ", count)
//
// Any prop or child that is a *function* is treated as reactive: it runs
// inside an effect, so only that one attribute or text node updates when
// its signals change.

import { effect } from "./signal.js";

export function h(tag, props, ...children) {
  if (typeof tag === "function") return tag({ ...props, children });

  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (key.startsWith("on")) {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (typeof value === "function") {
      effect(() => setProp(el, key, value()));
    } else {
      setProp(el, key, value);
    }
  }

  for (const child of children.flat()) appendChild(el, child);
  return el;
}

function setProp(el, key, value) {
  if (key in el) el[key] = value;
  else if (value == null || value === false) el.removeAttribute(key);
  else el.setAttribute(key, value);
}

function appendChild(parent, child) {
  if (child == null || child === false) return;

  if (typeof child === "function") {
    const text = document.createTextNode("");
    effect(() => (text.data = String(child() ?? "")));
    parent.appendChild(text);
  } else if (child instanceof Node) {
    parent.appendChild(child);
  } else {
    parent.appendChild(document.createTextNode(String(child)));
  }
}

export function mount(component, target) {
  target.replaceChildren(component());
}
