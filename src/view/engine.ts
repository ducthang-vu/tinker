// The engine: starts an app by loading its root component, and ties the view
// layer's pieces together.
//
// The engine and its pieces (document, renderer, template parser, element
// contexts, the directive and component factories) are services in the
// engine's root injector. `Engine.create()` builds that injector from
// browser defaults and the given `providers`, which come first, so they
// replace any default:
//
//   Engine.create({ providers: [provide(RENDERER, { useClass: ServerRenderer })] })
//
// `bootstrap(AppComponent)` finds the component's host element in the page
// (by its selector, e.g. `<tk-app></tk-app>` in index.html) and creates the
// component there. The engine also offers:
// - `createComponent(type, host?)`, for the root component and any other;
// - `createViewContainer(anchor)`, for views added and removed at runtime;
// - `getContext(element)`, to answer "what is on this element?";
// - `flush()`, to run a change detection tick now (see ChangeDetection);
// - `afterStable()`, to know when the next tick has ended.

import { inject, Injectable, Injector, provide, type Provider, runInInjectionContext } from "../di/index.ts";
import { Maybe, type Task } from "../functional/index.ts";
import type { Class } from "../utils/types.ts";
import type { ElementContext } from "./runtime/element-context.ts";
import { ElementContexts } from "./runtime/element-contexts.ts";
import { ComponentFactory } from "./factories/component-factory.ts";
import { DirectiveFactory } from "./factories/directive-factory.ts";
import { TemplateBuilderFactory } from "./factories/template-builder.ts";
import { DomRenderer } from "./renderer.ts";
import { BrowserTemplateParser } from "./template/browser-parser.ts";
import { DOCUMENT, RENDERER, TEMPLATE_PARSER } from "./tokens.ts";
import { type View, ViewFactory } from "./runtime/view.ts";
import { type ViewContainerRef, ViewContainerRefFactory } from "./runtime/view-container-ref.ts";
import { BindingFactory } from "./runtime/text-binding.ts";
import { Effects } from "./authoring/effects.ts";
import { RenderHooks } from "./authoring/render-hooks.ts";
import { ChangeDetection } from "./runtime/change-detection.ts";
import { RenderHookRegistry } from "./runtime/render-hook-registry.ts";
import { EffectScheduler } from "./runtime/schedulers/effect-scheduler.ts";
import { Ticker } from "./runtime/ticker.ts";
import { ViewScheduler } from "./runtime/schedulers/view-scheduler.ts";

/** What the engine is built from. */
export interface EngineOptions {
  /** Providers for the engine's root injector; they replace the defaults. */
  readonly providers?: readonly Provider[];
}

/** The engine's browser defaults. */
const DEFAULT_PROVIDERS: readonly Provider[] = [
  provide(DOCUMENT, { useFactory: () => globalThis.document }),
  provide(RENDERER, { useFactory: () => new DomRenderer(inject(DOCUMENT)) }),
  provide(TEMPLATE_PARSER, { useFactory: () => new BrowserTemplateParser(inject(DOCUMENT)) }),
  ElementContexts,
  Ticker,
  EffectScheduler,
  ViewScheduler,
  RenderHookRegistry,
  ChangeDetection,
  RenderHooks,
  Effects,
  DirectiveFactory,
  ViewFactory,
  BindingFactory,
  TemplateBuilderFactory,
  ComponentFactory,
  ViewContainerRefFactory,
];

/**
 * Create it with `Engine.create()`: like every service, it gets its pieces
 * with `inject()`, so it can only be created inside its injector.
 */
@Injectable()
export class Engine {
  private readonly document = inject(DOCUMENT);
  private readonly contexts = inject(ElementContexts);
  private readonly components = inject(ComponentFactory);
  private readonly changeDetection = inject(ChangeDetection);
  private readonly containers = inject(ViewContainerRefFactory);

  /**
   * Create an engine: its root injector (your providers, then the defaults),
   * and the engine from it.
   */
  static create(options: EngineOptions = {}): Engine {
    // The first provider for a token wins: user providers go first. (Engine is
    // listed here, not in DEFAULT_PROVIDERS, which is declared before the class.)
    const { injector } = Injector.create({
      providers: [...(options.providers ?? []), ...DEFAULT_PROVIDERS, Engine],
    });
    return runInInjectionContext(injector, () => inject(Engine));
  }

  /** Start the app: render the root component `type` into its host element in the page. */
  bootstrap<T extends object>(type: Class<T>): View<T> {
    const { selector } = this.components.metadataOf(type);
    const host = Maybe.fromNullable(this.document.querySelector(selector))
      .getOrThrow(
        () => new Error(`No host element matches "${selector}" for ${type.name}`),
      );
    return this.components.create(type, host);
  }

  /**
   * Render component `type` into `host`, or into a new (detached) host
   * element created from its selector. See ComponentFactory.create.
   */
  createComponent<T extends object>(type: Class<T>, host?: Element): View<T> {
    return this.components.create(type, host);
  }

  /** Create a container that inserts views just before `anchor` (usually a comment). */
  createViewContainer(anchor: Node): ViewContainerRef {
    return this.containers.create(anchor);
  }

  /** Run a change detection tick now, instead of waiting for the microtask. */
  flush(): void {
    this.changeDetection.tick();
  }

  /**
   * The end of the next change detection tick, as a Task: once it completes,
   * effects have run and views are rendered. Lazy (nothing happens until it
   * is run) and cancellable; running it requests a tick, so it completes
   * even when nothing is pending. See ChangeDetection.afterStable.
   *
   *   count.set(2);
   *   await engine.afterStable().toPromise();   // the DOM shows 2
   */
  afterStable(): Task<void> {
    return this.changeDetection.afterStable();
  }

  /** What is on `element` (its directives and component), if anything. */
  getContext(element: Element): Maybe<ElementContext> {
    return this.contexts.get(element);
  }
}
