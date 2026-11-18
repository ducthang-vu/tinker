// The public API of @tinker/testing, as types. It is the contract for the helpers:
// nothing here runs yet.
//
// `TestBed` is a builder. Each configuration method exists twice: as a static, which
// starts a new builder with that setting, and as an instance method, which adds the
// setting to the builder it is called on, so the calls can come in any order.
// `build()` creates the bed and returns a `TestBedRef`, which hosts the component under
// test (`root`) and drives the bed (change detection, services, cleanup).
//
//   const ref = TestBed.providers(provide(API_URL, { useValue: "x" }))
//     .component(Greeting)
//     .build();
//   expect(ref.root.element.textContent).toBe("Hello");
//   ref.root.instance.name.set("Ada");
//   ref.detectChanges();
//   expect(ref.root.element.textContent).toBe("Hello Ada");
//   ref.destroy();

import type { Provider } from "@tinker/core";

/**
 * A builder for one test bed. Each method returns the builder, so the configuration
 * reads as one chain, and `build()` creates the bed.
 */
export interface TestBed<T extends object = object> {
  /** The component under test: `build()` creates it as the bed's root. */
  component<C extends object>(type: new () => C): TestBed<C>;
  /**
   * Providers for the bed's engine. They replace the defaults, as they do for
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
  /**
   * Create the bed and its component. Needs a component: `component(type)` first, or
   * the static `TestBed.component(type)`.
   */
  build(): TestBedRef<T>;
}

/** The component under test, as a test sees it. */
export interface Fixture<T extends object> {
  /** The component instance. */
  readonly instance: T;
  /** The element the component is rendered into. */
  readonly element: Element;
  /**
   * The first match inside the component's template, in document order, or `null`:
   * an element for a CSS selector, or the instance of a directive or component class.
   */
  query(selector: string): Element | null;
  query<C extends object>(type: new () => C): C | null;
  /** Every match, as `query`, in document order. */
  queryAll(selector: string): Element[];
  queryAll<C extends object>(type: new () => C): C[];
  /** Set one of the component's inputs, as a parent template would. */
  setInput(name: string, value: unknown): void;
  /** Emit one of the component's outputs, so the template's handler for it runs. */
  emitOutput(name: string, value: unknown): void;
}

/** A built test bed: its component under test, and what drives it. */
export interface TestBedRef<T extends object> {
  /** The component under test. */
  readonly root: Fixture<T>;
  /** Run a change detection tick now: effects first, then views, until nothing is left. */
  detectChanges(): void;
  /** Resolve once the next change detection tick has ended. */
  whenStable(): Promise<void>;
  /** A service from the bed's engine: its providers, then the defaults. */
  get<S>(token: new () => S): S;
  /** Destroy the component, and the bed's engine. Calling it again does nothing. */
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
