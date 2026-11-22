// The embedded view factory: renders a block's children as an embedded view,
// placed just before a comment anchor, with a watch of its own.
//
// The builder it is given already has the view's scope (the component, and the
// `@let`s the block sits under). The view's bindings are updated by its own
// watch, so a signal it reads schedules only this view (see
// docs/change-detection.md).

import { inject, Injectable, type Injector } from "../../../di/index.ts";
import { watch } from "../../../signals/index.ts";
import { ChangeDetection } from "../runtime/change-detection.ts";
import { EmbeddedView } from "../runtime/embedded-view.ts";
import { RunFirstNow } from "../runtime/run-first-now.ts";
import { RENDERER } from "../tokens.ts";
import type { CompiledNode } from "../template/compile.ts";
import type { TemplateBuilder } from "./template-builder.ts";
import { Some, None, use } from "@tinker/functional";

@Injectable()
export class EmbeddedViewFactory {
  private readonly renderer = inject(RENDERER);
  private readonly changeDetection = inject(ChangeDetection);

  /**
   * Render `children` with `builder` (which has the view's scope), placed just
   * before `anchor`. Components and directives in them are created under
   * `injector`. The returned view is rendered, and its watch runs until it is
   * destroyed.
   */
  create(
    builder: TemplateBuilder,
    children: readonly CompiledNode[],
    anchor: Node,
    injector: Injector,
  ): EmbeddedView {
    const parent = anchor.parentNode;
    if (!parent) {
      throw new Error("The anchor of an embedded view is not in the DOM");
    }
    const nodes = builder.build(children);
    for (const node of nodes) {
      this.renderer.insertBefore(parent, node, anchor);
    }
    const view = new EmbeddedView(parent, nodes, this.renderer, builder.node);
    builder.createDirectivesAndComponents(view, injector);
    const firstRun = new RunFirstNow(this.changeDetection.views.forNode(builder.node));
    const viewWatch = watch(() => builder.update(), firstRun);
    view.addDestroyCallback(() => viewWatch.destroy());
    use(firstRun.failure, { Some: (error) => {
      view.destroy();
      throw error;
    }, None: () => undefined });
    this.changeDetection.viewRendered();
    return view;
  }
}
