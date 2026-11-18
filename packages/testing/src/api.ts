// The public API of @tinker/testing, as types. It is the contract for the helpers:
// nothing here runs yet. A test starts from the component under test, configures it
// with the builder, and builds a fixture: the builder's result is the fixture.
//
//   const fixture = TestBed.component(Greeting)
//     .providers(provide(API_URL, { useValue: "x" }))
//     .build();
//   expect(fixture.host.textContent).toBe("Hello");
//   fixture.instance.name.set("Ada");
//   fixture.detectChanges();
//   expect(fixture.host.textContent).toBe("Hello Ada");
//   fixture.destroy();

import type { Provider } from "@tinker/core";

/**
 * Configures one fixture: the component under test, and what it is built with.
 * Each call returns the builder, so the configuration reads as one chain.
 */
export interface TestBedBuilder<T extends object> {
  /**
   * Providers for the fixture's engine. They replace the defaults, as they do for
   * `bootstrap`'s providers. Calling it again adds more.
   */
  providers(...providers: readonly Provider[]): TestBedBuilder<T>;
  /** Render the component into `host`, instead of a new detached element. */
  host(element: Element): TestBedBuilder<T>;
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

/** Starts the configuration of a fixture. */
export declare const TestBed: {
  /** A builder for a fixture of the component under test `type`. */
  component<T extends object>(type: new () => T): TestBedBuilder<T>;
};
