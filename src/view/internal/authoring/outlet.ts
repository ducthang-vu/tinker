// Outlet: a built-in directive that renders a declared template where its host is.
// Its host can be any element; `<template [outlet]="row">` renders nothing of its
// own, so the instances go just after it. When its template or its context changes,
// the instances are rendered again.

import { inject } from "../../../di/index.ts";
import { Directive } from "./decorators.ts";
import { Effect } from "./effects.ts";
import { input } from "./input.ts";
import { ViewContainerRef } from "../runtime/view-container-ref.ts";
import type { TemplateContext, TemplateRef } from "../runtime/template-ref.ts";

@Directive({ selector: "[outlet]" })
export class Outlet {
  private readonly container = inject(ViewContainerRef);
  /** The template to render: a `<template #name>`, as the value `name`. */
  readonly outlet = input<TemplateRef | undefined>(undefined);
  /** The values for the template's `let-` names. */
  readonly context = input<TemplateContext>({});

  /** Renders the template again when it or its context changes; nothing when there is none. */
  @Effect() show(): void {
    const template = this.outlet();
    const context = this.context();
    this.container.clear();
    if (template !== undefined) {
      this.container.createEmbeddedView(template, context);
    }
  }
}
