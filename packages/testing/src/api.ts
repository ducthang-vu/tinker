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

import type { OutputName, OutputValue, Provider, Stream } from "@tinker/core";

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
   * Replace the component or directive `from` with the mock `to` wherever the bed's
   * templates use it. Class queries for `from` then find `to`. Only a mock of `from` is
   * accepted, so a mistake is a type error. Calling it again for the same `from` replaces
   * the earlier one.
   */
  override<F extends object>(from: new () => F, to: MockClass<F>): TestBed<T>;
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
   * fixture for a CSS selector. Descendants include elements of nested components. A
   * class also matches the class that overrides it (see `TestBed.override`).
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
  /**
   * The component's outputs, by name. Subscribe to one to hear what it emits, from the
   * moment you subscribe, as a template would. A subscriber can be a spy.
   */
  readonly outputs: {
    readonly [K in OutputName<T>]: Stream<OutputValue<T[K]>, void, never>;
  };
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
 * A builder for a component class made from a template string. The class works anywhere
 * a component class does.
 */
export interface ComponentBuilder {
  /** The template of the component. */
  template(source: string): ComponentBuilder;
  /**
   * The components and directives the template may use, as `imports` does for a
   * standalone component. Calling it again adds more.
   */
  directives(...types: readonly (new () => object)[]): ComponentBuilder;
  /** Create the component class. A template that uses something not listed fails here. */
  build(): new () => object;
}

/**
 * A mock of the class `F`: a component class named `Mock<Name>`, with the same selector,
 * inputs and outputs, and a static `mockOf` naming the class it replaces, so a mock is
 * easy to spot in a test and in a debugger.
 */
export type MockClass<F extends object = object> = (new () => object) & {
  readonly mockOf: new () => F;
};

/**
 * A builder for a mock of `F`. It renders nothing until `template` is set. The mock
 * keeps `F`'s selector, inputs and outputs.
 */
export interface MockBuilder<F extends object> {
  /** The template of the mock. */
  template(source: string): MockBuilder<F>;
  /** The components and directives the template may use, as `directives` does above. */
  directives(...types: readonly (new () => object)[]): MockBuilder<F>;
  /** Create the mock class. */
  build(): MockClass<F>;
}

/** The static starts: a builder for a component from a template, or a mock of a class. */
export declare const ComponentBuilder: {
  /** A builder for a component with that template. */
  template(source: string): ComponentBuilder;
  /** A builder for a mock of `type`. */
  mock<F extends object>(type: new () => F): MockBuilder<F>;
};

/**
 * The static starts: each returns a new builder with that one setting, the same as
 * calling the instance method of the same name on a fresh builder.
 */
export declare const TestBed: {
  component<C extends object>(type: new () => C): TestBed<C>;
  providers(...providers: readonly Provider[]): TestBed;
  host(element: Element): TestBed;
  override<F extends object>(from: new () => F, to: MockClass<F>): TestBed;
  inputs(values: Readonly<Record<string, unknown>>): TestBed;
};
