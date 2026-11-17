// A placement: where a directive sits. On an element, the element is the placement:
// its ElementRef and host bindings are read from it. On a `<tk-container>`, the
// placement is the container's anchor, a comment with no element: such a directive
// can take inputs and inject its ViewContainerRef, but not host bindings or ElementRef.

/** A directive on an element. */
export class ElementPlacement {
  readonly kind = "element";

  constructor(readonly element: Element) {}
}

/** A directive on a `<tk-container>`: the anchor is where the container is. */
export class ContainerPlacement {
  readonly kind = "container";

  constructor(readonly anchor: Comment) {}
}

export type Placement = ElementPlacement | ContainerPlacement;
