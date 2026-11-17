// Outlet: a built-in directive that renders a declared template where its host
// is. Its host is any placement: a `<tk-container>` (a position with no element),
// or an element, whose instances then go after it.

import { inject } from "../../../di/index.ts";
import type { TemplateRef } from "../runtime/template-ref.ts";
import { ViewContainerRef } from "../runtime/view-container-ref.ts";
import { Directive } from "./decorators.ts";
import { Effect } from "./effects.ts";
import { input } from "./input.ts";

@Directive({ selector: "[outlet]" })
export class Outlet {
  private readonly container = inject(ViewContainerRef);
  /** The template to render: a `<template #name>`, given as its name. */
  readonly outlet = input<TemplateRef | undefined>(undefined);

  /** Renders the template again when it changes; nothing when there is none. */
  @Effect() show(): void {
    const template = this.outlet();
    this.container.clear();
    if (template !== undefined) {
      this.container.createEmbeddedView(template);
    }
  }
}
