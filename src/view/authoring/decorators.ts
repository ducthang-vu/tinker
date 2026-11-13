// The @Directive and @Component decorators.
//
// They mark a class and record its metadata. Nothing is registered here:
// a component lists the directives its template may use in `imports`, and
// the template compiler matches their selectors against its elements.
//
// Like Angular (whose compiler turns these decorators into static `ɵdir` /
// `ɵcmp` fields), the metadata is stored as a static property of the class:
// read-only, hidden behind a private symbol, and never inherited.
//
// A component is a directive with a template: @Component also makes the
// class a directive with the same selector.

import type { Provider } from "../../di/index.ts";
import type { Maybe } from "../../functional/index.ts";
import { defineMetadata, ownMetadata } from "../../utils/metadata.ts";
import type { AbstractClass, Class } from "../../utils/types.ts";

/** What a directive declares about itself. */
export interface DirectiveMetadata {
  /** Where the directive applies, e.g. `"[highlight]"`. */
  readonly selector: string;
  /**
   * Bindings on the host element. For now only event listeners, calling a
   * method with or without the event: `{ "(click)": "toggle($event)" }`.
   */
  readonly host?: Readonly<Record<string, string>>;
  /**
   * Services for this directive and the directives around it: provided in
   * the injector of each element it is on, so each element gets its own,
   * destroyed with it. The directives on that element and on its
   * descendants can inject them.
   */
  readonly providers?: readonly Provider[];
}

/** What a component declares about itself. */
export interface ComponentMetadata extends DirectiveMetadata {
  /** The component's template. */
  readonly template: string;
  /**
   * Services for this component and what it contains: provided in the
   * component's own injector, so each instance of the component gets its
   * own, destroyed with it.
   */
  readonly providers?: readonly Provider[];
  /**
   * The directives the template may use: an element gets each one whose
   * selector it matches. Only these: nothing is matched globally.
   */
  readonly imports?: readonly Class<object>[];
  /**
   * Directives applied to the component's own host element, whatever its
   * selector says: created before the component, in its injector, so the
   * component can inject them (composition, instead of inheritance).
   */
  readonly hostDirectives?: readonly Class<object>[];
}

/** Keys of the static metadata properties (module-private). */
const DIRECTIVE_METADATA: unique symbol = Symbol("directive metadata");
const COMPONENT_METADATA: unique symbol = Symbol("component metadata");

/** Class decorator: marks the class as a directive. */
export function Directive(options: DirectiveMetadata) {
  const recorded: DirectiveMetadata = Object.freeze({
    selector: options.selector,
    ...(options.host && { host: Object.freeze({ ...options.host }) }),
    ...(options.providers && { providers: Object.freeze([...options.providers]) }),
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
    ...(options.providers && { providers: Object.freeze([...options.providers]) }),
    ...(options.imports && { imports: Object.freeze([...options.imports]) }),
    ...(options.hostDirectives && { hostDirectives: Object.freeze([...options.hostDirectives]) }),
  });
  const asDirective = Directive({ selector: options.selector, host: options.host });
  return function <C extends AbstractClass>(target: C, context: ClassDecoratorContext<C>): void {
    asDirective(target, context);
    defineMetadata(target, COMPONENT_METADATA, recorded);
  };
}

/** The directive metadata of `type` (components included), if it is a directive. */
export function getDirectiveMetadata(type: AbstractClass): Maybe<DirectiveMetadata> {
  return ownMetadata(type, DIRECTIVE_METADATA);
}

/** The component metadata of `type`, if it is a component. */
export function getComponentMetadata(type: AbstractClass): Maybe<ComponentMetadata> {
  return ownMetadata(type, COMPONENT_METADATA);
}
