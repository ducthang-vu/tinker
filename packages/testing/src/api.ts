// The public API of @tinker/testing, as types. It is the contract for the helpers:
// nothing here runs yet, and a test uses these through TestBed.
//
//   const bed = TestBed.create({ providers: [provide(API_URL, { useValue: "x" })] });
//   const fixture = bed.createComponent(Greeting);
//   expect(fixture.host.textContent).toBe("Hello");
//   fixture.instance.name.set("Ada");
//   fixture.detectChanges();
//   expect(fixture.host.textContent).toBe("Hello Ada");
//   bed.destroy();

import type { Provider } from "@tinker/core";

/** What a test bed is created with. */
export interface TestBedOptions {
  /**
   * Providers for the test bed's engine. They replace the defaults, as they do for
   * `bootstrap`'s providers.
   */
  readonly providers?: readonly Provider[];
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
   * Create component `type`, rendered into `host`, or into a new detached element
   * when there is no host.
   */
  createComponent<T extends object>(type: new () => T, host?: Element): Fixture<T>;
  /** Destroy every component this test bed created. Calling it again does nothing. */
  destroy(): void;
}

/** Creates test beds. */
export declare const TestBed: {
  /** A test bed with its own engine, built from `options`. */
  create(options?: TestBedOptions): TestBed;
};
