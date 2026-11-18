// The runtime of the test bed: the builders behind `TestBed` and `ComponentBuilder`.
// Each builder is immutable: a configuration method returns a new builder, so a chain
// reads in any order, and a builder can be reused.

import {
  CLASS_REPLACEMENTS,
  Component,
  Directive,
  getComponentMetadata,
  getDirectiveMetadata,
  input,
  output,
  Engine,
  type Provider,
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
  MockClass,
  TestBed as TestBedApi,
  Fixture,
  TestBedStatic,
} from "./api.ts";

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

/**
 * Run `cleanup` after each test, when the test runner offers `afterEach` as a global
 * (Vitest with `globals: true`). Without it, nothing is registered, and the test setup
 * calls `afterEach(cleanup)` itself.
 */
export function registerCleanup(afterEach: ((hook: () => void) => void) | undefined): void {
  afterEach?.(cleanup);
}

registerCleanup((globalThis as { afterEach?: (hook: () => void) => void }).afterEach);

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
    const engine = Engine.create({
      providers: [provide(CLASS_REPLACEMENTS, { useValue: replacements }), ...this.state.providers],
    });
    const host = this.state.host ?? document.createElement("div");
    const ref = engine.bootstrap(component, host);
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
      whenStable: () => engine.afterStable()
        .toPromise(),
      get: <S>(token: Token<S>): S => engine.get(token),
      destroy: () => {
        if (!destroyed) {
          destroyed = true;
          live.delete(fixture);
          engine.destroy();
        }
      },
    };
    if (!this.state.manual) {
      live.add(fixture);
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

/** The members a mock declares: required inputs, optional inputs with defaults, outputs. */
interface MockMembers {
  readonly required: readonly string[];
  readonly optional: Readonly<Record<string, unknown>>;
  readonly outputs: readonly string[];
}

/** The members of a mock instance: one input and one output per declared name. */
function membersOf(members: MockMembers): object {
  return {
    ...Object.fromEntries(members.required.map((name) => [name, input()])),
    ...Object.fromEntries(
      Object.entries(members.optional)
        .map(([name, value]) => [name, input(value)]),
    ),
    ...Object.fromEntries(members.outputs.map((name) => [name, output()])),
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
    private readonly members: MockMembers = { required: [], optional: {}, outputs: [] },
  ) {
    const metadata = getComponentMetadata(type)
      .getOrThrow(() => new Error(`${type.name} is not a component: use MockDirectiveBuilder`));
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
        Object.assign(this, membersOf(members));
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
    private readonly members: MockMembers = { required: [], optional: {}, outputs: [] },
  ) {
    if (getComponentMetadata(type)
      .isSome()) {
      throw new Error(`${type.name} is a component: use MockComponentBuilder`);
    }
    const metadata = getDirectiveMetadata(type)
      .getOrThrow(() => new Error(`${type.name} is not a directive: nothing to mock`));
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
        Object.assign(this, membersOf(members));
      }
    }
    return MockDirective as unknown as MockClass<F>;
  }
}
