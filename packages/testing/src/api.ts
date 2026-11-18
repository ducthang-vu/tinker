// The public API of @tinker/testing, as types. It is the contract for the helpers:
// nothing here runs yet.
//
// `TestBed` is a builder for one fixture. Each configuration method exists twice: as a
// static, which starts a new builder with that setting, and as an instance method, which
// adds the setting to the builder it is called on. So the calls can come in any order:
//
//   const fixture = TestBed.providers(provide(API_URL, { useValue: "x" }))
//     .component(Greeting)
//     .build();
//   expect(fixture.host.textContent).toBe("Hello");
//   fixture.instance.name.set("Ada");
//   fixture.detectChanges();
//   expect(fixture.host.textContent).toBe("Hello Ada");
//   fixture.destroy();

import type { Provider } from "@tinker/core";

/**
 * A builder for one fixture. Each method returns the builder, so the configuration
 * reads as one chain, and `build()` returns the fixture.
 */
export interface TestBed<T extends object = object> {
  /** The component under test: the fixture's instance is of this type. */
  component<C extends object>(type: new () => C): TestBed<C>;
  /**
   * Providers for the fixture's engine. They replace the defaults, as they do for
   * `bootstrap`'s providers. Calling it again adds more.
   */
  providers(...providers: readonly Provider[]): TestBed<T>;
  /** Render the component into `host`, instead of a new detached element. */
  host(element: Element): TestBed<T>;
  /**
   * Set the component's inputs before it is built, by name. An input left unset
   * throws `InputNotBoundError` when it is read.
   */
  inputs(values: Readonly<Record<string, unknown>>): TestBed<T>;
  /** Create the component, with its own engine, and return its fixture. */
  build(): Fixture<T>;
}

/** A component a test has built: its instance, its element, and how to run it. */
export interface Fixture<T extends object> {
  /** The component instance. */
  readonly instance: T;
  /** The element the component is rendered into. */
  readonly host: Element;
  /** Run change detection now: effects, then views, until nothing is left to update. */
  detectChanges(): void;
  /** Resolve once the next change detection tick has ended. */
  whenStable(): Promise<void>;
  /** Destroy the component, everything it owns, and its engine. Calling it again does nothing. */
  destroy(): void;
}

/**
 * The static starts: each returns a new builder with that one setting, the same as
 * calling the instance method of the same name on a fresh builder.
 */
export declare const TestBed: {
  component<C extends object>(type: new () => C): TestBed<C>;
  providers(...providers: readonly Provider[]): TestBed;
  host(element: Element): TestBed;
  inputs(values: Readonly<Record<string, unknown>>): TestBed;
};
