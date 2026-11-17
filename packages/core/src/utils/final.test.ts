import { describe, expect, test } from "vitest";
import { final } from "./final.ts";

describe("@final", () => {
  test("the class itself can be created, and its instances are its instances", () => {
    @final
    class Sealed {
      readonly value = 1;
    }
    expect(new Sealed().value)
      .toBe(1);
    expect(new Sealed())
      .toBeInstanceOf(Sealed);
    expect(Sealed.name)
      .toBe("Sealed");
  });

  test("a subclass cannot be created: the error names the class", () => {
    @final
    class Sealed {}
    class Sub extends Sealed {}
    expect(() => new Sub())
      .toThrow("Sealed is final: it cannot be subclassed");
  });

  test("constructor arguments reach the class; the base constructor runs once", () => {
    let runs = 0;
    @final
    class Counted {
      constructor(readonly label: string) {
        runs++;
      }
    }
    const counted = new Counted("x");
    expect([counted.label, runs])
      .toEqual(["x", 1]);
  });

  test("statics and methods of the class are kept", () => {
    @final
    class WithStatic {
      static make() {
        return new WithStatic();
      }

      hello() {
        return "hi";
      }
    }
    expect(WithStatic.make()
      .hello())
      .toBe("hi");
  });

  test("a subclass rejected before its base constructor runs: nothing is created", () => {
    let created = 0;
    @final
    class Costly {
      constructor() {
        created++;
      }
    }
    class Sub extends Costly {}
    expect(() => new Sub())
      .toThrow();
    expect(created)
      .toBe(0);
  });
});
