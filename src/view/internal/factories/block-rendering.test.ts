import { describe, expect, test } from "vitest";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component, Directive } from "../authoring/decorators.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe("@if and @else", () => {
  test("shows its body when the condition is truthy, and nothing when it is not", async () => {
    @Component({ selector: "tk-if", template: "@if (on()) { <p>yes</p> }" })
    class If {
      readonly on = signal(true);
    }
    const el = document.createElement("section");
    const app = bootstrap(If, { host: el });
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
    const app = bootstrap(Else, { host: el });
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
    const app = bootstrap(Chain, { host: el });
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
    const app = bootstrap(Match, { host: el });
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
    const app = bootstrap(NoDefault, { host: el });
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
    const app = bootstrap(Keep, { host: el });
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
    const app = bootstrap(Lets, { host: el });
    expect(el.textContent!.trim())
      .toBe("Ana");
    app.root.instance.person.set("Bo");
    await tick();
    expect(el.textContent!.trim())
      .toBe("Bo");
    app.destroy();
  });

  test("destroying the app removes the shown branch and its components", () => {
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
    const app = bootstrap(OwnerMatch, { host: el });
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
    const app = bootstrap(Falsy, { host: el });
    expect(el.textContent!.trim())
      .toBe("zero");
    app.root.instance.n.set(3);
    await tick();
    expect(el.textContent!.trim())
      .toBe("some");
    app.destroy();
  });

  test("a match inside an element with a directive is attached with that element's injector", () => {
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
    expect(el.querySelector("div")!.textContent!.trim())
      .toBe("inner");
    expect(el.textContent)
      .toContain("root");
  });

  test("_ matches anything, so the case after it is never reached", () => {
    @Component({
      selector: "tk-any",
      template: "@match n() { @case _ { anything } @case 1 { never } }",
    })
    class Any {
      readonly n = signal(1);
    }
    const el = document.createElement("section");
    bootstrap(Any, { host: el });
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
    const app = bootstrap(Guards, { host: el });
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

  test("a guard is not evaluated when its pattern does not match", () => {
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
    expect(calls)
      .toBe(0);
    expect(el.textContent!.trim())
      .toBe("other");
  });

  test("a case whose guard is false falls through to the next case", () => {
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
    expect(el.textContent!.trim())
      .toBe("second");
  });
});
