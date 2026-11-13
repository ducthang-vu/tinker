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
import { Component, computed, Directive, Engine, inject, Injectable, input, signal } from "tinker";

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

`tinker` ([`src/index.ts`](src/index.ts)) exports the public API of every
module; each module also lists its own in its `index.ts`.

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

## Tinker and Angular

Tinker follows Angular's model: components and directives with selectors,
`imports`, hierarchical injectors, element injectors, `hostDirectives`,
signal inputs, `ElementRef`, one reactive watch per view. Where it departs,
it is on purpose.

### Where Tinker differs

- **No compiler.** Templates are strings parsed at runtime by the browser's
  HTML parser, and expressions by a small parser of Tinker's own (no `eval`,
  so it works under a strict Content Security Policy). The cost: templates
  are not type-checked, and the browser lowercases names.
- **Standard decorators.** TC39 decorators, not TypeScript's experimental
  ones; the metadata is kept on the class.
- **`inject()` only.** No constructor injection, and no Service Locator: the
  public `Injector` is an opaque handle with no `get()`. Dependencies are
  declared where a value is created, never looked up later.
- **Signals are the only trigger.** No zone, and no re-render after an event
  listener runs (Angular's zoneless mode still marks a view dirty then). A
  plain field changed in a click handler does not update the view: make it a
  signal.
- **No `ngOnInit` or `ngOnChanges`.** Inputs are signals, so what depends on
  them is a `computed`. Components, directives and services clean up in an
  `onDestroy()` method, called by the injector that created them.
- **Inputs are required unless they have a default.** `input<string>()`
  throws if read before it is bound, and `input("top")` is optional: the
  reverse of Angular's `input()` and `input.required()`.
- **Multi tokens are declared once, on the token.**
  `InjectionToken.multi<Validator>("VALIDATORS")` instead of `multi: true` on
  every provider: `inject()` is typed as a list, a provider as one item, and
  mixing multi and single providers cannot happen. With no provider at all,
  `inject()` gives an empty list instead of an error.
- **Effects and render hooks are services.** `inject(Effects).create(fn)` and
  `inject(RenderHooks).afterNextRender(fn)`, instead of the free functions
  `effect()` and `afterNextRender()`: the dependency is visible, and they can
  be called at any moment, not only while a class is created. Each component
  (and each element with directives) has its own, so everything registered
  through them stops when its owner is destroyed.
- **Render hooks run only after a tick that rendered**, inside the tick: a
  hook writing a signal re-renders in the same tick, under the same loop guard.
- **Lookups return `Maybe`, async results are `Task`s.** `engine.getContext()`
  returns a `Maybe`, not `null`; `engine.afterStable()` returns a lazy,
  cancellable `Task`, not a `Promise`.

### What Tinker adds

- **Decorators for effects and render hooks:** `@Effect()`,
  `@AfterEachRender()` and `@AfterNextRender()` on methods.
- **An effect knows its run:** it receives `{ isFirst, onCleanup }`.
- **A typed `setInput`:** `view.setInput("title", "Hello")` only accepts the
  names of the component's inputs, with their types.
- **A typed `provide()`:** `provide(API_URL, { useValue: 42 })` does not
  compile when `API_URL` holds a string.
- **Change detection as separate parts:** a `Ticker` decides when a tick runs
  (one per microtask), schedulers queue effects and views, and
  `ChangeDetection` decides the order: effects, then views, then render hooks,
  repeated until nothing changes.

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

Not there yet: `[prop]` and `(event)` bindings in templates, content
projection (content inside a component's element), queries (`viewChild`),
`@if` / `@for`, recursive components, and `engine.destroy()`.
