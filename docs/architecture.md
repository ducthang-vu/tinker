# How the view layer fits together

This page explains how the view layer creates and owns components. It is
meant for someone reading the code for the first time. Diagrams are Mermaid,
which GitHub renders.

## Public and internal

Client code sees a few objects. Everything else is internal.

| Public | What it is for |
|---|---|
| `Engine` | Starts the app with `bootstrap`, and creates containers with `createViewContainer`. |
| `ComponentRef` | The handle of a component: `instance`, `host`, `setInput`, `subscribe`, `emit`, `destroy()`. |
| `ViewContainerRef` | Adds, moves and removes components at runtime. |
| `ElementRef` | The element a component or directive is on (`host`, `nativeElement`). |

| Internal | What it is for |
|---|---|
| `View` | One rendered component: its nodes, its element contexts, and its one reactive watch. |
| `ComponentFactory` | Builds a component: its injector, its template, its `View`. |
| `TemplateBuilder` | Builds one template's DOM and its bindings, and creates the components and directives in it. |
| `DirectiveFactory` | Creates the directives of one element, with the element's injector. |
| `ElementContext` | What is on one element: its directive instances, and at most one child `View`. |

`engine.createComponent` is deprecated and will be removed. See
[IMPROVEMENTS.md](../IMPROVEMENTS.md), "The engine's entry points".

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

1. **Root.** `engine.bootstrap(type)` finds the element on the page that
   matches the component's selector, and renders the component into it. Nothing
   is inserted: the element is already there.
2. **Template child.** A parent's template contains `<tk-item>`. The parent's
   `TemplateBuilder` builds that element first, then creates the component
   inside it, passing the parent context: the parent's injector and the
   parent's view, which owns the child.
3. **Runtime.** A directive injects `ViewContainerRef` on its element, and
   calls `createComponent(type)`. The factory creates the element from the
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

Each `View` owns the things created for it, and destroying the owner destroys
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
