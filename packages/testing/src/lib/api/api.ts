// The public API of @tinker/testing, as types. It is the contract for the helpers;
// the runtime is in testbed.ts and fixture.ts.
//
// `TestBed` is a builder. Each configuration method exists twice: as a static, which
// starts a new builder with that setting, and as an instance method, which adds the
// setting to the builder it is called on, so the calls can come in any order.
// `build()` creates the bed and returns a `Fixture`, which hosts the component under
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

import type {
  InputName,
  InputValue,
  OutputName,
  OutputValue,
  Provider,
  ProviderToken,
  Token,
} from "@tinker/core";
import type { Stream } from "@tinker/functional";

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
   * The fixture is not destroyed by `cleanup()`: the test destroys it itself. Use it for
   * a test that must control when its fixture goes, e.g. one that runs concurrently.
   */
  manualCleanup(): TestBed<T>;
  /**
   * Create the bed and its component. Needs a component: `component(type)` first, or
   * the static `TestBed.component(type)`.
   */
  build(): Fixture<T>;
}

/** Members every testing element has: its element, and the queries under it. */
type ElementMembers = {
  /** The element. */
  readonly element: Element;
  /**
   * The text the element shows: its text with runs of whitespace collapsed to one space and
   * the ends trimmed. It is not `element.textContent`, which keeps the line breaks and
   * indentation of the template, so a test would have to match the source layout. Use
   * `textContent` when the exact characters matter.
   */
  text(): string;
  /** The value of attribute `name` on the element, or `null` when it is not set. */
  getAttribute(name: string): string | null;
  /**
   * Dispatch an event of type `type` at the element, bubbling by default, then run change
   * detection, so the DOM reflects what listeners did. A click is `dispatchEvent("click")`.
   */
  dispatchEvent(type: string, init?: EventInit): void;
  /**
   * The first descendant of `element` that matches, in document order: a testing element
   * for a CSS selector, or one for a component or directive class, so it can be driven
   * too. Descendants include elements of nested components. A class also matches the class
   * that overrides it (see `TestBed.override`). Throws, naming what was looked for, when
   * nothing matches. To check that something is absent, use `queryAll`.
   */
  query(selector: string): TestingElement;
  query<C extends object>(type: new () => C): TestingElement<C>;
  /** Every match, as `query`, in document order. Empty when nothing matches. */
  queryAll(selector: string): TestingElement[];
  queryAll<C extends object>(type: new () => C): TestingElement<C>[];
};

/** Members of a component or directive: its instance, and what drives it. */
type InstanceMembers<T extends object> = {
  /** The component or directive instance. */
  readonly instance: T;
  /**
   * Its inputs, by name: each one's current value, as it reads it. Reading an input that
   * nothing has bound throws `InputNotBoundError`, as it does in the component.
   */
  readonly inputs: {
    readonly [K in InputName<T>]: InputValue<T[K]>;
  };
  /**
   * Its outputs, by name. Subscribe to one to hear what it emits, from the moment you
   * subscribe, as a template would. A subscriber can be a spy.
   */
  readonly outputs: {
    readonly [K in OutputName<T>]: Stream<OutputValue<T[K]>, void, never>;
  };
  /** Set one of its inputs, as a parent template would. */
  setInput(name: string, value: unknown): void;
  /** Emit one of its outputs, so the template's handler for it runs. */
  emitOutput(name: string, value: unknown): void;
};

/**
 * A thing a test holds on the rendered page: an element, or a component or directive on
 * it (`TestingElement<C>`). The element members are always there; the instance members
 * only for a class.
 */
export type TestingElement<T extends object | void = void> = ElementMembers
  & (T extends object ? InstanceMembers<T> : unknown);

/**
 * The setup of one test: the component under test (`root`), and what drives it. The
 * `TestBed.build()` call returns one.
 */
export interface Fixture<T extends object> {
  /**
   * The component under test. Reading it throws when the bed was built without a component, since
   * a service test has no root: that is a wrong test setup, and the test cannot go on.
   *
   * @throws Error when the fixture has no component.
   */
  readonly root: TestingElement<T>;
  /** Run a change detection tick now: effects first, then views, until nothing is left. */
  detectChanges(): void;
  /**
   * Resolve once the writes made so far have rendered: the microtasks they request have run,
   * and anything still queued is flushed. A timer's write is not waited for: advance timers
   * in the test.
   */
  whenStable(): Promise<void>;
  /** A service from the bed's engine, by its token or class: its providers, then the defaults. */
  get<S>(target: ProviderToken<S>): S;
  /** Destroy the component, and the bed's engine. Calling it again does nothing. */
  destroy(): void;
}

/**
 * A builder for a component class made from a template string. It is a testing helper,
 * mainly a host for a directive under test, but the class it makes is an ordinary component
 * and works anywhere one does.
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

/** The names of the methods of `F`. */
export type MethodName<F> = {
  [K in keyof F]: F[K] extends (...args: never[]) => unknown ? K : never;
}[keyof F]
& string;

/**
 * A method spy: a function that records the arguments of each call, in order. It calls
 * the method of the mock it replaces, so a mock without a body returns `undefined`.
 */
export type Spy<A extends readonly unknown[], R> = ((...args: A) => R) & {
  /** The arguments of each call so far, in order. */
  readonly calls: readonly A[];
};

/** A spy for each of the methods `K` of `F`, typed as the method of `F`. */
export type Spies<F, K extends keyof F> = {
  readonly [P in K]: F[P] extends (...args: infer A) => infer R ? Spy<A, R> : never;
};

/**
 * A mock of the class `F`: a component class named `Mock<Name>`, with the same selector,
 * inputs and outputs, and a static `mockOf` naming the class it replaces, so a mock is
 * easy to spot in a test and in a debugger. Its instance has a spy for each method `K`.
 */
export type MockClass<F extends object = object, K extends MethodName<F> = never>
  = (new () => Spies<F, K>) & {
    readonly mockOf: new () => F;
  };

/**
 * A builder for a mock of `F`. It renders nothing until `template` is set. The mock
 * keeps `F`'s selector, inputs and outputs. Only the methods named by `spy` get a spy;
 * the others are left as they are.
 */

/** The static starts: a builder for a component from a template, or a mock of a class. */
export interface ComponentBuilderStatic {
  /** A builder for a component with that template. */
  template(source: string): ComponentBuilder;
}

/**
 * The static starts: each returns a new builder with that one setting, the same as
 * calling the instance method of the same name on a fresh builder.
 */
export interface TestBedStatic {
  component<C extends object>(type: new () => C): TestBed<C>;
  providers(...providers: readonly Provider[]): TestBed;
  host(element: Element): TestBed;
  override<F extends object>(from: new () => F, to: MockClass<F>): TestBed;
  inputs(values: Readonly<Record<string, unknown>>): TestBed;
  manualCleanup(): TestBed;
}
