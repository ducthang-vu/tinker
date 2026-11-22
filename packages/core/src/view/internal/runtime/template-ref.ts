// A TemplateRef: a template declared with `<template #name let-x>`. It is a value,
// like an `@let`, and renders nothing where it is declared. Each instance renders the
// body where a container asks for it, with a context: a value for each `let-` name.
// The instance also reads the names visible where the template was declared, as a
// closure does.

import type { Injector } from "../../../di/index.ts";
import { type Either, Left, map, Right, sequence } from "@tinker/functional/v1";
import { type ReadonlySignal, signal, type Signal } from "../../../signals/index.ts";
import type { CompiledNode } from "../template/compile.ts";
import { Scope } from "../template/scope.ts";
import { type Context, scopeWith } from "./context.ts";
import type { EmbeddedView } from "./embedded-view.ts";

/** Renders an instance: its body, its scope, the anchor it goes before, and the injector. */
export type InstanceRenderer = (
  body: readonly CompiledNode[],
  scope: Scope,
  anchor: Node,
  injector: Injector,
) => EmbeddedView;

/** The plain values a caller gives an instance, by the `let-` names it declares. */
export type TemplateContext = Readonly<Record<string, unknown>>;

export class TemplateRef {
  /**
   * @param body What the template renders.
   * @param names The `let-` names it declares: its context must give each one.
   * @param declared The scope it was declared in: what its instances can read.
   * @param render Renders an instance.
   */
  constructor(
    private readonly body: readonly CompiledNode[],
    private readonly names: readonly string[],
    private readonly declared: Scope,
    private readonly render: InstanceRenderer,
  ) {}

  /** The `let-` names an instance reads from its context. */
  get letNames(): readonly string[] {
    return this.names;
  }

  /**
   * One signal per declared name, holding its value in `values`: what an instance
   * reads, to be updated in place with `setSignals`. An error if a name is missing.
   */
  signalsFor(values: TemplateContext): Either<Map<string, Signal<unknown>>, Error> {
    return map(this.valuesOf(values), (found) =>
      new Map([...found].map(([name, value]) => [name, signal(value)] as const)));
  }

  /**
   * Set each signal of an instance (from `signalsFor`) to its value in `values`. An error,
   * with nothing set, if a name is missing.
   */
  setSignals(
    signals: ReadonlyMap<string, Signal<unknown>>,
    values: TemplateContext,
  ): Either<void, Error> {
    return map(this.valuesOf(values), (found) => {
      for (const [name, value] of found) {
        signals.get(name)!.set(value);
      }
    });
  }

  /** The value of each declared name in `values`, or an error for the first one missing. */
  private valuesOf(values: TemplateContext): Either<ReadonlyMap<string, unknown>, Error> {
    return this.collect((name) => valueIn(values, name));
  }

  /** Each declared name with what `lookup` gives for it: an error for the first that fails. */
  private collect<V>(
    lookup: (name: string) => Either<V, Error>,
  ): Either<ReadonlyMap<string, V>, Error> {
    return map(sequence(this.names.map(lookup)), (values) =>
      new Map(this.names.map((name, index) => [name, values[index]!] as const)));
  }

  /**
   * Render an instance before `anchor`, under `injector`. Each `let-` name it declares
   * is read from `context`; the rest of the context is not visible to it.
   */
  instantiate(anchor: Node, injector: Injector, context: Context): Either<EmbeddedView, Error> {
    return map(this.collect((name) => signalIn(context, name)), (given) =>
      this.render(
        this.body,
        scopeWith(this.declared.component, this.declared.lets, given),
        anchor,
        injector,
      ));
  }
}

/** The value of `name` in a template's values, or an error if it has none. */
function valueIn(values: TemplateContext, name: string): Either<unknown, Error> {
  return name in values
    ? Right.of(values[name])
    : Left.of(missingName(name));
}

/** The signal of `name` in a context, or an error if the context has none. */
function signalIn(context: Context, name: string): Either<ReadonlySignal<unknown>, Error> {
  const entry = context.get(name);
  return entry === undefined ? Left.of(missingName(name)) : Right.of(entry);
}

function missingName(name: string): Error {
  return new Error(`The context has no "${name}", which the template declares with let-${name}`);
}
