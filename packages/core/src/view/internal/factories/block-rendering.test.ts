import { describe, expect, test } from "vitest";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, Directive } from "../authoring/decorators.ts";
import { valueOrThrow } from "@tinker/functional";

describe("@if and @else", () => {
  test("shows its body when the condition is truthy, and nothing when it is not", async () => {
    @Component({ selector: "tk-if", template: "@if (on()) { <p>yes</p> }" })
    class If {
      readonly on = signal(true);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(If, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("yes");
    app.root.instance.on.set(false);
    await tick();
    expect(el.textContent!.trim())
      .toBe("");
    app.destroy();
  });

  test("@else shows the other branch", async () => {
    @Component({ selector: "tk-else", template: "@if (on()) { A } @else { B }" })
    class Else {
      readonly on = signal(false);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Else, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("B");
    app.root.instance.on.set(true);
    await tick();
    expect(el.textContent!.trim())
      .toBe("A");
    app.destroy();
  });

  test("@else if picks the first condition that is truthy", async () => {
    @Component({
      selector: "tk-chain",
      template: "@if (a() > 1) { big } @else if (a() > 0) { small } @else { none }",
    })
    class Chain {
      readonly a = signal(0);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Chain, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("none");
    app.root.instance.a.set(1);
    await tick();
    expect(el.textContent!.trim())
      .toBe("small");
    app.root.instance.a.set(2);
    await tick();
    expect(el.textContent!.trim())
      .toBe("big");
    app.destroy();
  });
});

describe("@match", () => {
  test("shows the first case whose literal matches, and the default otherwise", async () => {
    @Component({
      selector: "tk-match",
      template: `@match state() {
        @case "loading" { <p>wait</p> }
        @case "error" { <p>oops</p> }
        @default { <p>done</p> }
      }`,
    })
    class Match {
      readonly state = signal("loading");
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Match, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("wait");
    app.root.instance.state.set("error");
    await tick();
    expect(el.textContent!.trim())
      .toBe("oops");
    app.root.instance.state.set("other");
    await tick();
    expect(el.textContent!.trim())
      .toBe("done");
    app.destroy();
  });

  test("without a default, nothing is shown when no case matches", async () => {
    @Component({ selector: "tk-nodefault", template: "@match n() { @case 1 { one } }" })
    class NoDefault {
      readonly n = signal(1);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(NoDefault, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("one");
    app.root.instance.n.set(2);
    await tick();
    expect(el.textContent!.trim())
      .toBe("");
    app.destroy();
  });

  test("a branch is not recreated while the subject keeps picking it", async () => {
    let made = 0;
    @Component({ selector: "tk-made", template: "{{ 'x' }}" })
    class Made {
      constructor() {
        made += 1;
      }
    }
    @Component({
      selector: "tk-keep",
      template: "@match n() { @case truthy { <tk-made></tk-made> } }",
      imports: [Made],
    })
    class Keep {
      readonly n = signal(1);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Keep, { host: el }));
    await tick();
    expect(made)
      .toBe(1);
    app.root.instance.n.set(2);
    await tick();
    expect(made)
      .toBe(1);
    app.destroy();
  });

  test("a branch reads the @let values above it", async () => {
    @Component({
      selector: "tk-lets",
      template: "@let label = name(); @if (on()) { <p>{{ label }}</p> }",
    })
    class Lets {
      readonly on = signal(true);
      readonly person = signal("Ana");

      name(): string {
        return this.person();
      }
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Lets, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("Ana");
    app.root.instance.person.set("Bo");
    await tick();
    expect(el.textContent!.trim())
      .toBe("Bo");
    app.destroy();
  });

  test("destroying the app removes the shown branch and its components", async () => {
    let destroyed = 0;
    @Component({ selector: "tk-gone", template: "<b>x</b>" })
    class Gone {
      onDestroy(): void {
        destroyed += 1;
      }
    }
    @Component({
      selector: "tk-owner-match",
      template: "@if (true) { <tk-gone></tk-gone> }",
      imports: [Gone],
    })
    class OwnerMatch {}
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(OwnerMatch, { host: el }));
    await tick();
    expect(el.querySelector("tk-gone"))
      .not.toBeNull();
    app.destroy();
    expect(destroyed)
      .toBe(1);
    expect(el.innerHTML)
      .toBe("");
  });

  test("a falsy pattern matches the falsy values", async () => {
    @Component({
      selector: "tk-falsy",
      template: "@match n() { @case falsy { zero } @default { some } }",
    })
    class Falsy {
      readonly n = signal(0);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Falsy, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("zero");
    app.root.instance.n.set(3);
    await tick();
    expect(el.textContent!.trim())
      .toBe("some");
    app.destroy();
  });

  test("a match inside an element with a directive is attached with that element's injector", async () => {
    @Directive({ selector: "[mark]" })
    class Mark {}
    @Component({
      selector: "tk-marked",
      template: "@if (true) { root } <div mark>@if (true) { inner }</div>",
      imports: [Mark],
    })
    class Marked {}
    const el = document.createElement("section");
    bootstrap(Marked, { host: el });
    await tick();
    expect(el.querySelector("div")!.textContent!.trim())
      .toBe("inner");
    expect(el.textContent)
      .toContain("root");
  });

  test("_ matches anything, so the case after it is never reached", async () => {
    @Component({
      selector: "tk-any",
      template: "@match n() { @case _ { anything } @case 1 { never } }",
    })
    class Any {
      readonly n = signal(1);
    }
    const el = document.createElement("section");
    bootstrap(Any, { host: el });
    await tick();
    expect(el.textContent!.trim())
      .toBe("anything");
  });

  test("a match of guards shows the first guard that is truthy", async () => {
    @Component({
      selector: "tk-guards",
      template: `@match {
        @case _ when score() >= 90 { A }
        @case _ when score() >= 50 { B }
        @default { C }
      }`,
    })
    class Guards {
      readonly score = signal(10);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Guards, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("C");
    app.root.instance.score.set(60);
    await tick();
    expect(el.textContent!.trim())
      .toBe("B");
    app.root.instance.score.set(95);
    await tick();
    expect(el.textContent!.trim())
      .toBe("A");
    app.destroy();
  });

  test("a guard is not evaluated when its pattern does not match", async () => {
    let calls = 0;
    @Component({
      selector: "tk-lazy",
      template: "@match n() { @case 2 when check() { two } @default { other } }",
    })
    class Lazy {
      readonly n = signal(1);

      check(): boolean {
        calls += 1;
        return true;
      }
    }
    const el = document.createElement("section");
    bootstrap(Lazy, { host: el });
    await tick();
    expect(calls)
      .toBe(0);
    expect(el.textContent!.trim())
      .toBe("other");
  });

  test("a case whose guard is false falls through to the next case", async () => {
    @Component({
      selector: "tk-fall",
      template: "@match n() { @case 1 when ok() { first } @case 1 { second } }",
    })
    class Fall {
      readonly n = signal(1);
      readonly ok = signal(false);
    }
    const el = document.createElement("section");
    bootstrap(Fall, { host: el });
    await tick();
    expect(el.textContent!.trim())
      .toBe("second");
  });

  test("relations: the subject is compared with a literal", async () => {
    @Component({
      selector: "tk-rel",
      template: "@match n() { @case >= 90 { A } @case >= 50 { B } @default { C } }",
    })
    class Rel {
      readonly n = signal(10);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Rel, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("C");
    app.root.instance.n.set(60);
    await tick();
    expect(el.textContent!.trim())
      .toBe("B");
    app.root.instance.n.set(95);
    await tick();
    expect(el.textContent!.trim())
      .toBe("A");
    app.destroy();
  });

  test("an object pattern shows its names, and they follow their values", async () => {
    @Component({
      selector: "tk-object",
      template: "@match res() { @case { status, index: number } { {{ status }} } @default { none } }",
    })
    class ObjectMatch {
      readonly res = signal<{ status: string; index: number }>({ status: "paid", index: 1 });
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(ObjectMatch, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("paid");
    app.root.instance.res.set({ status: "late", index: 2 });
    await tick();
    expect(el.textContent!.trim())
      .toBe("late");
    app.destroy();
  });

  test("open ranges and same-name alternatives pick their branches and bind names", async () => {
    @Component({
      selector: "tk-open",
      template: "@match age() { @case 18.. { adult } @case ..17 { minor } @default { none } }",
    })
    class OpenRange {
      readonly age = signal(30);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(OpenRange, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("adult");
    app.root.instance.age.set(12);
    await tick();
    expect(el.textContent!.trim())
      .toBe("minor");
    app.destroy();

    @Component({
      selector: "tk-either",
      template: "@match res() { @case { status: \"ok\", value } | { status: \"cached\", value } { {{ value }} } @default { none } }",
    })
    class SameNames {
      readonly res = signal<{ status: string; value: number }>({ status: "cached", value: 7 });
    }
    const el2 = document.createElement("section");
    const app2 = valueOrThrow(bootstrap(SameNames, { host: el2 }));
    await tick();
    expect(el2.textContent!.trim())
      .toBe("7");
    app2.root.instance.res.set({ status: "ok", value: 8 });
    await tick();
    expect(el2.textContent!.trim())
      .toBe("8");
    app2.destroy();
  });

  test("a tuple matches a pair of exactly that length, and binds its items", async () => {
    @Component({
      selector: "tk-tuple",
      template: "@match pair() { @case (a, { id }) { {{ a }}-{{ id }} } @default { other } }",
    })
    class TupleMatch {
      readonly pair = signal<unknown[]>(["x", { id: 2 }]);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(TupleMatch, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("x-2");
    app.root.instance.pair.set(["x"]);
    await tick();
    expect(el.textContent!.trim())
      .toBe("other");
    app.destroy();
  });

  test("a regex matches a string, and only a string", async () => {
    @Component({
      selector: "tk-regex",
      template: String.raw`@match code() { @case /^\d+$/ { number } @default { text } }`,
    })
    class RegexMatch {
      readonly code = signal<unknown>("42");
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(RegexMatch, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("number");
    app.root.instance.code.set("x");
    await tick();
    expect(el.textContent!.trim())
      .toBe("text");
    app.root.instance.code.set(42);
    await tick();
    expect(el.textContent!.trim())
      .toBe("text");
    app.destroy();
  });

  test("an as-pattern shows the whole value under its alias, and its names too", async () => {
    @Component({
      selector: "tk-alias",
      template: "@match user() { @case { id, name } as u { {{ name }}#{{ u.id }} } @default { none } }",
    })
    class AliasMatch {
      readonly user = signal<{ id: number; name: string } | null>({ id: 4, name: "Ada" });
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(AliasMatch, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("Ada#4");
    app.root.instance.user.set({ id: 5, name: "Grace" });
    await tick();
    expect(el.textContent!.trim())
      .toBe("Grace#5");
    app.root.instance.user.set(null);
    await tick();
    expect(el.textContent!.trim())
      .toBe("none");
    app.destroy();
  });

  test("an object pattern fails on a missing key, a wrong type, or a non-object", async () => {
    @Component({
      selector: "tk-shape",
      template: "@match res() { @case { index: number } { number } @default { other } }",
    })
    class Shape {
      readonly res = signal<unknown>({ index: "one" });
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Shape, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("other");
    app.root.instance.res.set(null);
    await tick();
    expect(el.textContent!.trim())
      .toBe("other");
    app.root.instance.res.set({ index: 3 });
    await tick();
    expect(el.textContent!.trim())
      .toBe("number");
    app.destroy();
  });

  test("a nested object pattern matches inside a field", async () => {
    @Component({
      selector: "tk-nested",
      template: "@match order() { @case { customer: { country: \"FR\" } } { free } @default { paid } }",
    })
    class Nested {
      readonly order = signal({ customer: { country: "FR" } });
    }
    const el = document.createElement("section");
    bootstrap(Nested, { host: el });
    await tick();
    expect(el.textContent!.trim())
      .toBe("free");
  });

  test("a guard can read the names its pattern bound", async () => {
    @Component({
      selector: "tk-bound-guard",
      template: "@match res() { @case { status } when status === \"ok\" { ok } @default { no } }",
    })
    class BoundGuard {
      readonly res = signal({ status: "ok" });
    }
    const el = document.createElement("section");
    bootstrap(BoundGuard, { host: el });
    await tick();
    expect(el.textContent!.trim())
      .toBe("ok");
  });

  test("every relation operator compares the subject with its literal", async () => {
    @Component({
      selector: "tk-ops",
      template: "@match n() { @case < 5 { lt } @case <= 3 { le } @case > 10 { gt } @case !== 7 { ne } @default { eq } }",
    })
    class Ops {
      readonly n = signal(7);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Ops, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("eq");
    app.root.instance.n.set(2);
    await tick();
    expect(el.textContent!.trim())
      .toBe("lt");
    app.destroy();
  });

  test("a bare name binds the whole value", async () => {
    @Component({
      selector: "tk-name",
      template: "@match n() { @case m { value {{ m }} } }",
    })
    class NameBinding {
      readonly n = signal(4);
    }
    const el = document.createElement("section");
    bootstrap(NameBinding, { host: el });
    await tick();
    expect(el.textContent!.trim())
      .toBe("value 4");
  });

  test("an object pattern fails on a number, which is not an object", async () => {
    @Component({
      selector: "tk-number-shape",
      template: "@match n() { @case { a } { yes } @default { no } }",
    })
    class NumberShape {
      readonly n = signal<unknown>(5);
    }
    const el = document.createElement("section");
    bootstrap(NumberShape, { host: el });
    await tick();
    expect(el.textContent!.trim())
      .toBe("no");
  });

  test("an object pattern fails when a key is missing, even if its value would be undefined", async () => {
    @Component({
      selector: "tk-missing",
      template: "@match r() { @case { status } { yes } @default { no } }",
    })
    class Missing {
      readonly r = signal<object>({});
    }
    const el = document.createElement("section");
    bootstrap(Missing, { host: el });
    await tick();
    expect(el.textContent!.trim())
      .toBe("no");
  });

  test("the object type does not match null, but matches an object", async () => {
    @Component({
      selector: "tk-object-type",
      template: "@match r() { @case { v: object } { yes } @default { no } }",
    })
    class ObjectType {
      readonly r = signal<object>({ v: null });
    }
    const el = document.createElement("section");
    bootstrap(ObjectType, { host: el });
    await tick();
    expect(el.textContent!.trim())
      .toBe("no");
  });
});

describe("@match with array patterns", () => {
  test("@case [] shows its branch only for an empty array, and it follows the list", async () => {
    @Component({
      selector: "tk-empty-case",
      template: "@match items() { @case [] { none } @default { some } }",
    })
    class EmptyCase {
      readonly items = signal<string[]>([]);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(EmptyCase, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("none");
    app.root.instance.items.set(["a"]);
    await tick();
    expect(el.textContent!.trim())
      .toBe("some");
    app.destroy();
  });

  test("[first, ...rest] binds the first item and the others, and needs at least one", async () => {
    @Component({
      selector: "tk-rest-case",
      template: "@match items() { @case [first, ...rest] { {{ first }}+{{ rest.length }} } @default { empty } }",
    })
    class RestCase {
      readonly items = signal<string[]>([]);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(RestCase, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("empty");
    app.root.instance.items.set(["a", "b", "c"]);
    await tick();
    expect(el.textContent!.trim())
      .toBe("a+2");
    app.destroy();
  });
});

describe("@case with an array literal pattern", () => {
  test("[1, 2] matches only an array of exactly those items", async () => {
    @Component({
      selector: "tk-literal-array",
      template: "@match value() { @case [1, 2] { yes } @default { no } }",
    })
    class LiteralArray {
      readonly value = signal<unknown>([1, 2]);
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(LiteralArray, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("yes");
    for (const value of ["x", [3, 2], [1, 2, 3]]) {
      app.root.instance.value.set(value);
      await tick();
      expect(el.textContent!.trim())
        .toBe("no");
    }
    app.destroy();
  });
});

describe("@match with the remaining patterns", () => {
  test("alternatives, a range, not and present pick their branches", async () => {
    @Component({
      selector: "tk-remaining",
      template: `@match value() {
        @case "loading" | "saving" { busy }
        @case 0..12 { small }
        @case not "guest" { user }
        @case present { other }
        @default { none }
      }`,
    })
    class Remaining {
      readonly value = signal<unknown>("saving");
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Remaining, { host: el }));
    await tick();
    const shown = async (value: unknown) => {
      app.root.instance.value.set(value);
      await tick();
      return el.textContent!.trim();
    };
    expect(await shown("saving"))
      .toBe("busy");
    expect(await shown(7))
      .toBe("small");
    expect(await shown("ana"))
      .toBe("user");
    expect(await shown("guest"))
      .toBe("other");
    expect(await shown(null))
      .toBe("user");
    app.destroy();
  });

  test("an absent key picks the branch for an object without it", async () => {
    @Component({
      selector: "tk-absent",
      template: "@match result() { @case { error: absent } { ok } @default { failed } }",
    })
    class Absent {
      readonly result = signal<object>({ value: 1 });
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Absent, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("ok");
    app.root.instance.result.set({ error: "boom" });
    await tick();
    expect(el.textContent!.trim())
      .toBe("failed");
    app.destroy();
  });
});

describe("a block header may hold markup-like text", () => {
  test("a @case with a named group, whose pattern has a < in it, matches as the header says", async () => {
    @Component({
      selector: "tk-named",
      template: String.raw`@match code() { @case /^(?<n>\d+)<$/ { number } @default { text } }`,
    })
    class Named {
      readonly code = signal<unknown>("42<");
    }
    const el = document.createElement("section");
    const app = valueOrThrow(bootstrap(Named, { host: el }));
    await tick();
    expect(el.textContent!.trim())
      .toBe("number");
    app.destroy();
  });
});
