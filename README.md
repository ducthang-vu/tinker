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

The full version, with a clock, directives, a todo list and every pattern form,
is in [`examples/basics`](examples/basics/), one folder per topic. It runs in the
browser at **[ducthang-vu.github.io/tinker](https://ducthang-vu.github.io/tinker/)**.

## Modules

`tinker` ([`packages/core/src/index.ts`](packages/core/src/index.ts)) exports the public API of every
module; each module also lists its own in its `index.ts`.

| Module | What it does |
|---|---|
| [`packages/core/src/signals`](packages/core/src/signals/index.ts) | `signal`, `computed`, `watch`, `untracked`: push-pull reactivity with versions, lazy and glitch-free computeds, cycle detection |
| [`packages/core/src/di`](packages/core/src/di/index.ts) | `inject()`, `InjectionToken` (and `InjectionToken.multi`), `provide()`, `@Injectable`, hierarchical injectors with `self` / `skipSelf` / `host` / `optional` lookups, `onDestroy` cleanup |
| [`packages/core/src/view`](packages/core/src/view/index.ts) | `bootstrap`, `@Component`, `@Directive`, `input()`, `model()`, `query` / `queryAll`, `ElementRef`, `Effects`, `RenderHooks`, `RENDERER`: the component model and its change detection |
| [`packages/functional/src`](packages/functional/src/index.ts) | `Maybe`, `Either`, a lazy, cancellable `Task`, `Stream` / `Emitter`, and `pipe` / `flow` for composing steps (many values over time; a `Task` is a `Stream` with no items), used across the codebase |
| [`packages/core/src/resource`](packages/core/src/resource/index.ts) | `resource`: a value a loader produces, with its state, its last error and when it last changed; reading it never throws; see [docs/resource.md](docs/resource.md) |
| [`packages/core/src/utils`](packages/core/src/utils) | small shared helpers (context variables, metadata, `runAll`) |
| [`packages/http/src`](packages/http/src/index.ts) | HTTP: `HTTP_BACKEND` (`FetchHttpBackend`) runs the interceptors (`HTTP_INTERCEPTORS`) around `HTTP_TRANSPORT` (native `fetch`); see [docs/http.md](docs/http.md) |
| [`packages/compiler`](packages/compiler/src/index.ts) | `@tinker/compiler`: a Vite plugin that checks each template at build time (and can replace it with its compiled tree), and the `tinker-check` and `tinker-compile` commands for a library's files; see [docs/compiler.md](docs/compiler.md) |
| [`packages/testing/src`](packages/testing/src/index.ts) | the test bed (`TestBed`), testing elements, `ComponentBuilder`, and mocks (`MockComponentBuilder`, `MockDirectiveBuilder`); see [docs/testing.md](docs/testing.md) |

### The view, in short

- **Components** have a selector, a template string and their own **injector**
  (child of the engine's), which holds their `providers` and their
  `hostDirectives`.
- **Templates** support `{{ }}` interpolation with a small expression language:
  fields and calls with argument expressions (`user().name`, `format(item.id, 2)`),
  numbers, strings, `true`, `false`, `null`, `undefined`, `+ - * / **` (with
  parentheses), comparisons (`=== == !== != < > <= >=`), logical operators
  (`&& || !`, with short-circuit), the conditional `a ? b : c` (nested), `??` for
  defaults, `?.` for safe navigation, and object and array literals
  (`{ done: todo.done, title }`, `[a, b]`). Class bindings
  (`[class.done]="todo.done()"`, or an object: `[class]="{ done: todo.done }"`),
  style and attribute bindings
  (`[style.color]="color()"`, `[attr.title]="label()"`, with kebab-case names
  such as `[style.background-color]` and `[attr.aria-label]`; an empty value
  removes the style or the attribute), input bindings (`[label]="item().name"`,
  setting an input of a child component or a directive on that element) and
  event bindings (`(selected)="choose($event)"`, calling a method for each
  value of a directive's or component's output, and for each DOM event of that
  name on the element, whatever is on it: `(click)="go()"` needs no directive).
  A handler is a call of a method with any argument expressions, and `$event` is
  the DOM event or the emitted value: `(keydown)="pick(id, $event.key)"`. The
  method belongs to the component, or to a template variable: `(click)="g.show(3)"`
  calls `show` on the element or component named `#g`, or on an `@let` of that
  name. Key
  modifiers filter a keyboard event: `(keydown.enter)`, `(keydown.esc)`,
  `(keydown.space)`. When both exist, both fire.
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
  `"[attr.role]": "role()"`, or `"[attr.href]": "url()"`, whose URL is checked
  as in templates). A template binding on an element wins over a host binding
  of the same class, style or attribute.
- **Styles** are scoped to their component: its selectors match only its own template
  (and its host, with `:host`), so `p { color: red }` in one component does not reach
  another. Write them inline (`styles`), or in a CSS file next to the component
  (`styleUrls: ["./notice.css"]`, a list of files read at build time: see
  [the compiler](docs/compiler.md)).
  The template can be a file too (`templateUrl: "./notice.html"`).
  A parent can reach into a child's elements with `:deep(...)`, as in
  `.card :deep(.title) { }`. Use it sparingly: the child can rename its classes, and
  the rule then stops matching without an error.
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

- **Templates are strings, checked at build time.** Tinker's own parser reads
  HTML's syntax without a DOM and reports each malformed markup with its line
  and column, instead of repairing it. A build-time compiler (`@tinker/compiler`) checks
  each template, and can replace it with its compiled tree; see
  [docs/compiler.md](docs/compiler.md). Expressions have a small parser of their own
  (no `eval`, so it works under a strict Content Security Policy). The cost: templates
  are not type-checked.
- **Pattern matching in templates.** `@match` tests a value against patterns
  (literals, `truthy` and `falsy`, objects, arrays, guards), and `@if` is the
  simplest case of it. `@map` renders one row per item, keyed by `track`. Angular's
  `@switch` only compares values. The design is in
  [docs/control-flow.md](docs/control-flow.md).
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
  case-insensitively, as HTML attribute names are.
  Class names keep their case: `[class.isOpen]` adds the class `isOpen`.
- **Input options** name an input for templates and convert its plain
  attribute. `input(0, { name: "size", adapter: numberAdapter })` is set by
  `size="3"` (the code reads a number, `3`), and `[size]="n()"` sets it as the
  expression gives it. `numberAdapter` and `booleanAdapter` are built in;
  `adapter` is any `(value: string) => T`. Without `name`, the property's name
  is used. Input options are the second argument of `input()`.
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
npm run dev
```
It opens the example app, [`examples/basics`](examples/basics/), which is a workspace package of its own that imports `@tinker/core`.

| Script | |
|---|---|
| `npm test` | run the tests (Vitest, jsdom) |
| `npm run coverage` | tests with coverage: 100% lines and branches is required |
| `npm run typecheck` | check types with TypeScript 7 |
| `npm run lint` | check style with ESLint (`npm run format` fixes it) |
| `npm run build` | compile `packages/core/src/` to `packages/core/dist/` |
| `npm run build:example` | build the example app |
| `npm run test:repo-map` | tests of the repo-map generator and of the affected-package script |

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
`npm run repo-map -- --format markdown` to generate a compact map for AI context:
one `.repo-map.md` per package and example (and per top-level module of `packages/core`), and one at the root for the rest, or `npm run repo-map -- --format markdown
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

Not there yet: property bindings on plain elements (`[value]` on an `<input>`),
two-way binding `[(value)]` on plain elements, recursive components, and the
gaps listed in [IMPROVEMENTS.md](IMPROVEMENTS.md).
