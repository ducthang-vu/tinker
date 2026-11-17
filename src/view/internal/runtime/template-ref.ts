// A TemplateRef: a template declared with `<template #name>`. It is a value, like an
// `@let`, and renders nothing where it is declared. Each instance renders the body
// where a container asks for it, reading the names visible where the template was
// declared, as a closure does.

import type { Injector } from "../../../di/index.ts";
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

export class TemplateRef {
  /**
   * @param body What the template renders.
   * @param declared The scope it was declared in: what its instances can read.
   * @param render Renders an instance.
   */
  constructor(
    private readonly body: readonly CompiledNode[],
    private readonly declared: Scope,
    private readonly render: InstanceRenderer,
  ) {}

  /** Render an instance before `anchor`, under `injector`. */
  instantiate(anchor: Node, injector: Injector): EmbeddedView {
    const scope = new Scope(this.declared.component, new Map(this.declared.lets));
    return this.render(this.body, scope, anchor, injector);
  }
}
