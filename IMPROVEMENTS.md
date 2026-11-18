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
