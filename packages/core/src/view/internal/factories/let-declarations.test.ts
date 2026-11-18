import { describe, expect, test } from "vitest";
import { Engine } from "../engine.ts";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component } from "../authoring/decorators.ts";
import { input } from "../authoring/input.ts";

@Component({
  selector: "tk-greeting",
  template: "@let who = name(); @let n = count(); Hi {{ who }} ({{ n }})",
})
class Greeting {
  readonly person = signal("Ana");
  readonly total = signal(2);

  name(): string {
    return this.person();
  }

  count(): number {
    return this.total();
  }
}

@Component({ selector: "tk-shadow", template: "@let label = value(); {{ label }}" })
class Shadow {
  readonly label = signal("field");

  value(): string {
    return "local";
  }
}

@Component({ selector: "tk-callable", template: "@let make = greet; {{ make() }}" })
class Callable {
  greet(): string {
    return "from let";
  }
}

@Component({ selector: "tk-child", template: "{{ text() }}" })
class Child {
  readonly text = input("");
}

@Component({
  selector: "tk-parent",
  template: "@let message = ready(); <tk-child [text]=\"message\"></tk-child>",
  imports: [Child],
})
class Parent {
  ready(): string {
    return "ready";
  }
}

describe("@let template variables", () => {
  test("a declared variable is shown, and follows the signals it reads", async () => {
    const host = document.createElement("section");
    const app = bootstrap(Greeting, { host });
    await tick();
    expect(host.textContent!.trim())
      .toBe("Hi Ana (2)");
    app.root.instance.person.set("Bo");
    app.root.instance.total.set(7);
    await new Promise((resolve) => setTimeout(resolve));
    expect(host.textContent!.trim())
      .toBe("Hi Bo (7)");
    app.destroy();
  });

  test("a variable shadows a method or field of the same name", async () => {
    const host = document.createElement("section");
    bootstrap(Shadow, { host });
    await tick();
    expect(host.textContent!.trim())
      .toBe("local");
  });

  test("a variable holding a function is called without a receiver", async () => {
    const host = document.createElement("section");
    bootstrap(Callable, { host });
    await tick();
    expect(host.textContent!.trim())
      .toBe("from let");
  });

  test("a variable is set before a child's input reads it", async () => {
    const host = document.createElement("section");
    bootstrap(Parent, { host });
    await tick();
    expect(host.querySelector("tk-child")!.textContent)
      .toBe("ready");
  });

  test("an invalid expression is a compile error, naming the variable", () => {
    @Component({ selector: "tk-bad", template: "@let x = a.;" })
    class Bad {}
    const engine = Engine.create();

    expect(() => engine.bootstrap(Bad, document.createElement("div")))

      .toThrow("in @let x");
  });

  test("a variable is computed once per change, however many times it is read", async () => {
    let calls = 0;
    @Component({ selector: "tk-shared", template: "@let n = count(); {{ n }} {{ n }}" })
    class Shared {
      readonly total = signal(1);

      count(): number {
        calls += 1;
        return this.total();
      }
    }
    const host = document.createElement("section");
    const app = bootstrap(Shared, { host });
    await tick();
    expect(calls)
      .toBe(1);
    app.root.instance.total.set(2);
    await new Promise((resolve) => setTimeout(resolve));
    expect(calls)
      .toBe(2);
    expect(host.textContent!.trim())
      .toBe("2 2");
    app.destroy();
  });

  test("a variable sees only the variables declared above it", async () => {
    @Component({ selector: "tk-order", template: "@let a = b(); @let b = 'let'; {{ a }}" })
    class Order {
      b(): string {
        return "field";
      }
    }
    const host = document.createElement("section");
    bootstrap(Order, { host });
    await tick();
    expect(host.textContent!.trim())
      .toBe("field");
  });

  test("a variable that refers to its own name reads the field of that name", async () => {
    @Component({ selector: "tk-self", template: "@let title = title; {{ title }}" })
    class Self {
      readonly title = "field";
    }
    const host = document.createElement("section");
    bootstrap(Self, { host });
    await tick();
    expect(host.textContent!.trim())
      .toBe("field");
  });
});
