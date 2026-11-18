// The public API of @tinker/testing, as types. It is the contract for the helpers:
// nothing here runs yet, and a test uses these through TestBed.
//
//   const bed = TestBed.builder()
//     .providers(provide(API_URL, { useValue: "x" }))
//     .build();
//   const fixture = bed.createComponent(Greeting);
//   expect(fixture.host.textContent).toBe("Hello");
//   fixture.instance.name.set("Ada");
//   fixture.detectChanges();
//   expect(fixture.host.textContent).toBe("Hello Ada");
//   bed.destroy();

import type { Provider } from "@tinker/core";

/**
 * Configures a test bed before it is built. Each call returns the builder, so the
 * configuration reads as one chain, and `build()` creates the test bed.
 */
export interface TestBedBuilder {
  /**
   * Add providers to the test bed's engine. They replace the defaults, as they do for
   * `bootstrap`'s providers. Calling it again adds more.
   */
  providers(...providers: readonly Provider[]): TestBedBuilder;
  /** Create the test bed, with its own engine. */
  build(): TestBed;
}

/** A component a test has created: its instance, its element, and how to run it. */
export interface Fixture<T extends object> {
  /** The component instance. */
  readonly instance: T;
  /** The element the component is rendered into. */
  readonly host: Element;
  /** Run change detection now: effects, then views, until nothing is left to update. */
  detectChanges(): void;
  /** Resolve once the next change detection tick has ended. */
  whenStable(): Promise<void>;
  /** Destroy the component and everything it owns. Calling it again does nothing. */
  destroy(): void;
}

/**
 * A test bed: it creates components in an engine of its own, and destroys all of
 * them with `destroy()`, at the end of the test.
 */
export interface TestBed {
  /**
   * Create the component under test as the root, as `bootstrap` makes an app's root.
   * With a `host`, it is rendered there. To test a component inside another template,
   * create a wrapper component in the test that contains it, and pass the wrapper.
   */
  createComponent<T extends object>(type: new () => T, host?: Element): Fixture<T>;
  /** Destroy every component this test bed created. Calling it again does nothing. */
  destroy(): void;
}

/** Starts a test bed. */
export declare const TestBed: {
  /** A builder for a test bed with its own engine. */
  builder(): TestBedBuilder;
};
