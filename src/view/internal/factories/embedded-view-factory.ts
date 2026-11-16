// The embedded view factory: renders a block's children as an embedded view,
// placed just before a comment anchor, with a watch of its own.
//
// The view's bindings are updated by its own watch, so a signal it reads
// schedules only this view (see docs/change-detection.md). Its names are the
// component's, plus the `@let`s the block sits under (its scope).

import { inject, Injectable, type Injector } from "../../../di/index.ts";
import { watch } from "../../../signals/index.ts";
import { RunFirstNow } from "../runtime/run-first-now.ts";
import { ChangeDetection } from "../runtime/change-detection.ts";
import { EmbeddedView } from "../runtime/embedded-view.ts";
import { RENDERER } from "../tokens.ts";
import type { CompiledNode } from "../template/compile.ts";
import type { Scope } from "../template/scope.ts";
import { ComponentFactory } from "./component-factory.ts";
import { TemplateBuilderFactory } from "./template-builder.ts";

@Injectable()
export class EmbeddedViewFactory {
  private readonly renderer = inject(RENDERER);
  private readonly builders = inject(TemplateBuilderFactory);
  private readonly components = inject(ComponentFactory);
  private readonly changeDetection = inject(ChangeDetection);

  /**
   * Render `children` after `anchor`'s place: the nodes go just before the
   * anchor, in order. Components and directives in them are created under
   * `injector`. The returned view is rendered, and its watch runs until it is
   * destroyed.
   */
  create(
    component: object,
    children: readonly CompiledNode[],
    scope: Scope,
    anchor: Node,
    injector: Injector,
  ): EmbeddedView {
    const parent = anchor.parentNode;
    if (!parent) {
      throw new Error("The anchor of an embedded view is not in the DOM");
    }
    const builder = this.builders.create(component, this.components, scope);
    const nodes = builder.build(children);
    for (const node of nodes) {
      this.renderer.insertBefore(parent, node, anchor);
    }
    const view = new EmbeddedView(parent, nodes, this.renderer);
    // Its components and directives: created now, as a component's are.
    builder.createDirectivesAndComponents(view, injector);
    const firstRun = new RunFirstNow(this.changeDetection.views);
    const viewWatch = watch(() => builder.update(), firstRun);
    view.addDestroyCallback(() => viewWatch.destroy());
    firstRun.failure.ifSome((error) => {
      view.destroy();
      throw error;
    });
    this.changeDetection.viewRendered();
    return view;
  }
}
