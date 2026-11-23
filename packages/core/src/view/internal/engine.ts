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
// - `createViewContainer(anchor)`, for views added and removed at runtime;
// - `getContext(element)`, to answer "what is on this element?";
// - `flush()`, to run a change detection tick now (see ChangeDetection);

import { inject, Injectable, Injector, provide, type Provider, type ProviderToken, runInInjectionContext, type Token } from "../../di/index.ts";
import type { Class } from "../../utils/types.ts";
import type { ElementContext } from "./runtime/element-context.ts";
import { ElementContexts } from "./runtime/element-contexts.ts";
import { ComponentFactory } from "./factories/component-factory.ts";
import { DirectiveFactory } from "./factories/directive-factory.ts";
import { ElementScope } from "./factories/element-scope.ts";
import { TemplateBuilderFactory } from "./factories/template-builder.ts";
import { EmbeddedViewFactory } from "./factories/embedded-view-factory.ts";
import { DomRenderer } from "./renderer.ts";
import { TinkerTemplateParser } from "./template/tinker-parser.ts";
import { BUILD_DEV_MODE, CLASS_REPLACEMENTS, DEV_MODE, DOCUMENT, RENDERER, TEMPLATE_PARSER } from "./tokens.ts";
import { type ComponentView, ComponentViewFactory } from "./runtime/component-view.ts";
import { ComponentRef, refOf } from "./component-ref.ts";
import { type Either, flatMap, Left, map, Right, Some, None, fromNullable, match, use, type Maybe } from "@tinker/functional";
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
  provide(TEMPLATE_PARSER, { useFactory: () => new TinkerTemplateParser() }),
  provide(CLASS_REPLACEMENTS, { useFactory: () => new Map() }),
  provide(DEV_MODE, { useValue: BUILD_DEV_MODE }),
  ElementContexts,
  Ticker,
  EffectScheduler,
  ViewScheduler,
  RenderHookRegistry,
  ChangeDetection,
  RenderHooks,
  Effects,
  ElementScope,
  DirectiveFactory,
  ComponentViewFactory,
  BindingFactory,
  TemplateBuilderFactory,
  EmbeddedViewFactory,
  ComponentFactory,
  ViewContainerRefFactory,
];

/**
 * @privateAPI Not in the public API: for the testing helpers only. Do not use it in an app,
 * unless you accept that it may change without notice.
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
  private readonly injector = inject(Injector);
  /** The root components started by `bootstrap`, destroyed with the engine. */
  private readonly roots: ComponentView<unknown>[] = [];
  /** Destroys the root injector this engine was created in (set by `create`). */
  private destroyInjector!: () => void;

  /**
   * Create an engine: its root injector (your providers, then the defaults),
   * and the engine from it.
   */
  static create(options: EngineOptions = {}): Engine {
    // The first provider for a token wins: user providers go first. (Engine is
    // listed here, not in DEFAULT_PROVIDERS, which is declared before the class.)
    const { injector, destroy } = Injector.create({
      providers: [...(options.providers ?? []), ...DEFAULT_PROVIDERS, Engine],
    });
    const engine = runInInjectionContext(injector, () => inject(Engine));
    engine.destroyInjector = destroy;
    return engine;
  }

  /**
   * Start the app: render the root component `type` into `host`, or, without
   * a host, into the page element that matches its selector.
   */
  bootstrap<T extends object>(type: Class<T>, host?: Element): Either<ComponentRef<T>, Error> {
    return flatMap(this.lookUp(type, host), (element) => this.start(type, element));
  }

  /** Create root component `type` in `element`, and keep it until the engine is destroyed. */
  private start<T extends object>(
    type: Class<T>,
    element: Element,
  ): Either<ComponentRef<T>, Error> {
    return map(this.components.create(type, element), (view) => {
      this.roots.push(view);
      return refOf(view);
    });
  }

  /** Destroy the root components, then the engine's injector. Calling it again does nothing. */
  destroy(): void {
    for (const view of this.roots.splice(0)) {
      view.destroy();
    }
    this.destroyInjector();
  }

  /** `host`, or else the page element that matches the component's selector. */
  private lookUp<T extends object>(
    type: Class<T>,
    host: Element | undefined,
  ): Either<Element, Error> {
    if (host !== undefined) {
      return Right.of(host);
    }
    return flatMap(this.components.metadataOf(type), ({ selector }) =>
      match(fromNullable(this.document.querySelector(selector)), { Some: (element) => Right.of(element), None: () => Left.of(new Error(`No host element matches "${selector}" for ${type.name}`)) }));
  }

  /**
   * Create a container that inserts views just before `anchor` (usually a comment).
   *
   * @deprecated Components that need a container get one from a directive or a
   * component (`inject(ViewContainerRef)`). Planned removal: see IMPROVEMENTS.md,
   * "The engine's entry points".
   */
  createViewContainer(anchor: Node): ViewContainerRef {
    return this.containers.create(anchor, this.injector);
  }

  /** Run a change detection tick now, instead of waiting for the microtask. */
  flush(): void {
    this.changeDetection.tick();
  }

  /** What is on `element` (its directives and component), if anything. */
  getContext(element: Element): Maybe<ElementContext> {
    return this.contexts.get(element);
  }

  /**
   * A service from the engine's root injector: your providers, then the defaults.
   * @privateAPI Not in the public index, for the testing helpers only. Do not use it in an app,
   * unless you accept that it may change without notice.
   */
  get<S>(token: ProviderToken<S>): S {
    return runInInjectionContext(this.injector, () => inject(token));
  }
}
