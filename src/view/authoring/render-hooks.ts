// Render hooks: code to run once the app has rendered, e.g. to focus or
// measure an element, or keep a library outside Tinker in sync with the DOM.
//
//   class Autofocus {
//     private readonly render = inject(RenderHooks);
//
//     constructor() {
//       this.render.afterNextRender(() => this.input.focus());   // once
//       this.render.afterEachRender(() => this.chart.resize());   // every time
//     }
//
//     reopen() {
//       this.open.set(true);
//       this.render.afterNextRender(() => this.input.focus());   // at any moment
//     }
//   }
//
// "Render" is app-wide: the hooks run within a change detection tick, after
// a round in which views were re-rendered, once effects and views have
// settled. A tick that renders nothing runs no hooks. A hook may write
// signals: the views re-render in the same tick (under its loop guard), then
// the hooks run again.
//
// A service, not free functions: the dependency is visible (a field), and
// hooks can be registered at any moment, not only during construction.
//
// Or declaratively, with decorators on methods, registered when the
// instance is created (in its injection context):
//
//   class Chart {
//     @AfterNextRender() attach() { ... }
//     @AfterEachRender() resize() { ... }
//   }
//
// Not yet: cancelling hooks automatically with their owner (see "Effects
// and render hooks" in IMPROVEMENTS.md). Until then, call the returned
// Cancel when the owner goes away.

import { inject, Injectable } from "../../di/index.ts";
import type { Cancel } from "../../functional/index.ts";
import { RenderHookRegistry } from "../runtime/render-hook-registry.ts";

/**
 * Registers hooks to run after the app rendered. One per engine. Only
 * registering is public: running them is change detection's job (see
 * RenderHookRegistry).
 */
@Injectable()
export class RenderHooks {
  private readonly registry = inject(RenderHookRegistry);

  /** Run `hook` after every render, until cancelled. */
  afterEachRender(hook: () => void): Cancel {
    return this.registry.addEachRender(hook);
  }

  /** Run `hook` once, after the next render. Cancelling before that prevents it. */
  afterNextRender(hook: () => void): Cancel {
    return this.registry.addNextRender(hook);
  }
}

type HookMethod = (this: object) => void;

/** A method decorator registering the method, for each instance, with `register`. */
function hookDecorator(register: (hooks: RenderHooks, hook: () => void) => void) {
  return (method: HookMethod, context: ClassMethodDecoratorContext<object, HookMethod>): void => {
    context.addInitializer(function () {
      register(inject(RenderHooks), () => method.call(this));
    });
  };
}

/** Decorator form of `RenderHooks.afterEachRender`: the method runs after every render. */
export function AfterEachRender() {
  return hookDecorator((hooks, hook) => hooks.afterEachRender(hook));
}

/** Decorator form of `RenderHooks.afterNextRender`: the method runs once, after the next render. */
export function AfterNextRender() {
  return hookDecorator((hooks, hook) => hooks.afterNextRender(hook));
}
