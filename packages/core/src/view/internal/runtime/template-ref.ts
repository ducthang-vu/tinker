// A TemplateRef: a template declared with `<template #name let-x>`. It is a value,
// like an `@let`, and renders nothing where it is declared. Each instance renders the
// body where a container asks for it, with a context: a value for each `let-` name.
// The instance also reads the names visible where the template was declared, as a
// closure does.

import type { Injector } from "../../../di/index.ts";
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
   * reads, to be updated in place with `setSignals`. Throws if a name is missing.
   */
  signalsFor(values: TemplateContext): Map<string, Signal<unknown>> {
    return new Map(this.names.map((name) => [name, signal(this.valueOf(values, name))] as const));
  }

  /** Set each signal of an instance (from `signalsFor`) to its value in `values`. */
  setSignals(signals: ReadonlyMap<string, Signal<unknown>>, values: TemplateContext): void {
    for (const name of this.names) {
      const value = this.valueOf(values, name);
      signals.get(name)!.set(value);
    }
  }

  private valueOf(values: TemplateContext, name: string): unknown {
    if (!(name in values)) {
      throw new Error(`The context has no "${name}", which the template declares with let-${name}`);
    }
    return values[name];
  }

  /**
   * Render an instance before `anchor`, under `injector`. Each `let-` name it declares
   * is read from `context`; the rest of the context is not visible to it.
   */
  instantiate(anchor: Node, injector: Injector, context: Context): EmbeddedView {
    const given = new Map<string, ReadonlySignal<unknown>>();
    for (const name of this.names) {
      const entry = context.get(name);
      if (entry === undefined) {
        throw new Error(`The context has no "${name}", which the template declares with let-${name}`);
      }
      given.set(name, entry);
    }
    const scope = scopeWith(this.declared.component, this.declared.lets, given);
    return this.render(this.body, scope, anchor, injector);
  }
}
