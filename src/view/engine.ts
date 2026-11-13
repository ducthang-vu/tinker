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
// - `getContext(element)`, to answer "what is on this element?".

import { inject, Injectable, Injector, provide, type Provider, runInInjectionContext } from "../di/index.ts";
import type { Class } from "../utils/types.ts";
import type { ElementContext } from "./element-context.ts";
import { ElementContexts } from "./element-contexts.ts";
import { ComponentFactory } from "./factories/component-factory.ts";
import { DirectiveFactory } from "./factories/directive-factory.ts";
import { DomRenderer } from "./renderer.ts";
import { BrowserTemplateParser } from "./template/browser-parser.ts";
import { DOCUMENT, RENDERER, TEMPLATE_PARSER } from "./tokens.ts";
import type { View } from "./view.ts";
import { ViewContainerRef } from "./view-container-ref.ts";

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
  DirectiveFactory,
  ComponentFactory,
];

/**
 * Create it with `Engine.create()`: like every service, it gets its pieces
 * with `inject()`, so it can only be created inside its injector.
 */
@Injectable()
export class Engine {
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(RENDERER);
  private readonly contexts = inject(ElementContexts);
  private readonly components = inject(ComponentFactory);

  /** Create an engine: its root injector (your providers, then the defaults), and the engine from it. */
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
    const host = this.document.querySelector(selector);
    if (!host) {
      throw new Error(`No host element matches "${selector}" for ${type.name}`);
    }
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
    return new ViewContainerRef(anchor, this.components, this.renderer);
  }

  /** What is on `element` (its directives and component), or `undefined` if nothing. */
  getContext(element: Element): ElementContext | undefined {
    return this.contexts.get(element);
  }
}
