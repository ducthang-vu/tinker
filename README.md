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
import { bootstrap, Component, computed, Directive, inject, Injectable, input, signal } from "tinker";

@Injectable()
class CounterStore {
  readonly count = signal(0);
  readonly parity = computed(() => (this.count() % 2 === 0 ? "even" : "odd"));
}

/** On click, adds `step` to the store of the counter it is in. */
@Directive({ selector: "[step]", host: { "(click)": "apply()" } })
class Step {
  private readonly store = inject(CounterStore);
  private readonly step = input("1"); // set from the `step` attribute

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

bootstrap(Counter); // renders into <tk-counter> in the page
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
| [`src/view`](src/view/index.ts) | `bootstrap`, `@Component`, `@Directive`, `input()`, `ElementRef`, `Effects`, `RenderHooks`, `RENDERER`: the component model and its change detection |
| [`src/functional`](src/functional/index.ts) | `Maybe`, `Either`, a lazy, cancellable `Task`, and `Stream` / `Emitter` (many values over time; a `Task` is a `Stream` with no items), used across the codebase |
| [`src/utils`](src/utils) | small shared helpers (context variables, metadata, `runAll`) |

### The view, in short

- **Components** have a selector, a template string and their own **injector**
  (child of the engine's), which holds their `providers` and their
  `hostDirectives`.
- **Templates** support `{{ }}` interpolation with a small expression language:
  fields and calls (`user().name`), numbers, strings, `true`, `false`, `null`,
  `undefined`, `+ - * / **` (with parentheses), comparisons (`=== == !== != < > <= >=`),
  and logical operators (`&& || !`, with short-circuit). Calls take no arguments
  yet. Class bindings
  (`[class.done]="todo.done()"`), style and attribute bindings
  (`[style.color]="color()"`, `[attr.title]="label()"`, with kebab-case names
  such as `[style.background-color]` and `[attr.aria-label]`; an empty value
  removes the style or the attribute), input bindings (`[label]="item().name"`,
  setting an input of a child component or a directive on that element) and
  event bindings (`(selected)="choose($event)"`, calling a method for each
  value of a directive's or component's output, and for each DOM event of that
  name on the element, whatever is on it: `(click)="go()"` needs no directive).
  When both exist, both fire.
  A component's element can have content: the component shows it in its
  `<slot>` (the children without `slot="name"`), or in `<slot name="name">`
  (the children with `slot="name"`), as on the web. Content no slot takes is
  not rendered, and a second slot with the same name shows nothing.
  The component's `imports` list the
  directives and components its template may use, matched by CSS-like
  selectors; a component in a template gets its own injector, child of its
  element's, so it can inject its parent.
- **Host bindings** on directives and components: listeners
  (`"(click)": "toggle()"`), and class, style and attribute bindings
  (`"[class.open]": "isOpen()"`, `"[style.opacity]": "opacity()"`,
  `"[attr.role]": "role()"`). A template binding on an element wins over a
  host binding of the same class, style or attribute.
- **Directives** on an element share an element injector, so they can inject
  each other and their ancestors. A directive can also inject its element's
  `ViewContainerRef`: the components it adds sit after the element, are created
  under the element's injector, and are removed with the view. Inputs are signals (`input()`); plain
  attributes bind them.
- **Change detection**: signals are the only trigger. A tick runs dirty effects,
  then dirty views, then render hooks, until nothing changes.

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
- **Pattern matching in templates (planned).** `@match` tests a value against
  patterns (literals, `truthy` and `falsy`, objects, arrays, guards), and `@if`
  is the simplest case of it. Angular's `@switch` only compares values. The
  design is in [docs/control-flow.md](docs/control-flow.md).
- **Change detection is our own design.** Each view has its own watch, and a
  view is scheduled by the signals it reads, not by its parent's refresh. Angular
  refreshes embedded views through the parent instead. The rules, the differences
  and the known gaps are in [docs/change-detection.md](docs/change-detection.md).
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
- **Two-way binding with `model()`.** A model is an input (`[value]`) and an
  output (`(valueChange)`) in one. Only its owner can set it, and a value that
  comes from the template changes it without emitting, so the template's
  handler never hears its own update. Other code that needs every change
  reads the signal in an effect.
- **Inputs are required unless they have a default.** `input<string>()`
  throws if read before it is bound, and `input("top")` is optional: the
  reverse of Angular's `input()` and `input.required()`.
- **`[name]` binds inputs only.** It sets the input `name` of the directives
  and component on the element, never a DOM property: `[title]` on a plain
  `<p>` is an error, not a write to `p.title`. Input names match
  case-insensitively, since the browser's parser lowercases them.
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
- **Lookups return `Maybe`, async results are `Task`s.** Where a lookup may
  find nothing it returns a `Maybe`, not `null`; async results are lazy,
  cancellable `Task`s, not `Promise`s.

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

### Generate an AI-friendly repository map

The repository map is a compact, model-independent JSON graph of TypeScript
files, imports, and exported symbols. It stores entities as nodes and
relationships as edges, so agents can retrieve only the parts they need. It uses the TypeScript 6
Compiler API already installed as `typescript`; it does not add a dependency
or send source code to an external service.

```bash
npm run repo-map
```

This writes `.repo-map.json` at the repository root. The generated file is
git-ignored by default. Use `npm run repo-map -- --pretty` for readable JSON,
`npm run repo-map -- --format markdown` to generate a compact
`.repo-map.md` for AI context, or `npm run repo-map -- --format markdown
--stdout` to print it. Markdown omits documentation comments by default;
add `--include-docs` when explanations are useful. Use
`npm run repo-map -- --stdout` to print JSON, or
`npm run repo-map -- --root path/to/project --output path/to/map.json`
to select another project directory and output path.

Schema version 2 stores file, symbol, and external-module nodes, connected
by `imports` and `exports` edges. Symbol nodes include declaration kinds,
concise type signatures, and available documentation comments. Test and
declaration files are omitted to keep the graph focused. It is a structural
graph, not a call graph: function bodies and runtime behavior are intentionally
not copied into the map.

JSON is the initial storage format because the graph is small, portable,
inspectable, easy to diff, and directly consumable by any model or agent.
SQLite can be added later behind the same graph schema if repository size or
query volume makes indexed, incremental storage worthwhile. The JSON schema
remains the interchange format, so changing storage does not tie the graph to
an AI provider or database.

Run its focused tests with `npm run test:repo-map`.


## Conventions and status

- [CONVENTIONS.md](CONVENTIONS.md): how the code is written (DI and
  factories, no `any`, `Maybe`/`Either`, formatting with every call chain on
  its own lines, 100% coverage).
- [docs/architecture.md](docs/architecture.md): how components, directives,
  native nodes, `View`s and `ViewContainerRef`s relate, with diagrams.
- [IMPROVEMENTS.md](IMPROVEMENTS.md): known gaps and planned work.

Not there yet: property bindings (`[value]` on a plain element), queries (`viewChild`),
`@if` / `@for`, and recursive components.
