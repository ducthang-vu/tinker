// An element host: where a directive sits when it is on an element. The element is
// the directive's position, and its ElementRef and host bindings are read from it.
// The directive factory takes a host, so another kind of host (later: a container
// with no element) can be given to it without changing the directives.

/** The element a directive is on. */
export class ElementHost {
  constructor(readonly element: Element) {}
}
