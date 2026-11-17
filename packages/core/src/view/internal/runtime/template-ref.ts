// A TemplateRef: a template declared with `<template #name let-x>`. It is a value,
// like an `@let`, and renders nothing where it is declared. Each instance renders the
// body where a container asks for it, with a context: a value for each `let-` name.
// The instance also reads the names visible where the template was declared, as a
// closure does.

import type { Injector } from "../../../di/index.ts";
import { signal } from "../../../signals/index.ts";
import type { CompiledNode } from "../template/compile.ts";
import { Scope } from "../template/scope.ts";
import type { EmbeddedView } from "./embedded-view.ts";

/** Renders an instance: its body, its scope, the anchor it goes before, and the injector. */
export type InstanceRenderer = (
  body: readonly CompiledNode[],
  scope: Scope,
  anchor: Node,
  injector: Injector,
) => EmbeddedView;

/** The values an instance is given, by the `let-` names the template declared. */
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

  /** Render an instance before `anchor`, under `injector`, with `context` for its `let-` names. */
  instantiate(anchor: Node, injector: Injector, context: TemplateContext): EmbeddedView {
    const missing = this.names.find((name) => !(name in context));
    if (missing !== undefined) {
      throw new Error(`The context has no "${missing}", which the template declares with let-${missing}`);
    }
    const lets = new Map(this.declared.lets);
    for (const name of this.names) {
      lets.set(name, signal(context[name]));
    }
    return this.render(this.body, new Scope(this.declared.component, lets), anchor, injector);
  }
}
