// The runtime of the test bed: the builders behind `TestBed` and `ComponentBuilder`.
// Each builder is immutable: a configuration method returns a new builder, so a chain
// reads in any order, and a builder can be reused.

import { valueOrThrow, isSome, getOrThrow, use } from "@tinker/functional";
import {
  CLASS_REPLACEMENTS,
  Component,
  Directive,
  getComponentMetadata,
  getDirectiveMetadata,
  input,
  inputNamesOf,
  output,
  Engine,
  type Provider,
  type ProviderToken,
  provide,
  type Token,
} from "@tinker/core";
import { testingElementOf, type Scope } from "./fixture.ts";
import type {
  InputName,
  InputValue,
  OutputName,
} from "@tinker/core";
import type {
  ComponentBuilder as ComponentBuilderApi,
  ComponentBuilderStatic,
  MethodName,
  MockClass,
  TestBed as TestBedApi,
  Fixture,
  TestBedStatic,
} from "../api/api.ts";

export type TestBed<T extends object = object> = TestBedApi<T>;
export type ComponentBuilder = ComponentBuilderApi;

/** What a bed is built from. */
interface BedState {
  readonly component?: new () => object;
  readonly providers: readonly Provider[];
  readonly host?: Element;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly replacements: ReadonlyMap<new () => object, new () => object>;
  /** Whether the author destroys the fixture, rather than `cleanup()` doing it. */
  readonly manual: boolean;
}

const EMPTY: BedState = { providers: [], inputs: {}, replacements: new Map(), manual: false };

/** The fixtures not yet destroyed: `cleanup()` destroys whatever is left here. */
const live = new Set<{ destroy(): void }>();

/** Destroy every fixture still alive, e.g. the ones a test left behind. */
export function cleanup(): void {
  for (const fixture of [...live]) {
    fixture.destroy();
  }
  live.clear();
}

/** What the package takes from the test runner. Both are optional. */
export interface TestRunner {
  /** Runs `cleanup` after each test: the runner's `afterEach`. */
  readonly afterEach?: (hook: () => void) => void;
  /** Whether a test is running now: a fixture without `manualCleanup()` must be built in one. */
  readonly inTest?: () => boolean;
  /**
   * Runs a hook when the test running now ends (Vitest's `onTestFinished`). A fixture built in a
   * test is destroyed by its own hook, so concurrent tests do not destroy each other's fixtures.
   */
  readonly onTestFinished?: (hook: () => void) => void;
}

/** The runner's `inTest`, once `registerRunner` gave one. Until then, no fixture is checked. */
let inTest: TestRunner["inTest"];
/** The runner's `onTestFinished`, once `registerRunner` gave one. */
let onTestFinished: TestRunner["onTestFinished"];

/**
 * Give the package the test runner's hooks. Call it once in the test setup (a Vitest setup file
 * does: see vitest.setup.ts). Without a runner, no cleanup is registered and nothing is checked.
 */
export function registerRunner(runner: TestRunner | undefined): void {
  runner?.afterEach?.(cleanup);
  inTest = runner?.inTest;
  onTestFinished = runner?.onTestFinished;
}

registerRunner({ afterEach: (globalThis as { afterEach?: (hook: () => void) => void }).afterEach });

/**
 * Keep a fixture until it is destroyed: by the end of the test that built it, when the runner
 * gives `onTestFinished`, else by `cleanup()`.
 */
function track(fixture: { destroy(): void }): void {
  if (onTestFinished === undefined) {
    live.add(fixture);
  } else {
    onTestFinished(() => fixture.destroy());
  }
}

/**
 * A fixture that `cleanup()` destroys must be built inside a test: outside one (in `beforeAll`,
 * say) it would be destroyed by the wrong cleanup, or never. Only checked with a runner.
 */
function requireTest(): void {
  if (inTest !== undefined && !inTest()) {
    throw new Error(
      "TestBed: a fixture built outside a test is not destroyed by cleanup(). "
      + "Build it inside a test, or call manualCleanup() and destroy it yourself",
    );
  }
}

class Bed<T extends object> implements TestBedApi<T> {
  constructor(private readonly state: BedState) {}

  component<C extends object>(type: new () => C): TestBedApi<C> {
    return new Bed<C>({ ...this.state, component: type });
  }

  providers(...providers: readonly Provider[]): TestBedApi<T> {
    return new Bed<T>({ ...this.state, providers: [...this.state.providers, ...providers] });
  }

  host(element: Element): TestBedApi<T> {
    return new Bed<T>({ ...this.state, host: element });
  }

  override<F extends object>(from: new () => F, to: MockClass<F>): TestBedApi<T> {
    return new Bed<T>({
      ...this.state,
      replacements: new Map(this.state.replacements)
        .set(from, to),
    });
  }

  inputs(values: Readonly<Record<string, unknown>>): TestBedApi<T> {
    return new Bed<T>({ ...this.state, inputs: { ...this.state.inputs, ...values } });
  }

  manualCleanup(): TestBedApi<T> {
    return new Bed<T>({ ...this.state, manual: true });
  }

  build(): Fixture<T> {
    const { component, replacements } = this.state;
    if (!component) {
      throw new Error("TestBed.build needs a component: call component(type) first");
    }
    if (!this.state.manual) {
      requireTest();
    }
    const engine = Engine.create({
      providers: [provide(CLASS_REPLACEMENTS, { useValue: replacements }), ...this.state.providers],
    });
    const host = this.state.host ?? document.createElement("div");
    const ref = valueOrThrow(engine.bootstrap(component, host));
    const scope: Scope = { engine, replacements };
    const root = testingElementOf(ref.instance as T, host, scope);
    for (const [name, value] of Object.entries(this.state.inputs)) {
      root.setInput(name, value);
    }
    engine.flush();
    let destroyed = false;
    const fixture: Fixture<T> = {
      root,
      detectChanges: () => engine.flush(),
      whenStable: async () => {
        // Writes made by promises and other microtasks request their ticks there, so one
        // macrotask later those ticks have run; then anything still queued is flushed.
        await new Promise((resolve) => setTimeout(resolve));
        engine.flush();
      },
      get: <S>(target: ProviderToken<S>): S => engine.get(target),
      destroy: () => {
        if (!destroyed) {
          destroyed = true;
          live.delete(fixture);
          engine.destroy();
        }
      },
    };
    if (!this.state.manual) {
      track(fixture);
    }
    return fixture;
  }
}

/** The static starts: each one is a fresh builder with that one setting. */
export const TestBed: TestBedStatic = {
  component: (type) => new Bed(EMPTY)
    .component(type),
  providers: (...providers) => new Bed(EMPTY)
    .providers(...providers),
  host: (element) => new Bed(EMPTY)
    .host(element),
  override: (from, to) => new Bed(EMPTY)
    .override(from, to),
  inputs: (values) => new Bed(EMPTY)
    .inputs(values),
  manualCleanup: () => new Bed(EMPTY)
    .manualCleanup(),
};

class TemplateBuilder implements ComponentBuilderApi {
  constructor(
    private readonly source: string,
    private readonly imports: readonly (new () => object)[] = [],
  ) {}

  template(source: string): ComponentBuilderApi {
    return new TemplateBuilder(source, this.imports);
  }

  directives(...types: readonly (new () => object)[]): ComponentBuilderApi {
    return new TemplateBuilder(this.source, [...this.imports, ...types]);
  }

  build(): new () => object {
    const { source, imports } = this;
    @Component({ selector: "tk-test-component", template: source, imports })
    class TestComponent {}
    return TestComponent;
  }
}

/** The static start: a builder for a component with a template. */
export const ComponentBuilder: ComponentBuilderStatic = {
  template: (source) => new TemplateBuilder(source),
};

/** A method's implementation: the mock's method calls it with the same arguments. */
type Implementation = (...args: readonly unknown[]) => unknown;

/** The members a mock declares: inputs, outputs, fields and methods. */
interface MockMembers {
  readonly required: readonly string[];
  readonly optional: Readonly<Record<string, unknown>>;
  readonly outputs: readonly string[];
  readonly fields: Readonly<Record<string, unknown>>;
  readonly methods: Readonly<Record<string, Implementation>>;
}

const NO_MEMBERS: MockMembers = {
  required: [],
  optional: {},
  outputs: [],
  fields: {},
  methods: {},
};

/**
 * A required input of a mock, under the name templates use for the real input of that property
 * (its `name`, as the compiler registered it): a parent template binds the mock as the real class.
 */
function requiredInput(property: string, templateNames: Readonly<Record<string, string>>): unknown {
  const name = templateNames[property];
  return name === undefined ? input() : input({ name });
}

/** An optional input of a mock, with its default, under its template name (see requiredInput). */
function optionalInput(
  property: string,
  defaultValue: unknown,
  templateNames: Readonly<Record<string, string>>,
): unknown {
  const name = templateNames[property];
  return name === undefined ? input(defaultValue) : input(defaultValue, { name });
}

/** The members of a mock instance: one input and one output per declared name. */
function membersOf(members: MockMembers, templateNames: Readonly<Record<string, string>>): object {
  return {
    ...Object.fromEntries(
      members.required.map((name) => [name, requiredInput(name, templateNames)]),
    ),
    ...Object.fromEntries(
      Object.entries(members.optional)
        .map(([name, value]) => [name, optionalInput(name, value, templateNames)]),
    ),
    ...Object.fromEntries(members.outputs.map((name) => [name, output()])),
    ...members.fields,
    ...members.methods,
  };
}

/**
 * A builder for a mock of a component: a component with the same selector and exportAs,
 * the inputs and outputs named here, and no template. Immutable, like the other builders.
 */
export class MockComponentBuilder<F extends object> {
  private readonly selector: string;
  private readonly exportAs?: string;

  /** The same as `new MockComponentBuilder(type)`: the start of a chain. */
  static of<F extends object>(type: new () => F): MockComponentBuilder<F> {
    return new MockComponentBuilder<F>(type);
  }

  constructor(
    private readonly type: new () => F,
    private readonly members: MockMembers = NO_MEMBERS,
  ) {
    const metadata = getOrThrow(getComponentMetadata(type), () => new Error(`${type.name} is not a component: use MockDirectiveBuilder`));
    this.selector = metadata.selector;
    this.exportAs = metadata.exportAs;
  }

  /** Required inputs of `F` that the mock has too: a parent template must bind them. */
  requiredInputs<N extends InputName<F>>(...names: readonly N[]): MockComponentBuilder<F> {
    return new MockComponentBuilder<F>(this.type, {
      ...this.members,
      required: [...this.members.required, ...names],
    });
  }

  /** Optional inputs of `F` that the mock has too, each with the default the real input has. */
  optionalInputs<K extends InputName<F>>(
    defaults: { readonly [P in K]: InputValue<F[P]> },
  ): MockComponentBuilder<F> {
    return new MockComponentBuilder<F>(this.type, {
      ...this.members,
      optional: { ...this.members.optional, ...defaults },
    });
  }

  /** Fields of the mock, with their values: the template reads them as the real class's. */
  fields<K extends keyof F>(
    values: { readonly [P in K]: F[P] },
  ): MockComponentBuilder<F> {
    return new MockComponentBuilder<F>(this.type, {
      ...this.members,
      fields: { ...this.members.fields, ...values },
    });
  }

  /**
   * Methods of the mock, each with its implementation: the mock's method has the real
   * signature and passes its arguments to the implementation. A spy is an implementation.
   */
  methods<K extends MethodName<F>>(
    implementations: { readonly [P in K]: F[P] },
  ): MockComponentBuilder<F> {
    return new MockComponentBuilder<F>(this.type, {
      ...this.members,
      methods: {
        ...this.members.methods,
        ...(implementations as unknown as Record<string, Implementation>),
      },
    });
  }

  /** Outputs of `F` that the mock has too, so a parent template can listen to them. */
  outputs<N extends OutputName<F>>(...names: readonly N[]): MockComponentBuilder<F> {
    return new MockComponentBuilder<F>(this.type, {
      ...this.members,
      outputs: [...this.members.outputs, ...names],
    });
  }

  /** Create the mock class. It renders nothing. */
  build(): MockClass<F> {
    const { type, members, selector, exportAs } = this;
    @Component({ selector, template: "", ...(exportAs && { exportAs }) })
    class MockComponent {
      static readonly mockOf = type;

      constructor() {
        Object.assign(this, membersOf(members, inputNamesOf(type)));
      }
    }
    return MockComponent as unknown as MockClass<F>;
  }
}

/**
 * A builder for a mock of a directive: a directive with the same selector and exportAs,
 * the inputs and outputs named here, and nothing else. Immutable, like the other builders.
 */
export class MockDirectiveBuilder<F extends object> {
  private readonly selector: string;
  private readonly exportAs?: string;

  /** The same as `new MockDirectiveBuilder(type)`: the start of a chain. */
  static of<F extends object>(type: new () => F): MockDirectiveBuilder<F> {
    return new MockDirectiveBuilder<F>(type);
  }

  constructor(
    private readonly type: new () => F,
    private readonly members: MockMembers = NO_MEMBERS,
  ) {
    if (isSome(getComponentMetadata(type))) {
      throw new Error(`${type.name} is a component: use MockComponentBuilder`);
    }
    const metadata = getOrThrow(getDirectiveMetadata(type), () => new Error(`${type.name} is not a directive: nothing to mock`));
    this.selector = metadata.selector;
    this.exportAs = metadata.exportAs;
  }

  /** Required inputs of `F` that the mock has too: a parent template must bind them. */
  requiredInputs<N extends InputName<F>>(...names: readonly N[]): MockDirectiveBuilder<F> {
    return new MockDirectiveBuilder<F>(this.type, {
      ...this.members,
      required: [...this.members.required, ...names],
    });
  }

  /** Optional inputs of `F` that the mock has too, each with the default the real input has. */
  optionalInputs<K extends InputName<F>>(
    defaults: { readonly [P in K]: InputValue<F[P]> },
  ): MockDirectiveBuilder<F> {
    return new MockDirectiveBuilder<F>(this.type, {
      ...this.members,
      optional: { ...this.members.optional, ...defaults },
    });
  }

  /** Fields of the mock, with their values: the template reads them as the real class's. */
  fields<K extends keyof F>(
    values: { readonly [P in K]: F[P] },
  ): MockDirectiveBuilder<F> {
    return new MockDirectiveBuilder<F>(this.type, {
      ...this.members,
      fields: { ...this.members.fields, ...values },
    });
  }

  /**
   * Methods of the mock, each with its implementation: the mock's method has the real
   * signature and passes its arguments to the implementation. A spy is an implementation.
   */
  methods<K extends MethodName<F>>(
    implementations: { readonly [P in K]: F[P] },
  ): MockDirectiveBuilder<F> {
    return new MockDirectiveBuilder<F>(this.type, {
      ...this.members,
      methods: {
        ...this.members.methods,
        ...(implementations as unknown as Record<string, Implementation>),
      },
    });
  }

  /** Outputs of `F` that the mock has too, so a parent template can listen to them. */
  outputs<N extends OutputName<F>>(...names: readonly N[]): MockDirectiveBuilder<F> {
    return new MockDirectiveBuilder<F>(this.type, {
      ...this.members,
      outputs: [...this.members.outputs, ...names],
    });
  }

  /** Create the mock class. */
  build(): MockClass<F> {
    const { type, members, selector, exportAs } = this;
    @Directive({ selector, ...(exportAs && { exportAs }) })
    class MockDirective {
      static readonly mockOf = type;

      constructor() {
        Object.assign(this, membersOf(members, inputNamesOf(type)));
      }
    }
    return MockDirective as unknown as MockClass<F>;
  }
}
