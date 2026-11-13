// Inputs: how a directive (or component) receives values from the template
// it is used in.
//
//   @Directive({ selector: "[tooltip]" })
//   class Tooltip {
//     readonly text = input<string>();          // required
//     readonly position = input("top");         // optional, "top" until bound
//     readonly shout = computed(() => this.text().toUpperCase());
//   }
//
//   <button tooltip [text]="message()">
//
// For the directive, an input is a read-only signal: it can be read, tracked
// and used in computeds like any other. Only the framework sets it, through
// its InputBinding:
// - a directive's inputs, from the bindings in the template it is used in
//   (the view's watch will do that);
// - a component's inputs, through `view.setInput(name, value)` on the
//   component's own view: called by code creating the component, and later
//   by the parent view's watch for bindings on the component's host element.
//
// - A required input (`input<T>()`) has no value until it is bound: reading
//   it before throws InputNotBoundError, e.g. in the constructor, since
//   bindings are set after the instance is created.
// - An optional input (`input(defaultValue)`) has its default until it is
//   bound, so it can always be read.

import { Maybe } from "../../functional/index.ts";
import { computed, type ReadonlySignal, type Signal, signal } from "../../signals/index.ts";

declare const INPUT_TYPE: unique symbol;

/** A read-only signal set by the framework from a template binding. */
export interface InputSignal<T> extends ReadonlySignal<T> {
  /** Type-only marker, telling an input apart from other signals. Never set at runtime. */
  readonly [INPUT_TYPE]: T;
}

/** The names of the inputs of a directive or component of type `T`. */
export type InputName<T> = {
  [K in keyof T]: T[K] extends InputSignal<unknown> ? K : never;
}[keyof T] &
  string;

/** The type of value an input accepts: `string` for an `InputSignal<string>`. */
export type InputValue<S> = S extends InputSignal<infer V> ? V : never;

/** Thrown when an input is read before the framework bound a value to it. */
export class InputNotBoundError extends Error {
  /** @param label Which input, e.g. `"text" of Tooltip`, if known yet. */
  constructor(label: Maybe<string>) {
    super(
      label.match({
        some: (name) => `Input ${name} was read before it was bound`,
        none: () => "An input was read before it was bound (e.g. in the constructor)",
      }),
    );
    this.name = "InputNotBoundError";
  }
}

/** The framework's side of an input: binds values to the signal the directive reads. */
export class InputBinding<T> {
  private readonly state: Signal<Maybe<T>>;
  private label = Maybe.none<string>();
  /** The signal the directive reads. */
  readonly signal: InputSignal<T>;

  private constructor(initial: Maybe<T>) {
    this.state = signal(initial);
    this.signal = computed(() =>
      this.state().getOrThrow(() => new InputNotBoundError(this.label)),
    ) as InputSignal<T>;
  }

  /** @internal Use `input()`. @param initial The default value, for an optional input. */
  static create<T>(initial: Maybe<T>): InputBinding<T> {
    return new InputBinding(initial);
  }

  /** Name the input, for error messages (e.g. `"text" of Tooltip`). */
  describe(label: string): void {
    this.label = Maybe.some(label);
  }

  /** Set the input's value. The directive's signal updates like any signal. */
  bind(value: T): void {
    this.state.set(Maybe.some(value));
  }
}

/** The binding of each input signal created by `input()`. */
const bindings = new WeakMap<object, InputBinding<unknown>>();

/**
 * Declare a required input, as a field initializer: `readonly text = input<string>()`.
 * Its value comes from the template binding of the same name; reading it
 * before that throws InputNotBoundError.
 */
export function input<T>(): InputSignal<T>;
/**
 * Declare an optional input: `readonly position = input("top")`. It holds
 * `defaultValue` until the template binding of the same name sets it.
 */
export function input<T>(defaultValue: T): InputSignal<T>;
export function input<T>(...defaultValue: [] | [T]): InputSignal<T> {
  // A rest parameter tells "no default" apart from a default of `undefined`.
  const initial = defaultValue.length === 0 ? Maybe.none<T>() : Maybe.some(defaultValue[0] as T);
  const binding = InputBinding.create(initial);
  bindings.set(binding.signal, binding as InputBinding<unknown>);
  return binding.signal;
}

/**
 * The inputs of `directive`, by name: its own properties holding a signal
 * created by `input()`. Each one is named after its property.
 */
export function inputsOf(directive: object): ReadonlyMap<string, InputBinding<unknown>> {
  const inputs = new Map<string, InputBinding<unknown>>();
  for (const [name, value] of Object.entries(directive)) {
    Maybe.fromNullable(bindings.get(Object(value))).ifSome((binding) => {
      binding.describe(`"${name}" of ${directive.constructor.name}`);
      inputs.set(name, binding);
    });
  }
  return inputs;
}
