// Fixtures: what a test holds on an element or a component/directive, and how
// queries find them. A query walks the DOM under an element and asks the engine
// what is on each element, so it sees every descendant, nested components included.

import { inputsOf, Maybe, outputsOf } from "@tinker/core";
import type { Engine } from "@tinker/core";
import type { TestingElement } from "./api.ts";

/** What a query looks for: a CSS selector, or a component or directive class. */
export type QueryTarget = string | (new () => object);

/** What fixtures need from their bed: the engine, and the classes replaced by overrides. */
export interface Scope {
  readonly engine: Engine;
  readonly replacements: ReadonlyMap<new () => object, new () => object>;
}

/** The name of the instance's class, for messages. */
function nameOf(instance: object): string {
  return instance.constructor.name;
}

/** The query target as the test wrote it, for messages. */
function describe(target: QueryTarget): string {
  return typeof target === "string" ? `"${target}"` : target.name;
}

/** A fixture for an element: it can be queried, and has no instance to drive. */
export function elementOf(element: Element, scope: Scope): TestingElement {
  return {
    element,
    getAttribute: (name: string) => element.getAttribute(name),
    dispatchEvent: (type: string, init?: EventInit) => {
      element.dispatchEvent(new Event(type, { bubbles: true, ...init }));
      scope.engine.flush();
    },
    query: (target: QueryTarget) => {
      const [first] = queryAll(element, target, scope);
      if (!first) {
        throw new Error(`No ${describe(target)} found under this element`);
      }
      return first;
    },
    queryAll: (target: QueryTarget) => queryAll(element, target, scope),
  } as TestingElement;
}

/** A fixture for the component or directive `instance`, on `element`. */
export function testingElementOf<T extends object>(
  instance: T,
  element: Element,
  scope: Scope,
): TestingElement<T> {
  const bindings = inputsOf(instance);
  const emitters = outputsOf(instance);
  const inputs: Record<string, unknown> = {};
  for (const [name, binding] of bindings) {
    // Read on access, not now: an input that nothing has bound throws when read.
    Object.defineProperty(inputs, name, { enumerable: true, get: () => binding.signal() });
  }
  const outputs: Record<string, unknown> = {};
  for (const [name, emitter] of emitters) {
    outputs[name] = emitter.stream;
  }
  return {
    ...elementOf(element, scope),
    instance,
    inputs,
    outputs,
    setInput: (name: string, value: unknown) => {
      const binding = bindings.get(name);
      if (!binding) {
        throw new Error(`${nameOf(instance)} has no input "${name}"`);
      }
      binding.bind(value);
    },
    emitOutput: (name: string, value: unknown) => {
      const emitter = emitters.get(name);
      if (!emitter) {
        throw new Error(`${nameOf(instance)} has no output "${name}"`);
      }
      emitter.emit(value);
    },
  } as unknown as TestingElement<T>;
}

/** Every descendant of `root` that matches `target`, in document order. */
function queryAll(
  root: Element,
  target: QueryTarget,
  scope: Scope,
): (TestingElement | TestingElement<object>)[] {
  if (typeof target === "string") {
    return Array.from(root.querySelectorAll(target), (element) => elementOf(element, scope));
  }
  // A replaced class is found as its replacement: the one that is on the page.
  const wanted = scope.replacements.get(target) ?? target;
  return Array.from(root.querySelectorAll("*"))
    .flatMap((element) => {
      const context = scope.engine.getContext(element)
        .getOrElse(undefined);
      if (!context) {
        return [];
      }
      const component = Maybe.map(context.componentView, (view) => view.component)
        .getOrElse(null);
      const instances: readonly unknown[] = component === null
        ? context.directives
        : [...context.directives, component];
      return instances
        .filter((instance): instance is object => instance instanceof wanted)
        .map((instance) => testingElementOf(instance, element, scope));
    });
}
