# Improvements to do

Known limitations, written down so they are not forgotten. Each entry says
what the problem is, why it matters, and what to do.

## Change detection (`packages/core/src/view/internal/runtime/change-detection.ts`, its schedulers)

A change detection cycle runs in a microtask: every signal write made in the
same task (an event handler, a fetch callback) leads to one cycle, before the
browser paints. That is the right default (Vue and Lit do the same), but it
has these gaps.

### 1. Several cycles with `async` code

**Problem.** Each `await` lets microtasks run, so
`a.set(1); await x; b.set(2);` runs two cycles in one frame. The result is
correct, the work is not minimal.

**To do.** Nothing yet: the cost is not measured. If it shows up in profiles, try
another strategy, e.g. Angular's zoneless race between `setTimeout` and
`requestAnimationFrame`. Only `ChangeDetection.request` decides when a cycle
runs, so this is a change in one place.

### 2. A view cannot be refreshed by its author

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

## Components

### 1. Recursive components cannot be written, and are banned

**Problem.** `imports` is evaluated when the decorator runs, before the
class exists: a component cannot import itself, nor two components each
other. And `ComponentFactory` bans a component containing itself (it would
never stop creating). So a tree (a node component rendering its children
as nodes) cannot be built.

**To do.** Accept forward references in `imports` (`ForwardRef.of(() =>
TreeNode)`, which `packages/core/src/utils` already has), and allow recursion once
templates can stop it: with `@if` and `@map`, a node renders children only
while there are some. Keep the ban for a component that always contains
itself.

## The engine's entry points (`packages/core/src/view/internal/engine.ts`, `packages/core/src/view/internal/factories/component-factory.ts`)

### 1. The component factory still takes the parent's host bindings and projected content

**Problem.** The parent context still carries `adoptHostBindings`, which hands the child's host
bindings back to the parent's watch, and the projected content and content queries. Those
describe the parent's template, not how to build the component. The plain attributes and the
input bindings now go through one `setInputs` callback, supplied by the template builder.

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

### 1. Property bindings on plain elements

**Problem.** `[name]` binds inputs only, so `[value]` on an `<input>` or
`[textContent]` on a `<p>` is an error. Forms need the DOM property, and a
two-way `[(value)]` needs it too.

**To do.** Decide the syntax that separates a DOM property from an input (a
prefix, or a check that the element has no directive with that input), then
bind the property through the renderer. `[(value)]` is sugar for the property and
its `(input)` handler, once this exists.

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

### 4. Warn when a trusted value is used

**Problem.** `Sanitizer.trustUrl`, `trustHtml` and `trustStyle` let an attribute hold a value that the
checks would remove (see `docs/sanitization.md`). The bypass is silent. The warning belongs
to developer mode, which is not built yet (see "Developer mode").

**To do.** When developer mode exists, warn each time a trusted value is set on an attribute
or style, naming the element and the attribute. Until then the `Trusted…` classes are the
only record of the bypass.

### 5. Arrow functions

**Problem.** `t => t.done` (needed for `filter` and `map` in templates) is not in the
expression language. Unary minus is supported (`-count()`).

**To do.** Add arrow functions to `expression.ts`, with `filter` and `map` as methods that
take a function. An arrow function needs its own scope for the parameter, like a `@let`
but for a call.

## Developer mode (`packages/core/src/view/internal/`, `packages/core/src/view/bootstrap.ts`)

### 1. Warn the author about legitimate but suspicious templates

**Problem.** Some template code is allowed but usually a mistake. A `@let`
that has the name of a field or method hides it, which is legitimate, but a
reader can't tell which name is meant. A read of a name that the component
doesn't have silently gives `undefined`. Neither breaks the app, so neither
should be an error, and nothing tells the author today.

**To do.** Add a developer mode, off in production:

- **Turned on** by a `dev` option on `bootstrap`, which is the simplest choice
  without a bundler.
- **Checks**: shadowing (a `@let`, or later a block's name, over a field or
  method, or over an outer name), and an unknown name read from the component.
  They are warnings. Declaring the same name twice in one scope stays an error
  in both modes.
- **Where warnings go**: `console.warn` by default, and an `onWarning` callback
  on `bootstrap`, so tests can check them and apps can send them to their own
  logging.
- **Production** skips every check, so developer mode has no cost there.

Shadowing across scopes is allowed, as in most languages: this is a warning for
the author, not a ban.

## Inputs: options (`packages/core/src/view/internal/authoring/input.ts`, `input-adapters.ts`)

### 2. Adapters report no errors

**Problem.** `numberAdapter` gives NaN for text that is not a number, and nothing tells the
author. `booleanAdapter` treats every value except `"false"` as true. An adapter that
throws would surface as an error during change detection, with no note of which attribute.

**To do.** Decide the policy: keep NaN and document it, or let an adapter report an error
through `RenderHooks` or `onWarning`, with the element and the attribute named.

### 3. A single argument is taken as options when it has a `name` or `adapter` key

**Problem.** `input(value)` treats an object default that has a `name` or `adapter` key
as options. Such a default must be written `input(value, {})`. The rule is simple but
guessed from the keys, not from the type.

**To do.** Use a marker that cannot clash with a value, such as an `InputOptions` class
instance built by a helper (`inputOptions({ … })`), or accept only the two-argument form
for object defaults.

### 4. Adapters apply to plain attributes only

**Problem.** `[size]="n()"` sets the input as the expression gives it, so a binding of the
wrong type is not converted, and a string bound to a number input is not caught.

**To do.** Nothing yet: this matches Angular's split between attributes and bindings. If
type errors at bind time are wanted, check the value against the input's adapter, or
add a dev-mode check next to the other development warnings.

## Template syntax (`packages/core/src/view/internal/template/tinker-parser.ts`)

The engine's parser is `TinkerTemplateParser`, which reads without a DOM and reports
every malformed markup with its line and column. It decodes the 253 references HTML 4
defines (and `&apos;`) with a table, `entities.ts`, and numeric references by the
standard's rules. `textarea` and `title` read their content as text with references
decoded.

Known deviations from the browser:

- The HTML 5 names beyond the HTML 4 list (such as `&check;`) are kept as written. The full table adds about 16 KB gzipped to the
  example's bundle, against about 2 KB for this one.
- A reference without its semicolon (`&copy`) is kept as written; the browser decodes some
  of them.

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

**Problem.** The emitted templates are about 2.2 times the gzipped size of their template
strings, but the whole bundle grows by much less. Measured on the example app, in headless
Chromium on one machine, 40 loads of each build, alternating:

- Time from navigation to all four components rendered: median 47 ms with template
  strings, 39.1 ms with emitted trees (p90 58.4 ms and 44.9 ms).
- Bundle: 193,704 bytes raw and 37,617 gzipped with strings; 221,593 raw and 38,436
  gzipped with trees (about 0.8 KB more gzipped).

So for this app the trees are worth their size, and the example app now uses them
(`tinkerCompiler({ emit: true })`). The person running the compiler chooses per build:
`--emit` writes the trees, and without it the output keeps the template strings.

**To do.** Measure on a larger app and on slower hardware before making trees the default
for libraries, since a library's consumers pay the bundle size, not the build.

## Template patterns: regex (`packages/core/src/view/internal/template/`)

### 1. A regex is not checked for catastrophic backtracking

**Problem.** A pattern such as `/^(a+)+$/` can take exponential time on a string that
almost matches. A `@case` is tried on every change detection cycle, so a slow regex
delays the whole view. Nothing limits its cost.

**To do.** Decide whether to refuse nested quantifiers at parse time, or to document the
risk and leave the author to write a linear regex.


## API reference (`scripts/api-docs.mjs`, `examples/basics/src/features/apidoc/`)

### 1. Descriptions show only paragraphs, code spans and fences

**Problem.** The page shows TSDoc as paragraphs, `code spans` and fenced code blocks. Other
markup is shown as written: a `{@link X}` may appear as text, and lists, headings and links
are not rendered.

**What was fixed.** Code spans were followed by a stray space, and the rows of a one-line
`@map` came out in reverse order. Both were engine bugs: a row whose body was a block (`@if`,
`@match`) left the nodes of that block behind when the rows were moved. Each row now has a start
marker, and its nodes are moved from there to its anchor. The page's loop is one line again.

**To do.** Render the TSDoc inline tags (`{@link}`) as links to the reference anchors, and
render lists and links from the description.

### 2. Inherited members are not listed

**Problem.** A class's members are listed only where it declares them. A member a class
inherits from its base class is missing from the subclass's entry.

**To do.** Include inherited public members, marked with the class they come from, if the
reference should be complete for subclasses.

### 3. The public index and `@privateAPI`

**Problem.** `@privateAPI` items are left out of the reference, but they stay exported from
the package index (`packages/core/src/view/index.ts`), so an app can still import them.

**To do.** Move them out of the public index, or keep them there and accept that the
reference does not show them.

## Routing and the folder the app is served under (`packages/router/src/lib/location/`, `.github/workflows/gh-pages.yml`)

### 1. The folder comes from the page's <base> element

**What was done.** `browserPlatformLocation` reads the folder the app is served under from the
page's `<base>` element, which the build writes (`TINKER_BASE`, the `baseTag` plugin in
`examples/basics/vite.config.ts`). Paths, `push`, `replace` and `href` all use it. An app
needs no code for it, and a test provides a different `PLATFORM_LOCATION` to override it.

**To do.** Warn when a page has no `<base>` but the build set a folder, since the links would then
point at the host root.

### 2. Deep links rely on a copy of index.html

**Problem.** GitHub Pages serves a file for each path, so `/tinker/api` is not a file. The
workflow copies `index.html` to `404.html`, and GitHub Pages serves that page for the URL, so the
router reads the URL itself. Any other static host needs the same fallback.

**To do.** Nothing in the app; document the fallback for any new host.
