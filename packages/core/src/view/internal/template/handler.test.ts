import { describe, expect, test, vi } from "vitest";
import { parseHandler, requireMethod, runHandler } from "./handler.ts";
import { Scope } from "./scope.ts";

describe("parseHandler", () => {
  test("accepts a call of a method, with or without arguments, and spaces", () => {
    expect(parseHandler("pick()", "event handler")
      .getOrThrow()
      .method)
      .toBe("pick");
    expect(parseHandler(" pick( $event ) ", "event handler")
      .getOrThrow()
      .method)
      .toBe("pick");
    expect(parseHandler("select(item.id, $event.key)", "event handler")
      .getOrThrow()
      .method)
      .toBe("select");
  });

  test("a call of a template variable's method is accepted, with its target", () => {
    const handler = parseHandler("g.show(3)", "event handler")
      .getOrThrow();
    expect(handler.method)
      .toBe("show");
    expect(handler.target)
      .toBe("g");
  });

  test("rejects anything that is not a call of a method, naming what it was", () => {
    for (const source of ["pick", "a.b.c()", "pick()()", "open = !open"]) {
      expect(parseHandler(source, "event handler")
        .match({
          left: (error) => error.message,
          right: () => "accepted",
        }))
        .toMatch(new RegExp(`^Unsupported event handler "${source.replace(/[.()=!]/g, "\\$&")}": `));
    }
  });

  test("reports a syntax error inside the handler", () => {
    expect(parseHandler("pick(1 2)", "event handler")
      .match({
        left: (error) => error.message,
        right: () => "accepted",
      }))
      .toContain(`Expected "," or ")"`);
  });
});

describe("runHandler", () => {
  test("calls the method with $event as the event", () => {
    const pick = vi.fn();
    const component = { pick };
    const event = { key: "Enter" };
    runHandler(parseHandler("pick($event)", "event handler")
      .getOrThrow(), new Scope(component), event);
    expect(pick)
      .toHaveBeenCalledWith(event);
  });

  test("evaluates the arguments: $event fields and the component's fields", () => {
    const select = vi.fn();
    const component = { select, id: 7 };
    runHandler(parseHandler("select(id, $event.key)", "event handler")
      .getOrThrow(), new Scope(component), { key: "a" });
    expect(select)
      .toHaveBeenCalledWith(7, "a");
  });

  test("calls the method with the component as this", () => {
    const seen: unknown[] = [];
    const component = {
      name: "tinker",
      go(this: { name: string }) {
        seen.push(this.name);
      },
    };
    runHandler(parseHandler("go()", "event handler")
      .getOrThrow(), new Scope(component), undefined);
    expect(seen)
      .toEqual(["tinker"]);
  });
});

describe("requireMethod", () => {
  test("passes for a method and throws for anything else, naming the event", () => {
    class Owner {
      pick() {}
    }
    expect(() => requireMethod(new Owner(), "pick", `event "(click)"`))
      .not.toThrow();
    expect(() => requireMethod(new Owner(), "missing", `event "(click)"`))
      .toThrow(`Owner has no method "missing" for event "(click)"`);
  });
});
