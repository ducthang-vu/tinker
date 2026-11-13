// The @Directive and @Component decorators.
//
// They mark a class and record its metadata. Nothing is registered or
// matched here; the template engine will read the metadata later to decide
// where directives and components apply.
//
// Like Angular (whose compiler turns these decorators into static `ɵdir` /
// `ɵcmp` fields), the metadata is stored as a static property of the class:
// read-only, hidden behind a private symbol, and never inherited.
//
// A component is a directive with a template: @Component also makes the
// class a directive with the same selector.

import { defineMetadata, ownMetadata } from "../utils/metadata.ts";
import type { AbstractClass } from "../utils/types.ts";

/** What a directive declares about itself. */
export interface DirectiveMetadata {
  /** Where the directive applies, e.g. `"[highlight]"`. */
  readonly selector: string;
  /**
   * Bindings on the host element. For now only event listeners, calling a
   * method with or without the event: `{ "(click)": "toggle($event)" }`.
   */
  readonly host?: Readonly<Record<string, string>>;
}

/** What a component declares about itself. */
export interface ComponentMetadata extends DirectiveMetadata {
  /** The component's template. */
  readonly template: string;
}

/** Keys of the static metadata properties (module-private). */
const DIRECTIVE_METADATA: unique symbol = Symbol("directive metadata");
const COMPONENT_METADATA: unique symbol = Symbol("component metadata");

/** Class decorator: marks the class as a directive. */
export function Directive(options: DirectiveMetadata) {
  const recorded: DirectiveMetadata = Object.freeze({
    selector: options.selector,
    ...(options.host && { host: Object.freeze({ ...options.host }) }),
  });
  return function <C extends AbstractClass>(target: C, _context: ClassDecoratorContext<C>): void {
    defineMetadata(target, DIRECTIVE_METADATA, recorded);
  };
}

/** Class decorator: marks the class as a component (and therefore a directive). */
export function Component(options: ComponentMetadata) {
  const recorded: ComponentMetadata = Object.freeze({
    selector: options.selector,
    template: options.template,
    ...(options.host && { host: Object.freeze({ ...options.host }) }),
  });
  const asDirective = Directive({ selector: options.selector, host: options.host });
  return function <C extends AbstractClass>(target: C, context: ClassDecoratorContext<C>): void {
    asDirective(target, context);
    defineMetadata(target, COMPONENT_METADATA, recorded);
  };
}

/** The directive metadata of `type` (components included), or `undefined`. */
export function getDirectiveMetadata(type: AbstractClass): DirectiveMetadata | undefined {
  return ownMetadata(type, DIRECTIVE_METADATA);
}

/** The component metadata of `type`, or `undefined` if it is not a component. */
export function getComponentMetadata(type: AbstractClass): ComponentMetadata | undefined {
  return ownMetadata(type, COMPONENT_METADATA);
}
