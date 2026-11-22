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

### 1. `engine.createComponent` is deprecated; remove it

**Problem.** It creates a component without a place in the page, which is
the job of a container, and it renders into a host, which is the job of
`bootstrap`. It is used mostly by tests, and tests should not drive the API.
Keeping it means two entry points for each case.

**To do.** Move the tests off it, then delete it:

- Tests that render a component at runtime use
  `engine.createViewContainer(anchor)` on a comment node in a parent they
  control, then `createComponent`. Their checks read the parent, not the
  detached host.
- Tests that render the root component use `bootstrap`, with the host
  attached to the document first.
- The few tests that check the factory itself call `ComponentFactory` through
  the engine's providers, not through a public method.

A test helper in the test folder (not in `src`) can absorb the two
differences (host identity, attachment) so each test changes by one line.

### 2. Move template-only work out of the component factory

**Problem.** The factory still takes `attributes`, `bindInputs` and
`adoptHostBindings`, which describe the parent's template, not how to build
the component.

**To do.** The template builder applies the element's inputs and adopts the
host bindings around the factory call. The factory then takes only the host,
the type, the parent context (injector and owner view), and the slot content.
This is a cleanup, not a new architecture: the factory's API keeps the same
shape.

### 3. Make the root path consistent with the container

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

## Component styles (`packages/core/src/view/internal/runtime/component-styles.ts`, `renderer.ts`)

### 1. The rewriter does not handle nested rules, and `styles` is one string

**Problem.** A stylesheet is rewritten by a small hand-written parser, so nested rules and
`@container` inside `@media` are not handled. `styles` is one string, so a list of files
(`styleUrls`) is joined before scoping.

**To do.** Scope nested rules and `@container` with the same walk, and check the joined
sheet's rules one at a time if a list of files is ever scoped separately.

## Inputs: options (`packages/core/src/view/internal/authoring/input.ts`, `input-adapters.ts`)

### 1. The testing helpers do not know an input's template name

**Problem.** `input(…, { name })` gives the template name, but `InputName<T>` and the
mock builders (`requiredInputs`, `optionalInputs`) work on the property names. They were
written before options existed, so a mock may not copy the template name: a test that
sets `title="…"` on a mock of `label` could then fail. Not yet checked by a test.

**To do.** Have the mock builders read `InputBinding.alias` (through `inputsOf` or a new
accessor) and copy each input under its template name, keeping the property name for
the typed side.

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

## Testing: concurrent tests

A fixture built outside a test now throws unless it is `manualCleanup()` (see `docs/testing.md`).
A concurrent test still needs `manualCleanup()` by hand, because `cleanup()` would destroy its
fixture while other tests run.

**To do.** Vitest's public API does not say whether the running test is concurrent. Either
the package takes that from the runner when Vitest exposes it, or each fixture is tied to the
test that built it through `onTestFinished`, so `cleanup()` destroys only that test's fixtures.

## Template patterns: regex (`packages/core/src/view/internal/template/`)

### 1. A regex is not checked for catastrophic backtracking

**Problem.** A pattern such as `/^(a+)+$/` can take exponential time on a string that
almost matches. A `@case` is tried on every change detection cycle, so a slow regex
delays the whole view. Nothing limits its cost.

**To do.** Decide whether to refuse nested quantifiers at parse time, or to document the
risk and leave the author to write a linear regex.


## Errors in the view builder (`packages/core/src/view/internal/factories/`)

### 1. An invalid `host` option is thrown where the directive is first used

**Problem.** `HostBindings.parse` returns an `Either`, so an invalid `host` option is a
value. But the directive factory (`directive-factory.ts`) builds the bindings during view
creation, and the code above it returns plain values, not `Either`s. So the factory calls
matching its Left and throwing, and the error is thrown there instead of being returned to the caller.

**To do.** Make the view builder (`template-builder.ts` and its callers) return an `Either`
for the directive's bindings, so the caller that creates the directive decides what to do
with the error. This follows from converting the template compiler to `Either`.

## API reference (`scripts/api-docs.mjs`, `examples/basics/api/`)

### 1. Descriptions are plain text with code spans and fences

**Problem.** The page shows TSDoc as paragraphs, `code spans` and fenced code blocks. Other
markup is shown as written: a `{@link X}` may appear as text, and lists, headings and links
are not rendered. Spaces around a code span are also wrong when the text is next to a
punctuation mark, such as "`inject(Injector)` , the token".

**To do.** Render the TSDoc inline tags (`{@link}`) as links to the reference anchors, and
fix the template whitespace in `api-docs.ts` (`DocBody`) so a code span has no space before
the text after it.

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

## Example app: routing and the GitHub Pages base (`examples/basics/app/`, `.github/workflows/gh-pages.yml`)

### 1. Links are not base-aware

**Problem.** `RouterLink` writes an `href` of the app's own path (`/api`). On GitHub Pages the
app lives under `/tinker/`, so the href points at the host root. A plain click is handled by the
router (`basedPlatformLocation` adds the base), but a middle click or "open in a new tab" goes to
the wrong URL.

**To do.** Let the router know the base: a `base` option on `provideRouter` that prefixes the
hrefs it writes, rather than only the location it reads and writes.

### 2. Deep links rely on a copy of index.html

**Problem.** GitHub Pages serves a file for each path, so `/tinker/api` is not a file. The
workflow copies `index.html` to `404.html`, and GitHub Pages serves that page for the URL, so the
router reads the URL itself. Any other static host needs the same fallback.

**To do.** Nothing in the app; document the fallback for any new host.

### 3. The first provider of a token wins

**Problem.** The router registers the browser's `PLATFORM_LOCATION` itself. The example's own
location (for the base path) must come first in `bootstrap`'s providers, or it is ignored with no
error. The router's own tests do not catch this, since they use the browser location directly.

**To do.** Warn when a single-token provider is registered twice, in developer mode, or let a
later provider replace an earlier one on purpose. Until then, the example's `main.ts` says so.

### 4. The root route's component is never shown

**Problem.** `ROUTES` needs a component for its root route, so the shell (`App`) is given, though
the outlet shows only the children. A reader could take that for a page.

**To do.** Allow a root route without a component, when it only groups children.
