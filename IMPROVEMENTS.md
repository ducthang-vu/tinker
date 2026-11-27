# Improvements to do

Known limitations, written down so they are not forgotten. Each entry says
what the problem is, why it matters, and what to do.

A package with its own file lists its gaps there:

- [`@tinker/functional`](packages/functional/IMPROVEMENTS.md): the functional library.

## Change detection (`packages/core/src/view/internal/runtime/change-detection.ts`, its schedulers)

A change detection cycle runs on the next animation frame or timer, whichever comes first:
every signal write made in the same task (an event handler, a fetch callback, and the code after
an `await` that resolves in it) leads to one cycle, before the browser paints. The cost of this
policy is not measured yet, so the gaps below are the ones known today.

### 1. A view cannot be refreshed by its author

**Problem.** A plain field changed by code outside the signal graph (a library callback, an
in-place mutation of a plain object, a socket message) updates nothing: the view's watch runs only
when a signal it read changed. There is no public way to say "refresh this view". Scheduling the
view's watch by hand does nothing either: `Watch.run()` returns early when no recorded dependency
changed (`runOnce`), and the watch's `dirty` flag is private. Angular's `watch` behaves the same way
(its `run` checks `consumerPollProducersForChange` after the first run), so an Angular-style
`markForCheck` cannot be copied as is.

**To do.** Split each view's update in two, in `component-factory.ts` and `embedded-view-factory.ts`:

- `dependencies()` reads every signal the view's bindings use, and returns the values. It is the
  only code that reads signals, so the watch records exactly the reads that matter.
- `writeTemplate(...args)` takes plain values and writes the DOM (rule 6: only changed values). It
  reads no signals, so it can be called from anywhere without changing the recorded dependencies.

The watch becomes `watch(() => writeTemplate(...dependencies()), scheduler)`. A refresh from
outside is then `writeTemplate(...dependencies())`, and it needs no check signal and no change to
`Watch`. Before this, check two things:

- `dependencies()` must read the same signals on every run. A read made only under a condition
  inside it is tracked only when the condition holds, which is the stale-dependency problem.
- A structural binding (`@if`, `@map`) creates child views in its write, and a child's reads come
  after that write. So the split applies per view: each child has its own `dependencies()` and
  `writeTemplate`, run by its own watch. The evaluation order of the bindings must stay the same.

On top of the split, one author-facing API with two methods, both on the view's own handle:

- `scheduleForNextTick()` queues a `Runnable` that calls `writeTemplate(...dependencies())`, through
  the view scheduler. It keeps the parent-first order and the single tick.
- `detectChangesNow()` runs the same expression at once. For the subtree it recurses over the view's
  children, pre-order (parent before children), so a child's `dependencies()` sees the values its
  parent just wrote. Its cost is that it reads every view below, even when nothing changed there.
  Rule 6 keeps the DOM writes down.

Both are a second way to write a view, so they need tests showing that the watch's own runs and
the manual ones agree on the DOM, and that a manual run with no change writes nothing.

## The engine's entry points (`packages/core/src/view/internal/engine.ts`, `packages/core/src/view/internal/factories/component-factory.ts`)

### 1. The component factory still takes the parent's host bindings and projected content

**Problem.** The parent context still carries `adoptHostBindings`, which hands the child's host
bindings back to the parent's watch, and the projected content and content queries. Those
describe the parent's template, not how to build the component.

**To do.** Move the host bindings and the projection out of the factory the same way, or
document them as the parent-to-child contract that the factory must hold.

### 2. Make the root path consistent with the container

**Problem.** Bootstrap renders into an existing element, which a container
(which inserts a new element before its anchor) cannot do. So the root is a
separate path, and it is the only one that does not use a container.

**To do.** Decide whether a root component should be a container anchored at
its host, with a placement mode that does not insert. If not, document the
root as the one case that renders into an existing element.

## Templates (`packages/core/src/view/internal/template/`, `factories/template-builder.ts`)

### 1. Property bindings on plain elements: gaps

- **The property is looked up when the element is built.** A property that an element
  gains later (a custom element defined after the template is built) is an error at
  build time, not a binding that waits for it.
- **There is no `[(value)]`.** Two-way binding needs the property plus an `(input)`
  handler; it is not sugar over the property yet.
- **Reflected properties follow their attribute.** Setting `disabled` changes the
  attribute too, because the browser reflects it. Nothing here guards that.
- **No type checks.** A string bound to a number property is set as it is.
- **A refused value is set to `""`.** `[href]` to `javascript:` and `[innerHTML]` without
  a `TrustedHtml` are set to `""` (see `docs/sanitization.md`, G), so the property is
  written, not left as it was.

### 2. Content queries see only direct element children

**Problem.** `query(…, { from: "content" })` lists the elements the parent passes
in directly. Items inside `@if`, `@map` or `<tk-container>` children, and items
nested in a plain element, are not in the list.

**To do.** Record every match of the parent's template that lands in the
component's slot, not only direct children, behind an option (`descendants`), and
include the blocks' rows. The rule is settled in the query code, so this is a
change in `projectChildren` and the block builders.

### 3. A template variable is a query target only in `query`

**Problem.** `query("name")` reads a top-level `#name`, but `queryAll` takes only
a class, and a variable inside `@if` or `@map` is not in the registry, since one
name can appear many times.

**To do.** `queryAll` with a variable (a list of the one value, or of the rows that
share the name), and a registry per row if a row variable is to be queried.

## Developer mode (`packages/core/src/view/internal/`, `packages/core/src/view/bootstrap.ts`)

### 1. Warn about unknown names and add `onWarning`

**Problem.** A read of a name the component doesn't have silently gives `undefined` in development
mode when the build did not check the template.

**To do.** Warn in development mode, through an `onWarning` callback on `bootstrap` (default:
`console.warn`), and turn the checks on with the compiler's `dev` option, which the app reads as
the `DEV_MODE` token.

## Inputs: options (`packages/core/src/view/internal/authoring/input.ts`, `input-adapters.ts`)

### 1. A single argument is taken as options when it has a `name` or `adapter` key

**Problem.** `input(value)` treats an object default that has a `name` or `adapter` key
as options. Such a default must be written `input(value, {})`. The rule is simple but
guessed from the keys, not from the type.

**To do.** Use a marker that cannot clash with a value, such as an `InputOptions` class
instance built by a helper (`inputOptions({ … })`), or accept only the two-argument form
for object defaults.

### 2. Adapters apply to plain attributes only

**Problem.** `[size]="n()"` sets the input as the expression gives it, so a binding of the
wrong type is not converted, and a string bound to a number input is not caught.

**To do.** Nothing yet: this matches Angular's split between attributes and bindings. If
type errors at bind time are wanted, check the value against the input's adapter, or
add a dev-mode check next to the other development warnings.

## Build-time template compiler (`packages/compiler`)

The plugin compiles each component's literal template into the expression that
rebuilds its tree, and checks that it compiles. Its limits:

### 1. Values computed at run time are not compiled

**Problem.** A template or selector that a `const` gives as a literal, or as a `+` of
literals, template literals and other constants, is compiled, also across the files that
import them. One computed at run time (a function call, a `let`, a number) is skipped
with a warning, and keeps its template string. The app still works, but the check and the
emitted tree do not cover it. A constant that depends on itself has no text.

**To do.** Report the values that remain as errors in strict mode, and decide whether a
call with a known result (such as a `const` set from a pure function) should be followed.

### 2. The start-up gain of emitted trees is measured for one app

**Problem.** The start-up time and bundle size of emitted trees were measured on the example
app only, in one headless browser on one machine.

**To do.** Measure on a larger app and on slower hardware before making trees the default
for libraries, since a library's consumers pay the bundle size, not the build.

## Routing and the folder the app is served under (`packages/router/src/lib/location/`, `.github/workflows/gh-pages.yml`)

### 1. The folder comes from the page's <base> element

**To do.** Warn when a page has no `<base>` but the build set a folder, since the links would then
point at the host root.
## Names in templates at build time (`packages/compiler/src/plugin.ts`, `packages/core/src/view/internal/template/template-names.ts`)

### 1. Some template expressions are not type checked

**Problem.** `tinker-types` checks the template's expressions against the component's class, so a wrong argument type or a call of a non-function is a type error. Some parts are still typed `any`: handlers, `@case` bindings, `let-` names and element references.

**To do.** Type the `@case` bindings from the subject, narrowed by each case's pattern, and the element references from their element or directive, and check handlers against their event types.
