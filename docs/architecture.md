# How the view layer fits together

This page explains how the view layer creates and owns components. It is
meant for someone reading the code for the first time. Diagrams are Mermaid,
which GitHub renders.

## Public and internal

Client code sees a few objects. Everything else is internal.

| Public | What it is for |
|---|---|
| `bootstrap` | Starts an app and returns its `AppRef` (`root`, `destroy()`). The engine behind it is internal. |
| `ComponentRef` | The handle of a component: `instance`, `host`, `setInput`, `subscribe`, `emit`, `destroy()`. |
| `ViewContainerRef` | Adds, moves and removes components at runtime. |
| `ElementRef` | The element a component or directive is on (`host`, `nativeElement`). |
| `queryAll` | A signal of the instances of a type, in document order. `{ from: "content" }` reads the children the parent passes in instead of the component's own template; `{ read: ElementRef }` gives their elements. |
| `query` | A signal of the first of those, as a `Maybe` (none when there is none). The same options apply. A string target (`query<Tab>("tab")`) reads the top-level template variable `#tab`, `#tab="exportAs"` or `##tab`: the element or instance it names. |
| `query.required` | The same, as the instance itself. Reading it when there is no match throws `QueryMissingError`. |
| replaced classes | A query for a class matches its replacement when one is set (`CLASS_REPLACEMENTS`), so a mock of a child is found by the child's class. |

| Internal | What it is for |
|---|---|
| `View` | The interface the factories and containers work with: destroy callbacks, inputs, elements, destroy. |
| `ComponentView` | A component's template, on the host element the author wrote: its nodes, element contexts, and one reactive watch. |
| `EmbeddedView` | A block's template, after an anchor comment: its top-level nodes and its own watch. |
| `ComponentFactory` | Builds a component: its injector, its template, its `ComponentView`. |
| `TemplateBuilder` | Builds one template's DOM and its bindings, and creates the components and directives in it. |
| `DirectiveFactory` | Creates the directives of one element, with the element's injector. |
| `ElementContext` | What is on one element: its directive instances, and at most one child `ComponentView`. |

## Three ways a component is created

Every component is created in one of three ways. Each one asks
`ComponentFactory` to build it, and differs only in where the component's
element comes from.

```mermaid
flowchart LR
  subgraph Root["1. Root: bootstrap"]
    R1["element already on the page"] --> RF["ComponentFactory<br/>builds inside it"]
  end
  subgraph Tpl["2. Template child"]
    T1["element built by the parent's template"] --> TF["ComponentFactory<br/>builds inside it,<br/>with the parent's context"]
  end
  subgraph Run["3. Runtime: ViewContainerRef"]
    V1["no element yet"] --> VF["ComponentFactory<br/>creates the element from the selector"]
    VF --> VI["the container inserts it<br/>before its anchor"]
  end
```

1. **Root.** `bootstrap(type)` finds the element on the page that
   matches the component's selector, and creates the component in it. Nothing
   is inserted: the element is already there. Its first render runs on the next
   tick, after its inputs can be bound (see
   [change-detection.md](change-detection.md#when-the-dom-is-ready)).
2. **Template child.** A parent's template contains `<tk-item>`. The parent's
   `TemplateBuilder` builds that element first, then creates the component
   inside it, passing the parent context: the parent's injector and the
   parent's view, which owns the child.
3. **Runtime.** A directive injects `ViewContainerRef` on its element, and
   calls `createComponent(type)` on a container. The factory creates the element from the
   selector, and the container inserts it before its anchor, in order.

Only the runtime case uses a container. A template child is built by its
parent's template, and the root fills an element that is already there.

## Where a component's element comes from

`ComponentFactory.create` takes an optional host:

- **With a host**, it builds the component inside that element (cases 1 and 2).
- **Without one**, it creates the element from the component's selector, so
  `tk-item` gives `<tk-item>` and `[item]` gives `<div item>` (case 3).

The factory never inserts the element into the page. Whoever placed the
component does that: the container, for case 3, and the template, for case 2.

## Runtime components and their anchor

A `ViewContainerRef` is a position in the page, marked by a comment node called
its anchor. Each component it holds has its element placed just before the
anchor, in the container's order.

```mermaid
sequenceDiagram
  participant D as Directive on div list
  participant C as ViewContainerRef
  participant F as ComponentFactory
  participant V as View

  D->>C: inject(ViewContainerRef)
  Note over C: the first injection adds the anchor<br/>right after div list
  D->>C: createComponent(Item)
  C->>F: create(Item), no host
  F->>V: a View, with its element built from the selector
  F-->>C: the ComponentRef
  C->>C: insert the element before the anchor
```

The container doesn't create the element and doesn't create the anchor on its
own: the factory builds the element, and the directive's element creates the
anchor when a directive first injects the container. Nothing is added to the
page for an element that never injects its container.

## Who owns what

Each view owns the things created for it, and destroying the owner destroys
them. The owner is the view whose template contains the element:

- A child component is owned by its parent's view.
- A runtime component is owned by the view of the directive that injected the
  container. When that view is destroyed, the container clears its components
  and removes its anchor.
- The root component is owned by nothing: destroy it through its `ComponentRef`.

```mermaid
flowchart TB
  P["parent View"] -->|owns| C["child View"]
  P -->|owns| K["ViewContainerRef (if injected)"]
  K -->|owns| R["components added at runtime"]
  P -->|destroy, then| N["its nodes are removed from the page"]
```

## View queries

Each component has a `ViewQueries` registry, provided in its own injector. The
template builder records each directive and component instance it creates, with
the element it sits on, and removes it when its owning view is destroyed. Embedded
views (`@if` branches, `@map` rows) record into the same registry, since they
belong to the component's template. A child component's template records into its
own registry, so `queryAll` never lists the items inside a child.

Top-level template variables are also in the registry, by name, so `query("name")`
finds them. A variable inside an `@if` branch or a `@map` row is not, since one name
can appear many times; query those by a class instead.

Content is a second registry per component. A parent that builds a component's
element records its direct element children into it, as well as into its own
registry, so `queryAll(Type, { from: "content" })` in the component lists the
children the parent passed in (only the direct ones; a child nested in a plain
element or in a block is not in it).

`queryAll(type)` reads the registry in document order. A `@map` that moves
its rows tells the registry, which then sorts again.

Not built yet: a template variable as the target of `queryAll` (only `query` takes one).

## Template references

`#name` on an element declares a value for the template: the native element.
It is read like an `@let`, as `name.tagName` (not `name()`), and it is the same
element whether or not a directive or component is on it. In the component's own
template a reference can be read before its element, since bindings read it when
they update. A branch of `@if`, `@match` or `@map` copies the references declared
above it when it is built, so it cannot read one declared after the branch.
Two more forms reach the directives and component on the element:

- `#name="exportAs"`: the instance of the directive, or the component, whose
  `exportAs` metadata is that name. Each directive and component declares its
  own `exportAs`, so a template names what it wants.
- `##name`: the component on the element, as sugar for that. The element itself
  is still `#name`.

An `exportAs` that no directive on the element has, and `##` on an element with
no component, are errors. These references are set once the directives on their
element exist, so they are read in bindings after that, not while the element is built.

## Containers

`<tk-container>` is a position with no element. It renders its content, then a
comment anchor, and the views its directives render go after that content. Its
directives can take inputs and inject `ViewContainerRef` on the anchor. They cannot
have host bindings or `ElementRef`, since there is no element. So the compiler
rejects, on a container: class, style and attribute bindings, DOM event bindings,
components, and `#name` references. A directive that needs an element, in its
metadata, fails with an error when it is put on a container.

A directive is on a `Placement`: an `ElementPlacement` (its element), or a
`ContainerPlacement` (the container's anchor).

## Declared templates and the outlet

`<template #name>body</template>` declares a template. It renders nothing where it
is, and `#name` is a value holding it, a `TemplateRef`. The `Outlet` directive
renders that template where its host is: `<tk-container [outlet]="name">`, or any
element, and each outlet renders its own instance. An instance reads the names
visible where the template was declared, as a closure does.

`<template #name let-x>` declares the names its instances take. The outlet's
`context` input (or `createEmbeddedView`'s second argument) gives each name its value.
A changed context updates the instance in place: the outlet keeps one signal per
`let-` name, and sets it. The instance is rendered again only when the template changes.
A context is a set of named signals (`runtime/context.ts`). The framework's `$`
variables of a `@map` row are entries of one, the same as a caller's values, so both
go through the same path to a template's scope.

## Qualified bindings

An input or output binding can name the directive or component it is for:
`[abc.label]="value"` and `(abc.fired)="handler()"` reach only the instance whose selector
is `abc`. The plain form, `[label]` and `(fired)`, still works. When it would reach two
instances on the same element, the template fails to build and names the qualified form
to write. A qualified output is the directive's alone: it does not bind the DOM event of
the same name. A leading name in an event is an owner, except when it is followed by a single
modifier name such as `.prevent` or `.enter`. Then the name after the owner is an output if the
owner has one, and otherwise the DOM event with that modifier: `(click.prevent)` is the DOM
event unless some directive selects `click` and has a `prevent` output. Outputs named like
modifiers therefore work, as in `(keys.enter)` for an output `enter` of a `[keys]` directive.

## Glossary

- **Host**: the element a component is rendered into. Its `ElementRef` is
  `ComponentRef.host`.
- **Anchor**: the comment node that marks a container's position in the page.
- **Parent context**: what a component gets from the component it sits in: the
  parent injector and the parent view (`ParentContext` in the code).
- **Slot content**: the children of a component's element, which its `<slot>`s
  show.

## Notes for reading the code

- **Two kinds of injector.** A component has its own injector, which is a child
  of its element's injector, or of the engine's for a root. Each element with
  directives has an element injector, shared by its directives.
- **One reactive watch per view.** A view's watch updates its template's
  bindings, and the host bindings of its child components on their elements.
- **Elements with nothing on them are plain.** An element gets an
  `ElementContext` only when a directive, a component or an event binding is on
  it.
