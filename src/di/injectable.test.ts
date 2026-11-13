import { describe, expect, test } from "vitest";
import { inject } from "./inject.ts";
import { getInjectableMetadata, Injectable } from "./injectable.ts";
import { Injector, runInInjectionContext } from "./injector.ts";
import { provide } from "./providers.ts";

describe("@Injectable", () => {
  test("records its options as metadata", () => {
    @Injectable({ providedIn: "root" })
    class InRoot {}
    @Injectable()
    class Marker {}
    class Plain {}

    expect(getInjectableMetadata(InRoot)
      .getOrElse(undefined))
      .toEqual({ providedIn: "root" });
    expect(getInjectableMetadata(Marker)
      .getOrElse(undefined))
      .toEqual({});
    expect(getInjectableMetadata(Plain)
      .isNone())
      .toBe(true);
    expect(Object.isFrozen(getInjectableMetadata(InRoot)
      .getOrElse(undefined)))
      .toBe(true);
  });

  test("providedIn root: available in a root injector without being listed", () => {
    @Injectable({ providedIn: "root" })
    class Store {
      items = ["apple"];
    }
    const { injector } = Injector.create();
    expect(runInInjectionContext(injector, () => inject(Store)).items)
      .toEqual(["apple"]);
  });

  test("providedIn root: one instance per root, shared by its children", () => {
    @Injectable({ providedIn: "root" })
    class Store {}
    const root = Injector.create().injector;
    const a = Injector.create({ parent: root }).injector;
    const b = Injector.create({ parent: root }).injector;
    const fromA = runInInjectionContext(a, () => inject(Store));
    expect(runInInjectionContext(b, () => inject(Store)))
      .toBe(fromA);
    expect(runInInjectionContext(root, () => inject(Store)))
      .toBe(fromA);
    expect(runInInjectionContext(Injector.create().injector, () => inject(Store))).not.toBe(fromA);
  });

  test("providedIn root: its own inject() calls resolve from the root", () => {
    @Injectable({ providedIn: "root" })
    class Config {
      url = "https://api";
    }
    @Injectable({ providedIn: "root" })
    class Api {
      readonly config = inject(Config);
    }
    const child = Injector.create({ parent: Injector.create().injector }).injector;
    expect(runInInjectionContext(child, () => inject(Api)).config.url)
      .toBe("https://api");
  });

  test("explicit providers win: a child can override a root service", () => {
    @Injectable({ providedIn: "root" })
    class Logger {
      name = "root logger";
    }
    class TestLogger extends Logger {
      override name = "test logger";
    }
    const root = Injector.create().injector;
    const child = Injector.create({
      providers: [provide(Logger, { useClass: TestLogger })],
      parent: root,
    }).injector;
    expect(runInInjectionContext(child, () => inject(Logger)).name)
      .toBe("test logger");
    expect(runInInjectionContext(root, () => inject(Logger)).name)
      .toBe("root logger");
  });

  test("root services are cleaned up with their root injector", () => {
    let closed = 0;
    @Injectable({ providedIn: "root" })
    class Connection {
      onDestroy() {
        closed++;
      }
    }
    const ref = Injector.create();
    runInInjectionContext(ref.injector, () => inject(Connection));
    ref.destroy();
    expect(closed)
      .toBe(1);
  });

  test("without providedIn, a service must still be listed", () => {
    @Injectable()
    class FormState {}
    expect(() => runInInjectionContext(Injector.create().injector, () => inject(FormState)))
      .toThrow(
        "No provider for FormState",
      );
    const { injector } = Injector.create({ providers: [FormState] });
    expect(runInInjectionContext(injector, () => inject(FormState)))
      .toBeInstanceOf(FormState);
  });

  test("only concrete classes without constructor arguments can be decorated", () => {
    // @ts-expect-error the injector creates it with `new`, so it needs a no-argument constructor
    @Injectable({ providedIn: "root" })
    class NeedsArguments {
      constructor(readonly value: string) {}
    }
    void NeedsArguments;
  });
});
