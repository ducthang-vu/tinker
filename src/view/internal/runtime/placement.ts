// A placement: where a directive sits. When it is on an element, the element is the
// placement, and its ElementRef and host bindings are read from it. The directive
// factory takes a placement, so another kind (later: a container with no element)
// can be given to it without changing the directives.

/** The element a directive is on. */
export class Placement {
  constructor(readonly element: Element) {}
}
