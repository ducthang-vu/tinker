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

/**
 * An element a test can query inside of: the root of a fixture, or a match of a CSS
 * selector. It has no instance, so it has no inputs or outputs to drive.
 */
export interface ElementFixture {
  /** The element. */
  readonly element: Element;
  /**
   * The first descendant of `element` that matches, in document order, or `null`: a
   * fixture for a component or directive class, so it can be driven too; an element
   * fixture for a CSS selector. Descendants include elements of nested components.
   */
  query(selector: string): ElementFixture | null;
  query<C extends object>(type: new () => C): Fixture<C> | null;
  /** Every match, as `query`, in document order. */
  queryAll(selector: string): ElementFixture[];
  queryAll<C extends object>(type: new () => C): Fixture<C>[];
}

/** A component or directive as a test sees it: its instance, and what drives it. */
export interface Fixture<T extends object> extends ElementFixture {
  /** The component instance. */
  readonly instance: T;
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
 * A builder for a component class made from a template string, for tests that need a
 * host for a directive. The class works anywhere a component class does.
 */
export interface ComponentBuilder {
  /**
   * The components and directives the template may use, as `imports` does for a
   * standalone component. Calling it again adds more.
   */
  directives(...types: readonly (new () => object)[]): ComponentBuilder;
  /** Create the component class. A template that uses something not listed fails here. */
  build(): new () => object;
}

/** The static start: a builder for a component with that template. */
export declare const ComponentBuilder: {
  template(source: string): ComponentBuilder;
};

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
