// A ComponentRef: the handle client code gets for a component it created
// (through `engine.createComponent`, `engine.bootstrap` or a ViewContainerRef).
// It is the public face of a View, which stays internal: the instance, its host
// element, its public inputs (set with `setInput`), its public outputs (emitted
// with `emit`), and its destruction. A field is reachable here only when the
// component's author made it public: a private input or output is not in the
// types, so it cannot be named.

import { Maybe } from "../../functional/index.ts";
import type { InputName, InputValue } from "./authoring/input.ts";
import { type OutputName, type OutputValue, outputsOf } from "./authoring/output.ts";
import { ElementRef } from "./runtime/element-ref.ts";
import type { View } from "./runtime/view.ts";

export class ComponentRef<T extends object> {
  /** The element the component is rendered into. */
  readonly host: ElementRef<Element>;

  /** @param view The view the engine created for the component (internal). */
  constructor(private readonly view: View<T>) {
    this.host = new ElementRef(view.host);
  }

  /** The component instance. */
  get instance(): T {
    return this.view.component;
  }

  /**
   * Set a public input, e.g. `ref.setInput("title", "Hello")`. The component
   * sees the new value like any signal: the DOM follows at the next change
   * detection.
   */
  setInput<K extends InputName<T>>(name: K, value: InputValue<T[K]>): void {
    this.view.setInput(name, value);
  }

  /**
   * Subscribe to a public output, e.g. `ref.subscribe("selected", (n) => ...)`:
   * `handler` is called for each value, until the returned function is called.
   */
  subscribe<K extends OutputName<T>>(
    name: K,
    handler: (value: OutputValue<T[K]>) => void,
  ): () => void {
    return this.emitterOf(name).stream.run({
      next: (value) => handler(value as OutputValue<T[K]>),
    });
  }

  /**
   * Emit a public output, e.g. `ref.emit("selected", 3)`: every template
   * subscribed to it hears the value, as if the component had emitted it.
   */
  emit<K extends OutputName<T>>(name: K, value: OutputValue<T[K]>): void {
    this.emitterOf(name)
      .emit(value);
  }

  private emitterOf(name: string) {
    return Maybe.fromNullable(outputsOf(this.view.component)
      .get(name))
      .getOrThrow(() => new Error(`${this.view.component.constructor.name} has no output "${name}"`));
  }

  /** Destroy the component and everything it owns. Calling it again does nothing. */
  destroy(): void {
    this.view.destroy();
  }
}

/** Wrap a view for client code. */
export function refOf<T extends object>(view: View<T>): ComponentRef<T> {
  return new ComponentRef(view);
}
