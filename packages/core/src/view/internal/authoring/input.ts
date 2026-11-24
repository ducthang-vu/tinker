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
// - Options (`input(defaultValue, { name, adapter })`): `name` is the name templates
//   use, in `[name]` and in a plain `name="…"` attribute; `adapter` turns that
//   attribute's string into the input's type (see input-adapters.ts). Template
//   bindings are already typed, so they skip the adapter.

import { computed, type ReadonlySignal, type Signal, signal, untracked } from "../../../signals/index.ts";
import { match, Some, None, fromNullable, getOrThrow, use, type Maybe } from "@tinker/functional";

declare const INPUT_TYPE: unique symbol;

/** A read-only signal set by the framework from a template binding. */
export interface InputSignal<T> extends ReadonlySignal<T> {
  /** Type-only marker, telling an input apart from other signals. Never set at runtime. */
  readonly [INPUT_TYPE]: T;
}

/** The names of the inputs of a directive or component of type `T`. */
export type InputName<T> = {
  [K in keyof T]: T[K] extends InputSignal<unknown> ? K : never;
}[keyof T]
& string;

/** The type of value an input accepts: `string` for an `InputSignal<string>`. */
export type InputValue<S> = S extends InputSignal<infer V> ? V : never;

/** Thrown when an input is read before the framework bound a value to it. */
export class InputNotBoundError extends Error {
  /** @param label Which input, e.g. `"text" of Tooltip`, if known yet. */
  constructor(label: Maybe<string>) {
    super(
      match(label, { Some: (name) => `Input ${name} was read before it was bound`, None: () => "An input was read before it was bound (e.g. in the constructor)" }),
    );
    this.name = "InputNotBoundError";
  }
}

/** The options of `input()`: the name templates use, and how a plain attribute's string is read. */
export interface InputOptions<T> {
  /**
   * The name templates use for the input: `[name]="…"` and the plain attribute
   * `name="…"`. Without it, the property's name is used. Code always uses the property.
   */
  readonly name?: string;
  /**
   * Turns the string of a plain attribute (`size="3"`) into the input's type, e.g.
   * `numberAdapter`. Template bindings (`[size]="3"`) are already typed and skip it.
   * Without one, the string is set as it is.
   */
  readonly adapter?: (value: string) => T;
}

/** The framework's side of an input: binds values to the signal the directive reads. */
export class InputBinding<T> {
  private readonly state: Signal<Maybe<T>>;
  private label = None.of<string>();
  /** The signal the directive reads. */
  readonly signal: InputSignal<T>;
  /** The name templates use for the input, if it has one (`input(…, { name })`). */
  readonly alias: string | undefined;
  private readonly adapter: ((value: string) => T) | undefined;

  private constructor(initial: Maybe<T>, options: InputOptions<T>) {
    this.state = signal(initial);
    this.alias = options.name;
    this.adapter = options.adapter;
    this.signal = computed(() =>
      getOrThrow(this.state(), () => new InputNotBoundError(this.label)),
    ) as InputSignal<T>;
  }

  /**
   * @internal Use `input()`. @param initial The default value, for an optional input.
   * @param options The name and adapter, if any.
   */
  static create<T>(initial: Maybe<T>, options: InputOptions<T> = {}): InputBinding<T> {
    return new InputBinding(initial, options);
  }

  /** Name the input, for error messages (e.g. `"text" of Tooltip`). */
  describe(label: string): void {
    this.label = Some.of(label);
  }

  /** Set the input's value. The directive's signal updates like any signal. */
  bind(value: T): void {
    this.state.set(Some.of(value));
  }

  /**
   * Set the input from a plain attribute's string: through the adapter, if it has one. Returns
   * the value it set.
   */
  bindText(text: string): T {
    const value = this.adapter === undefined ? (text as T) : this.adapter(text);
    this.bind(value);
    return value;
  }

  /** The current value, if there is one, read without tracking it. */
  current(): Maybe<T> {
    return untracked(() => this.state());
  }
}

/** The binding of each input signal created by `input()`. */
const bindings = new WeakMap<object, InputBinding<unknown>>();

/**
 * Declare a required input, as a field initializer: `readonly text = input<string>()`.
 * Make it `private` unless other code should set it: inputs are set by the template.
 * Its value comes from the template binding of the same name; reading it
 * before that throws InputNotBoundError.
 */
export function input<T>(): InputSignal<T>;
/**
 * Declare an optional input: `private readonly position = input("top")`. It holds
 * `defaultValue` until the template binding of the same name sets it.
 */
export function input<T>(defaultValue: T): InputSignal<T>;
/**
 * Declare an input with options: `readonly size = input({ adapter: numberAdapter })`
 * (required), or `readonly label = input("", { name: "title" })` (optional, and set by
 * `title="…"` in templates). A plain attribute's string goes through the adapter.
 */
export function input<T>(options: InputOptions<T>): InputSignal<T>;
/** Declare an optional input with options: `input(0, { adapter: numberAdapter })`. */
export function input<T>(defaultValue: T, options: InputOptions<T>): InputSignal<T>;
export function input<T>(...args: unknown[]): InputSignal<T> {
  const [first, second] = args;
  if (args.length === 0) {
    return createInput(None.of<T>(), {});
  }
  if (args.length === 1 && isOptions(first)) {
    return createInput(None.of<T>(), first as InputOptions<T>);
  }
  return createInput(Some.of(first as T), (second ?? {}) as InputOptions<T>);
}

function createInput<T>(initial: Maybe<T>, options: InputOptions<T>): InputSignal<T> {
  const binding = InputBinding.create(initial, options);
  bindings.set(binding.signal, binding as InputBinding<unknown>);
  return binding.signal;
}

/**
 * Whether the single argument of `input()` is its options rather than a default value:
 * an object with a `name` or an `adapter` key. An object default with one of those keys
 * must be passed with options: `input(value, {})`.
 */
function isOptions(value: unknown): boolean {
  return typeof value === "object" && value !== null && ("name" in value || "adapter" in value);
}

/**
 * The inputs of `directive`, by name: its own properties holding a signal
 * created by `input()`. Each one is named after its property.
 */
/**
 * Make `key` an input of its owner, set through `binding`. Used by `model()`,
 * whose readable side is the input (internal).
 */
export function registerInput<T>(key: object, binding: InputBinding<T>): void {
  bindings.set(key, binding as InputBinding<unknown>);
}

export function inputsOf(directive: object): ReadonlyMap<string, InputBinding<unknown>> {
  const inputs = new Map<string, InputBinding<unknown>>();
  for (const [name, value] of Object.entries(directive)) {
    use(fromNullable(bindings.get(Object(value))), { Some: (binding) => {
      binding.describe(`"${name}" of ${directive.constructor.name}`);
      inputs.set(name, binding);
    }, None: () => undefined });
  }
  return inputs;
}

/**
 * The inputs of `instance` by the name templates use: the input's `name` option if it
 * has one, else its property's name.
 */
function templateInputsOf(instance: object): [string, InputBinding<unknown>][] {
  return [...inputsOf(instance)]
    .map(([property, binding]) => [binding.alias ?? property, binding]);
}

/**
 * Bind each input of `instance` named like one of `attributes` (plain
 * attributes of its element) to the attribute's value, through the input's adapter
 * if it has one. Names are compared case-insensitively: the browser's parser
 * lowercases attribute names.
 */
export function bindInputsToAttributes(
  instance: object,
  attributes: readonly { readonly name: string; readonly value: string }[],
  report?: AttributeReport,
): void {
  const inputs = templateInputsOf(instance);
  for (const attribute of attributes) {
    use(
      fromNullable(inputs.find(([name]) => name.toLowerCase() === attribute.name.toLowerCase())),
      { Some: ([, input]) => {
        const value = input.bindText(attribute.value);
        if (report !== undefined && typeof value === "number" && Number.isNaN(value)) {
          report.warn(`${attribute.name}="${attribute.value}" on <${report.element}> is not a number: the input is NaN`);
        }
      }, None: () => undefined },
    );
  }
}

/**
 * Where a plain attribute's problem is reported: the element it is on, and a warning sink. Given
 * only in development mode, so production makes no report.
 */
export interface AttributeReport {
  readonly element: string;
  readonly warn: (message: string) => void;
}

/**
 * The inputs named `name` (case-insensitively: the browser's parser
 * lowercases attribute names) among those of `instances`, e.g. the
 * directives and the component on one element.
 */
export function inputsNamed(instances: readonly object[], name: string): InputBinding<unknown>[] {
  return instances.flatMap((instance) => templateInputsOf(instance)
    .filter(([inputName]) => inputName.toLowerCase() === name.toLowerCase())
    .map(([, input]) => input));
}
