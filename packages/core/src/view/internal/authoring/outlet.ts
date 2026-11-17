// Outlet: a built-in directive that renders a declared template where its host
// is. Its host is any placement: a `<tk-container>` (a position with no element),
// or an element, whose instances then go after it.
//
// The instance reads one signal per `let-` name. When only the context changes,
// those signals are set, and the instance updates where it is. The instance is
// rendered again only when the template changes.

import { inject } from "../../../di/index.ts";
import type { Signal } from "../../../signals/index.ts";
import { type TemplateContext, type TemplateRef } from "../runtime/template-ref.ts";
import { ViewContainerRef } from "../runtime/view-container-ref.ts";
import { Directive } from "./decorators.ts";
import { Effect } from "./effects.ts";
import { input } from "./input.ts";

@Directive({ selector: "[outlet]" })
export class Outlet {
  private readonly container = inject(ViewContainerRef);
  /** The template to render: a `<template #name>`, given as its name. */
  readonly outlet = input<TemplateRef | undefined>(undefined);
  /** The values for the template's `let-` names. */
  readonly context = input<TemplateContext>({});

  /** The template being shown, and the signals its instance reads. */
  private shown: TemplateRef | undefined;
  private signals = new Map<string, Signal<unknown>>();

  /** Renders the template when it changes; sets the instance's signals when the context does. */
  @Effect() show(): void {
    const template = this.outlet();
    const values = this.context();
    if (template !== undefined && template === this.shown) {
      template.setSignals(this.signals, values);
      return;
    }
    this.container.clear();
    this.shown = template;
    if (template !== undefined) {
      this.signals = template.signalsFor(values);
      this.container.embed(template, this.signals);
    }
  }
}
