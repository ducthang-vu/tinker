// bootstrap: start an application. The only way to create the root component
// of an app; the engine behind it is internal.
//
//   const app = bootstrap(AppComponent, { host: document.querySelector("app")! });
//   app.root.instance;   // the root component
//   app.destroy();       // destroys the app and everything it owns

import type { Provider } from "../di/index.ts";
import type { Class } from "../utils/types.ts";
import type { ComponentRef } from "./internal/component-ref.ts";
import { Engine } from "./internal/engine.ts";
import { type Either, map, use } from "@tinker/functional";

/** What `bootstrap` takes besides the root component. Both are optional. */
export interface BootstrapOptions {
  /** The element the root renders into. Without it, the page element matching its selector. */
  readonly host?: Element;
  /** Providers for the app, as for a component's `providers` but app-wide. */
  readonly providers?: readonly Provider[];
}

/** A started application: its root component, and how to destroy it. */
export class AppRef<T extends object> {
  /** @param engine The engine the app runs in, destroyed with it. */
  constructor(
    readonly root: ComponentRef<T>,
    private readonly engine: Engine,
  ) {}

  /** Destroy the app: its root component, and everything it owns. Calling it again does nothing. */
  destroy(): void {
    this.engine.destroy();
  }
}

/** Start the application whose root component is `type`. */
export function bootstrap<T extends object>(
  type: Class<T>,
  options: BootstrapOptions = {},
): Either<AppRef<T>, Error> {
  const engine = Engine.create({ providers: options.providers });
  const started = engine.bootstrap(type, options.host);
  // A root that cannot start leaves no engine behind.
  use(started, { Left: () => engine.destroy(), Right: () => undefined });
  return map(started, (ref) => new AppRef(ref, engine));
}
