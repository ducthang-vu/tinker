// Models: a value shared two ways between a directive or component and the
// template that uses it.
//
//   class Item {
//     readonly value = model<string>();              // private to the owner
//     edit(text: string) {
//       this.value.set(text);                        // emits valueChange
//     }
//   }
//
//   <tk-item [value]="name()" (valueChange)="onChange($event)">
//
// A model is an input and an output together. The template sets the input
// with `[value]`, and listens to the output `valueChange` with
// `(valueChange)`. The two directions are kept apart on purpose:
//
// - `set` and `update` are the owner's. They change the value and emit
//   `valueChange`, but only when the value really changed.
// - A value the template sets through `[value]` changes the value without
//   emitting. So the template never hears back its own update: its handler
//   runs only for changes the owner made.
//
// The owner keeps the model private. Anyone else that needs to read the value
// uses `asReadonly()`, which has no way to set it or to emit.

import { Emitter, Maybe } from "../../functional/index.ts";
import type { ReadonlySignal } from "../../signals/index.ts";
import { InputBinding, type InputSignal, registerInput } from "./input.ts";
import { registerChangeOutput } from "./output.ts";

/** A model: readable as a signal, and writable by its owner. */
export interface ModelSignal<T> extends InputSignal<T> {
  /** Set the value; emits `valueChange` if it changed. */
  set(value: T): void;
  /** Set the value computed from the current one; emits if it changed. */
  update(fn: (current: T) => T): void;
  /** A read-only view, for code that must read the value but not change it. */
  asReadonly(): ReadonlySignal<T>;
}

/** Declare a required model, as a field initializer: reading it before it is bound throws. */
export function model<T>(): ModelSignal<T>;
/** Declare an optional model, which holds `defaultValue` until the template binds it. */
export function model<T>(defaultValue: T): ModelSignal<T>;
export function model<T>(...defaultValue: [] | [T]): ModelSignal<T> {
  // A rest parameter tells "no default" apart from a default of `undefined`.
  const initial = defaultValue.length === 0 ? Maybe.none<T>() : Maybe.some(defaultValue[0] as T);
  const binding = InputBinding.create(initial);
  const emitter = Emitter.create<T, void, never>();

  const set = (value: T): void => {
    const unchanged = binding.current()
      .filter((current) => Object.is(current, value))
      .isSome();
    if (!unchanged) {
      binding.bind(value);
      emitter.emit(value);
    }
  };

  const readable = binding.signal;
  const handle = Object.assign(() => readable(), {
    set,
    update: (fn: (current: T) => T) => set(fn(readable())),
    asReadonly: (): ReadonlySignal<T> => readable,
  }) as unknown as ModelSignal<T>;

  // The template sees the model as an input (`[value]`) and as an output
  // (`(valueChange)`), both through the owner's instance.
  registerInput(handle, binding);
  registerChangeOutput(handle, emitter);
  return handle;
}
