// The runtime of the test bed: the builders behind `TestBed` and `ComponentBuilder`.
// Each builder is immutable: a configuration method returns a new builder, so a chain
// reads in any order, and a builder can be reused.

import {
  CLASS_REPLACEMENTS,
  defineComponent,
  Engine,
  type Provider,
  provide,
  type Token,
} from "@tinker/core";
import { testingElementOf, type Scope } from "./fixture.ts";
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
    class TestComponent {}
    defineComponent(TestComponent, {
      selector: "tk-test-component",
      template: this.source,
      imports: this.imports,
    });
    return TestComponent;
  }
}

/** The static starts: a builder for a component with a template, or a mock of a class. */
export const ComponentBuilder: ComponentBuilderStatic = {
  template: (source) => new TemplateBuilder(source),
  mock: () => {
    throw new Error("ComponentBuilder.mock is not implemented yet");
  },
};
