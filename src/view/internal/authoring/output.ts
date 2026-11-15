// Outputs: how a directive tells the template that uses it that something
// happened, e.g. a selection.
//
//   @Directive({ selector: "[pick]", host: { "(click)": "pick()" } })
//   class Pick {
//     readonly selected = output<number>();
//     pick() { this.selected.emit(this.id); }
//   }
//
//   <button pick (selected)="choose($event)">…</button>
//
// The directive owns an output and can only emit to it. The template that
// uses the directive subscribes with `(name)="method($event)"`, and is called
// for every value, in order, for as long as its view lives. Outputs are hot:
// a value emitted while nobody listens is lost, as a DOM event is. When the
// directive is destroyed, its outputs complete, which ends every subscription.
//
// Output names match case-insensitively, since the browser's parser lowercases
// attribute names. Outputs of components are not supported yet.

import { Emitter } from "../../../functional/index.ts";
import { Maybe } from "../../../functional/index.ts";

/** What a directive emits through: it can emit, and nothing else. */
export interface Output<T> {
  /** Emit a value: every template subscribed to this output hears it. */
  emit(value: T): void;
}

/** The names of the outputs of a directive or component of type `T`: its public `Output` fields. */
export type OutputName<T> = {
  [K in keyof T]: T[K] extends Output<unknown> ? K : never;
}[keyof T]
& string;

/** The value an output of type `S` emits. */
export type OutputValue<S> = S extends Output<infer V> ? V : never;

/** The emitter behind each output: the framework subscribes to it and completes it. */
const emitters = new WeakMap<object, Emitter<unknown, void, never>>();
/** Keys of outputs that are named `<property>Change` (a model's). */
const changeOutputs = new WeakSet<object>();

/**
 * Make `key` an output of its owner, emitted through `emitter`, and named
 * `<property>Change` (internal, used by `model()`).
 */
export function registerChangeOutput<T>(key: object, emitter: Emitter<T, void, never>): void {
  emitters.set(key, emitter as unknown as Emitter<unknown, void, never>);
  changeOutputs.add(key);
}

/**
 * Declare an output, as a field initializer: `readonly selected = output<number>()`.
 * Make it `private` unless other code should emit it: only the owner emits.
 */
export function output<T>(): Output<T> {
  const emitter = Emitter.create<T, void, never>();
  const handle: Output<T> = { emit: (value) => emitter.emit(value) };
  emitters.set(handle, emitter as unknown as Emitter<unknown, void, never>);
  return handle;
}

/** The outputs of `instance`, by property name. */
export function outputsOf(instance: object): ReadonlyMap<string, Emitter<unknown, void, never>> {
  const outputs = new Map<string, Emitter<unknown, void, never>>();
  for (const [property, value] of Object.entries(instance)) {
    Maybe.fromNullable(emitters.get(Object(value)))
      .ifSome((emitter) => {
        const name = changeOutputs.has(Object(value)) ? `${property}Change` : property;
        outputs.set(name, emitter);
      });
  }
  return outputs;
}

/**
 * The outputs named `name` (case-insensitively) among those of `instances`,
 * e.g. the directives on one element.
 */
export function outputsNamed(
  instances: readonly object[],
  name: string,
): Emitter<unknown, void, never>[] {
  return instances.flatMap((instance) => [...outputsOf(instance)]
    .filter(([outputName]) => outputName.toLowerCase() === name.toLowerCase())
    .map(([, emitter]) => emitter));
}

/** Complete the outputs of `instance`: its subscribers are told the output is over. */
export function endOutputs(instance: object): void {
  for (const emitter of outputsOf(instance)
    .values()) {
    emitter.complete(undefined);
  }
}
