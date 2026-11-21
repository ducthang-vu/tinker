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

### 4. Allow an unsafe URL on purpose

**Problem.** A URL attribute that is bound to `javascript:`, `data:` or another
unsafe scheme is not set (see `runtime/url-safety.ts`). An app that really needs
such a URL (a `data:` image, say) has no way to say so.

**To do.** Add a trust wrapper, such as `trustUrl(url)`, that a binding accepts
without the check, with the name making the risk visible in the template. Warn in
developer mode when a trusted URL is used, so the bypass is never silent.

### 5. Arrow functions and unary minus

**Problem.** `t => t.done` (needed for `filter` and `map` in templates) and `-1`
are not in the expression language.

**To do.** Add both to `expression.ts`, with `filter` and `map` as methods that
take a function. Arrow functions need their own scope for the parameter, like a
`@let` but for a call.

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

### 1. A component's `<style>` stays in the head after it is destroyed

**Problem.** `Renderer.addStyleSheet` adds one `<style data-tk-style="tk-cN">` to
`document.head` per component class, and nothing removes it. Its rules then stay on
the page after the last instance is gone, and a test that creates components leaves them
behind for the next test. Nothing counts the instances, so the element cannot be removed
when the last one goes.

**To do.** Count the live instances per class in the component factory (add on create,
remove on destroy), and remove the `<style>` when the count reaches zero. The renderer
would need a `removeStyleSheet(id)` to match. Until then, the leftover rules are harmless
(their attribute only exists on elements of that class), but they accumulate.

Related, in the same module: the rewriter is a small hand-written parser, so nested rules
and `@container` inside `@media` are not handled, and `styles` is one string, not a list.

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

The engine's parser is `TinkerTemplateParser`, which reads without a DOM and
reports malformed markup as a `TemplateSyntaxError` with its line and column.
Its limits:

### 1. Only a few named entities are decoded

**Problem.** `&amp; &lt; &gt; &quot; &apos; &nbsp;` and numeric references are
decoded. Any other name (`&copy;`, `&hellip;`) is kept as written, where the
browser's parser would decode it.

**To do.** Add the entities an app needs to the table in the parser, or the
HTML entity list if apps need all of them.

### 2. Only `script` and `style` are raw text

**Problem.** `textarea` and `title` are read as markup, so `<textarea>` cannot
hold a `<` as text, as HTML allows.

**To do.** Add them to `RAW_TEXT_ELEMENTS`, with their RCDATA rule (entities
decoded, no tags) for `textarea` and `title`.

### 3. A mistake can report more than one error

**Problem.** The parser goes on after an error, so a template with several problems
reports them all. One mistake can still be reported twice: a mismatched closing tag
(`<div>x</span></div>`) closes the element, and the real `</div>` then looks stray.

**To do.** When a closing tag does not match, look for the element it does close among
the open ones, and report the problem once.

## Precompiled templates (`packages/core/src/view/internal/factories/component-factory.ts`)

A component's template can be a compiled tree a build step wrote, which the engine
uses as it is (see `@tinker/core/compiler`).

### 1. CLASS_REPLACEMENTS does not apply to a precompiled tree

**Problem.** The tree names the real classes of its directives and component. A test
that replaces a class through `CLASS_REPLACEMENTS` gets the original in such a tree.

**To do.** Either walk the tree and replace the classes the same way (once per class,
where the factory caches the nodes), or keep precompiled templates out of tests and
say so. Until then, a test of a replaced class uses a string template.

## Build-time template compiler (`packages/compiler`)

The plugin compiles each component's literal template into the expression that
rebuilds its tree, and checks that it compiles. Its limits:

### 1. Templates and selectors that are not literals are not compiled

**Problem.** A template built in code, an `imports` list that is not a list of names,
or a directive whose selector is computed is skipped with a warning, and keeps its
template string. The app still works, but the check and the emitted tree do not
cover it.

**To do.** Resolve such values when they are simple (a constant in the same file), and
report the rest as errors in a strict mode for libraries.

### 2. An emitted tree is about 2.2 times the gzipped size of its template

**Problem.** Measured on the example's components: the templates are 3,446 B (1,554 B
gzipped), and their emitted trees are 43,136 B (3,816 B gzipped). Leaving out the
default fields saves only about 10% of that. The tree's shape, the expressions and the
nested objects, is the cost. The emitted form is therefore off by default
(`tinkerCompiler({ emit: true })`), and the check alone keeps the bundle unchanged.

**To do.** Measure the start-up time a precompiled tree saves before recommending
`emit` for an app. A shorter encoding would need the expressions kept as source and
parsed at run time, which the template string already allows.

### 3. The helper imports need `@tinker/functional` and `@tinker/core/compiler`

**Problem.** A compiled component's file imports both packages under aliased names. An
app must be able to resolve them, which the example does through its alias.

**To do.** Document the two dependencies for apps, and check them at build time.

## Compiling a library (`packages/compiler/src/emit-files.ts`)

`tinker-compile --out <dir> [--package <package.json>] [--strict] <file.ts>...` writes
each file into the output directory, at its path relative to the working directory,
with its compiled templates replaced by their trees. It fails, and writes nothing, when
the manifest does not declare `@tinker/functional` and `@tinker/core`, or when a file
is outside the working directory. `tinker-check` is the same check without writing.
Both follow only relative imports.

`examples/library` is a sample library built this way: `npm run build` compiles its
sources to `build/`, then emits JavaScript and declarations to `dist/`.

### 1. The packages are built, but still private

**Problem.** `@tinker/core` and `@tinker/functional` now build to JavaScript and
declarations, and their `exports` point at the built files, so the sample library runs
in plain Node. Both packages are still `private`, and have no version to publish.

**To do.** Decide the first published version, remove `private`, and check the packed
output (`npm pack`) before publishing.

Inside the repo, the `development` export condition points at source, so a Vite dev server
uses the source without a rebuild. Node cannot load that source, so Node uses `dist`.

### 2. Emitted trees are larger than their templates

**Problem.** Measured on the example: about 2.2 times the gzipped size of the
templates (see the plugin's `emit` option). Consumers pay that size for the faster
first render.

**To do.** Decide per library whether `--strict` output is worth it, or write templates
as strings and check them only.

## Testing: concurrent tests

`cleanup()` destroys every fixture that is not `manualCleanup()`, so it is safe only
while tests in a file run one after another (Vitest's default). A concurrent test
(`test.concurrent`) that is still running when another finishes would have its fixture
destroyed by that cleanup. Today a concurrent test must use `manualCleanup()`.

Ideas to choose from:

- Tie each fixture to the test that built it, through the runner's per-test hook
  (`onTestFinished` in Vitest). The setup passes the hook to the package, and cleanup
  destroys only that test's fixtures.
- Fail loudly when a fixture is built inside a concurrent test without `manualCleanup()`,
  if the runner exposes that the test is concurrent.

## Template patterns: `as` (`packages/core/src/view/internal/template/pattern.ts`)

### 1. `as` is not accepted by `@map`'s `let`

**Problem.** `@case { id, name } as user` binds the whole value next to the pattern's
names, but `@map (items) let { id } as row` is refused: `let` takes a name or a
destructuring pattern, and the rule in `itemOf` does not yet accept an alias. A row
that wants both its fields and the whole item must name the item, then read its fields.

**To do.** Allow the `as` kind in `itemOf`, and check that its alias does not clash
with the `$`-prefixed implicit names, as the other names already are. The matcher
(`match` in `runtime/match-binding.ts`) already handles the kind, so only the block
builder changes.

## Template patterns: regex (`packages/core/src/view/internal/template/`)

### 1. A `<` in a `@case` header is read as markup

**Problem.** The tokenizer reads a template as HTML before the block syntax is parsed, so
a `<` in a block header starts a tag. A named group, `@case /(?<id>\d+)/`, fails with
`<id> is never closed`. The same happens to a relation written with `<` (`@case < 10`).
The `>` and `<=` forms in the same header are not affected in every position, but the
rule is the same. Unnamed groups and every other pattern work.

**To do.** Let the tokenizer treat a block header as text up to the body's `{`, the way
`caseBodyBrace` already finds it, so `<` in a header is not a tag. Then the named-group
form works in templates. The unit tests already cover the matcher.

### 2. A regex is not checked for catastrophic backtracking

**Problem.** A pattern such as `/^(a+)+$/` can take exponential time on a string that
almost matches. A `@case` is tried on every change detection cycle, so a slow regex
delays the whole view. Nothing limits its cost.

**To do.** Decide whether to refuse nested quantifiers at parse time, or to document the
risk and leave the author to write a linear regex.

