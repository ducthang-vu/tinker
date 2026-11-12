# Tinker

A tiny frontend framework, built to learn how frameworks work.

Tinker uses **signals** for fine-grained reactivity and creates **real DOM nodes**
directly, with no virtual DOM. When a signal changes, only the text nodes and
attributes that read it are updated.

## Layout

```
src/signal.js   signal, effect, computed (the reactive core)
src/dom.js      h() and mount() (turns components into DOM)
src/index.js    public exports
test/           unit tests (node --test)
examples/       demo pages
```

## Usage

```js
import { signal, h, mount } from "tinker";

function Counter() {
  const count = signal(0);
  return h("button", { onClick: () => count.set((n) => n + 1) },
    "Clicked ", count, " times");
}

mount(Counter, document.getElementById("app"));
```

Pass a function (like `count`) as a child or prop, and Tinker keeps it up to date.

## Scripts

- `npm test` runs the tests
- `npm run dev` serves the folder; open `/examples/counter/`

## Roadmap ideas

- [ ] Batch updates so several `set` calls cause one re-render
- [ ] Conditional rendering (`show(cond, () => ...)`)
- [ ] Lists with keys (`each(items, item => ...)`)
- [ ] Component cleanup (stop effects when a component is removed)
- [ ] JSX support via a build step
- [ ] A simple router
