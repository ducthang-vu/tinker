// The router's test helpers, for app tests: `import ... from "@tinker/router/testing"`. A test gets
// the routes running over an in-memory location, so it never touches the browser's history. The
// harness drives a fixture from `@tinker/testing`: it navigates, waits, and reads what is shown.

import type { Fixture, TestingElement } from "@tinker/testing";
import { PLATFORM_LOCATION } from "./lib/location/platform-location.ts";
import { fromNullable, None, type Maybe } from "@tinker/functional";
import { provide, type Provider } from "@tinker/core";
import type { PlatformLocation } from "./lib/location/platform-location.ts";
import { provideRouter } from "./lib/router/provide-router.ts";
import type { Route } from "./lib/router/route.ts";
import { Router, type NavigateOptions } from "./lib/router/router.ts";
import type { AppPath } from "./lib/destination/app-path.ts";
import type { NavigationOutcome } from "./lib/pipeline/navigation-outcome.ts";

export { nested } from "./lib/destination/test-builder.ts";

/** An in-memory location with a history, so a test can go back and forward as the user does. */
export interface MemoryLocation extends PlatformLocation {
  /** Move to `url` as the user does going back or forward: the listeners are told. */
  moveTo(url: string, state?: unknown): void;
  /** Go back one history entry, if there is one, as the back button does. */
  back(): void;
  /** Go forward one history entry, if there is one, as the forward button does. */
  forward(): void;
}

/** One entry of the history: its URL and state. */
interface Entry {
  readonly url: string;
  readonly state: unknown;
}

/** The in-memory location: a history of entries, and the listeners of a back or forward move. */
class Memory implements MemoryLocation {
  private entries: Entry[];
  private index = 0;
  private readonly listeners = new Set<() => void>();

  /**
   * The location, with one entry at `url`.
   *
   * @param url The URL the location starts at.
   */
  constructor(url: string) {
    this.entries = [{ url, state: null }];
  }

  /**
   * The entry the location is at.
   *
   * @returns The current entry.
   */
  private current(): Entry {
    return this.entries[this.index] as Entry;
  }

  /**
   * The current URL.
   *
   * @returns The current path, query and hash.
   */
  url(): string {
    return this.current().url;
  }

  /**
   * The state of the current entry.
   *
   * @returns The state, or `null` when none is set.
   */
  state(): unknown {
    return this.current().state;
  }

  /**
   * Adds an entry after the current one, dropping any entries forward of it, as a push does.
   *
   * @param url The URL to go to.
   * @param state The state of the entry.
   */
  push(url: string, state: unknown): void {
    this.entries = [...this.entries.slice(0, this.index + 1), { url, state }];
    this.index = this.entries.length - 1;
  }

  /**
   * Replaces the current entry, as a replace does.
   *
   * @param url The URL to replace the current one with.
   * @param state The state of the entry.
   */
  replace(url: string, state: unknown): void {
    this.entries[this.index] = { url, state };
  }

  /**
   * Calls `listener` on each back or forward move.
   *
   * @param listener The function to call.
   * @returns The function that stops the listener.
   */
  onPop(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Moves to the entry at `index`, as a back or forward move does, and tells the listeners.
   *
   * @param index The entry to move to.
   */
  private go(index: number): void {
    this.index = index;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Moves to `url`, as a back or forward move does, and tells the listeners. The URL is kept as an
   * entry, so a later back move returns to the entry before it.
   *
   * @param url The URL the user went to.
   * @param state The state of the entry the user went to.
   */
  moveTo(url: string, state: unknown = null): void {
    this.push(url, state);
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Goes back one entry, if there is one, as the back button does.
   */
  back(): void {
    if (this.index > 0) {
      this.go(this.index - 1);
    }
  }

  /**
   * Goes forward one entry, if there is one, as the forward button does.
   */
  forward(): void {
    if (this.index < this.entries.length - 1) {
      this.go(this.index + 1);
    }
  }
}

/**
 * An in-memory location that starts at `url`. It records pushes and replaces, and `moveTo` plays a
 * back or forward move.
 *
 * @param url The URL the location starts at, relative to the app, e.g. `"/todos/7"`.
 * @returns The in-memory location.
 */
export function memoryLocation(url: string): MemoryLocation {
  return new Memory(url);
}

/** The options of `provideTestRoutes`. */
export interface TestRoutesOptions {
  /** The URL the router starts at, relative to the app. The default is `"/"`. */
  readonly url?: string;
}

/**
 * The providers of a router over `routes`, running over an in-memory location that starts at
 * `options.url`. Pass them to `TestBed.providers(...)`, or to an injector.
 *
 * @param routes The top-level routes.
 * @param options Where the router starts.
 * @returns The providers.
 */
export function provideTestRoutes(
  routes: readonly Route[],
  options: TestRoutesOptions = {},
): Provider[] {
  return [
    provide(PLATFORM_LOCATION, { useValue: memoryLocation(options.url ?? "/") }),
    ...provideRouter(routes),
  ];
}

/**
 * A harness over a fixture of an app with a router: it navigates through the router, waits for
 * the navigation and any loads to render, and reads what is shown. The fixture must have a
 * component, which shows the routes through an outlet.
 */
export class RouterTestingHarness<T extends object> {
  /**
   * The harness over `fixture`.
   *
   * @param fixture The fixture of the app under test.
   */
  constructor(private readonly fixture: Fixture<T>) {}

  /**
   * The router of the fixture.
   *
   * @returns The router.
   */
  get router(): Router {
    return this.fixture.get(Router);
  }

  /**
   * The path the router is at, relative to the app: the last committed navigation's.
   *
   * @returns The path.
   */
  get currentAppPath(): AppPath {
    return this.router.url();
  }

  /**
   * The routed component the outlet shows, or `None` when the current route has no component, or
   * no route takes the current URL.
   *
   * @returns The component's element, or `None`.
   */
  get currentRoutedComponent(): Maybe<TestingElement> {
    const component = this.router.match()?.route.component;
    if (component === undefined) {
      return None.of();
    }
    return fromNullable(this.fixture.root.queryAll(component)[0]);
  }

  /**
   * Goes back one history entry, as the back button does, and waits until the router has followed
   * it and rendered.
   */
  async back(): Promise<void> {
    (this.fixture.get(PLATFORM_LOCATION) as MemoryLocation).back();
    await this.fixture.whenStable();
    this.fixture.detectChanges();
  }

  /**
   * Goes forward one history entry, as the forward button does, and waits until the router has
   * followed it and rendered.
   */
  async forward(): Promise<void> {
    (this.fixture.get(PLATFORM_LOCATION) as MemoryLocation).forward();
    await this.fixture.whenStable();
    this.fixture.detectChanges();
  }

  /**
   * Navigates to `path` through the router, and waits until the navigation and any loads it
   * started have rendered.
   *
   * @param path The destination, built with an `AppPathBuilder`.
   * @param options The state of the new history entry.
   * @returns The outcome of the navigation.
   */
  async navigate(path: AppPath, options: NavigateOptions = {}): Promise<NavigationOutcome> {
    const outcome = await this.router.navigate(path, options);
    await this.fixture.whenStable();
    this.fixture.detectChanges();
    return outcome;
  }
}
