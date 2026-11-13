# Tinker

A study on how to build a frontend framework, based on Angular.

Tinker rebuilds the main pieces of a modern Angular-style framework from
scratch, in TypeScript, to understand how each one works: fine-grained
**signals**, **dependency injection** with hierarchical injectors,
**components and directives** declared with decorators and string templates,
and a **change detection** cycle driven only by signals.

It is a learning project, not a production framework.

## Example

```ts
import { inject, Injectable } from "./src/di/index.ts";
import { computed, signal } from "./src/signals/index.ts";
import { Component, Directive, Engine, input } from "./src/view/index.ts";

@Injectable()
class CounterStore {
  readonly count = signal(0);
  readonly parity = computed(() => (this.count() % 2 === 0 ? "even" : "odd"));
}

/** On click, adds `step` to the store of the counter it is in. */
@Directive({ selector: "[step]", host: { "(click)": "apply()" } })
class Step {
  private readonly store = inject(CounterStore);
  readonly step = input("1"); // set from the `step` attribute

  apply() {
    this.store.count.update((count) => count + Number(this.step()));
  }
}

@Component({
  selector: "tk-counter",
  template: `
    <p>Count: {{ store.count() }} ({{ store.parity() }})</p>
    <button step="-1">-1</button>
    <button step="1">+1</button>
  `,
  imports: [Step],
  providers: [CounterStore], // one store per counter
})
class Counter {
  readonly store = inject(CounterStore);
}

Engine.create()
  .bootstrap(Counter); // renders into <tk-counter> in the page
```

The full version, with a clock and three directives, is in
[`examples/basics`](examples/basics/main.ts).

## Modules

Each module has an `index.ts` listing its public API.

| Module | What it does |
|---|---|
| [`src/signals`](src/signals/index.ts) | `signal`, `computed`, `watch`, `untracked`: push-pull reactivity with versions, lazy and glitch-free computeds, cycle detection |
| [`src/di`](src/di/index.ts) | `inject()`, `InjectionToken` (and `InjectionToken.multi`), `provide()`, `@Injectable`, hierarchical injectors with `self` / `skipSelf` / `host` / `optional` lookups, `onDestroy` cleanup |
| [`src/view`](src/view/index.ts) | `Engine`, `@Component`, `@Directive`, `input()`, `ElementRef`, `Effects`, `RenderHooks`, `RENDERER`: the component model and its change detection |
| [`src/functional`](src/functional/index.ts) | `Maybe`, `Either` and a lazy, cancellable `Task`, used across the codebase |
| [`src/utils`](src/utils) | small shared helpers (context variables, metadata, `runAll`) |

### The view, in short

- **Components** have a selector, a template string and their own **injector**
  (child of the engine's), which holds their `providers` and their
  `hostDirectives`.
- **Templates** support `{{ }}` interpolation with a small expression language
  (fields and calls: `user().name`). The component's `imports` list the
  directives its template may use, matched by CSS-like selectors.
- **Directives** on an element share an element injector, so they can inject
  each other and their ancestors. Inputs are signals (`input()`); plain
  attributes bind them.
- **Change detection**: signals are the only trigger. A tick runs dirty effects,
  then dirty views, then render hooks, until nothing changes.
  `engine.afterStable()` tells when a tick has ended.

## Running it

```bash
npm install
```
```bash
npx vite
```
Vite opens [`/examples/basics/`](examples/basics/).

| Script | |
|---|---|
| `npm test` | run the tests (Vitest, jsdom) |
| `npm run coverage` | tests with coverage: 100% lines and branches is required |
| `npm run typecheck` | check types with TypeScript 7 |
| `npm run lint` | check style with ESLint (`npm run format` fixes it) |
| `npm run build` | compile `src/` to `dist/` |

TypeScript runs side by side: the `typescript` package is TypeScript 6, used
only by the ESLint parser; the compiler is `typescript7`, run by the
`typecheck` and `build` scripts. Use the scripts rather than a bare `npx tsc`.

## Conventions and status

- [CONVENTIONS.md](CONVENTIONS.md): how the code is written (DI and
  factories, no `any`, `Maybe`/`Either`, formatting with every call chain on
  its own lines, 100% coverage).
- [IMPROVEMENTS.md](IMPROVEMENTS.md): known gaps and planned work.

Not there yet: components inside templates, `[prop]` and `(event)` bindings in
templates, queries (`viewChild`), `@if` / `@for`, and `engine.destroy()`.

`src/signal.ts`, `src/dom.ts`, `src/index.ts` and `examples/counter` are the
very first prototype, kept for reference until they are removed.
