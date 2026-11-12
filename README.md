# Tinker

A tiny frontend framework, built to learn how frameworks work.

Tinker uses **signals** for fine-grained reactivity and creates **real DOM nodes**
directly, with no virtual DOM. When a signal changes, only the text nodes and
attributes that read it are updated.

## Layout

```
src/signal.ts   signal, effect, computed (the reactive core)
src/dom.ts      h() and mount() (turns components into DOM)
src/index.ts    public exports
test/           unit tests (Vitest + jsdom)
examples/       demo pages (served by Vite)
```

## Usage

```ts
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

- `npm install` installs the dev tools (TypeScript, Vite, Vitest, jsdom)
- `npm run dev` starts Vite and opens `/examples/counter/`
- `npm test` runs the tests (`npm run test:watch` to keep them running)
- `npm run typecheck` checks types
- `npm run build` compiles `src/` to `dist/` with type declarations

## Roadmap ideas

- [ ] Batch updates so several `set` calls cause one re-render
- [ ] Conditional rendering (`show(cond, () => ...)`)
- [ ] Lists with keys (`each(items, item => ...)`)
- [ ] Component cleanup (stop effects when a component is removed)
- [ ] JSX support (TypeScript `jsxFactory: h`)
- [ ] A simple router
