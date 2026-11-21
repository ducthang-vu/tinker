import { describe, expect, test } from "vitest";
import { Engine } from "../engine.ts";
import { tick } from "../test-support.ts";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component } from "../authoring/decorators.ts";

/** The text of each row's element, in the page's order. */
function rows(el: HTMLElement): string[] {
  return [...el.querySelectorAll("li")].map((li) => li.textContent!.trim());
}

describe("@map", () => {
  test("renders one row per item, in order", async () => {
    @Component({
      selector: "tk-list",
      template: "<ul>@map todos(); let todo { <li>{{ todo }}</li> }</ul>",
    })
    class List {
      readonly todos = signal(["a", "b", "c"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(List, { host: el });
    await tick();
    expect(rows(el))
      .toEqual(["a", "b", "c"]);
    app.destroy();
  });

  test("an empty list renders no rows", async () => {
    @Component({
      selector: "tk-empty",
      template: "<ul>@map todos(); let todo { <li>{{ todo }}</li> }</ul>",
    })
    class Empty {
      readonly todos = signal<string[]>([]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Empty, { host: el });
    await tick();
    expect(rows(el))
      .toEqual([]);
    app.destroy();
  });

  test("the implicit variables are $index, $first, $last, $even, $odd and $count", async () => {
    @Component({
      selector: "tk-vars",
      template: `<ul>@map todos(); let todo {
        <li>{{ todo }}:{{ $index }}:{{ $first }}:{{ $last }}:{{ $even }}:{{ $odd }}:{{ $count }}</li>
      }</ul>`,
    })
    class Vars {
      readonly todos = signal(["a", "b", "c"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Vars, { host: el });
    await tick();
    expect(rows(el))
      .toEqual([
        "a:0:true:false:true:false:3",
        "b:1:false:false:false:true:3",
        "c:2:false:true:true:false:3",
      ]);
    app.destroy();
  });

  test("a new list of the same length with different content updates the rows", async () => {
    @Component({
      selector: "tk-same",
      template: "<ul>@map todos(); let todo { <li>{{ todo }}</li> }</ul>",
    })
    class Same {
      readonly todos = signal(["a", "b"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Same, { host: el });
    await tick();
    const first = el.querySelector("li");
    app.root.instance.todos.set(["x", "y"]);
    await tick();
    expect(rows(el))
      .toEqual(["x", "y"]);
    expect(el.querySelector("li"))
      .toBe(first);
    app.destroy();
  });

  test("inserting at the front updates every row and adds only the last one", async () => {
    @Component({
      selector: "tk-front",
      template: "<ul>@map todos(); let todo { <li>{{ todo }}</li> }</ul>",
    })
    class Front {
      readonly todos = signal(["A", "B", "C"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Front, { host: el });
    await tick();
    const before = [...el.querySelectorAll("li")];
    app.root.instance.todos.set(["Z", "A", "B", "C"]);
    await tick();
    expect(rows(el))
      .toEqual(["Z", "A", "B", "C"]);
    // Index tracking: the rows are reused; only the new last row is created.
    const after = [...el.querySelectorAll("li")];
    expect(after.slice(0, 3))
      .toEqual(before);
    expect(after)
      .toHaveLength(4);
    app.destroy();
  });

  test("removing an item removes its row", async () => {
    @Component({
      selector: "tk-remove",
      template: "<ul>@map todos(); let todo { <li>{{ todo }}</li> }</ul>",
    })
    class Remove {
      readonly todos = signal(["a", "b", "c"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Remove, { host: el });
    await tick();
    app.root.instance.todos.set(["a", "c"]);
    await tick();
    expect(rows(el))
      .toEqual(["a", "c"]);
    app.destroy();
  });

  test("with track, a row keeps its element when its item moves", async () => {
    @Component({
      selector: "tk-track",
      template: "<ul>@map todos(); let todo; track todo.id { <li>{{ todo.title }}</li> }</ul>",
    })
    class Track {
      readonly todos = signal([{ id: 1, title: "a" }, { id: 2, title: "b" }]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Track, { host: el });
    await tick();
    const [first, second] = [...el.querySelectorAll("li")];
    app.root.instance.todos.set([{ id: 2, title: "b" }, { id: 1, title: "a" }]);
    await tick();
    expect(rows(el))
      .toEqual(["b", "a"]);
    const after = [...el.querySelectorAll("li")];
    expect(after)
      .toEqual([second, first]);
    app.destroy();
  });

  test("with track, a row whose item changed shows the new content", async () => {
    @Component({
      selector: "tk-track-update",
      template: "<ul>@map todos(); let todo; track todo.id { <li>{{ todo.title }}</li> }</ul>",
    })
    class TrackUpdate {
      readonly todos = signal([{ id: 1, title: "a" }]);
    }
    const el = document.createElement("section");
    const app = bootstrap(TrackUpdate, { host: el });
    await tick();
    app.root.instance.todos.set([{ id: 1, title: "renamed" }]);
    await tick();
    expect(rows(el))
      .toEqual(["renamed"]);
    app.destroy();
  });

  test("two items with the same track key are an error", () => {
    @Component({
      selector: "tk-dup",
      template: "<ul>@map todos(); let todo; track todo.id { <li>{{ todo.id }}</li> }</ul>",
    })
    class Dup {
      readonly todos = signal([{ id: 1 }, { id: 1 }]);
    }
    const engine = Engine.create();
    engine.bootstrap(Dup, document.createElement("section"));
    expect(() => engine.flush())
      .toThrow("two items the same key");
  });

  test("a list that is not an array is an error", () => {
    @Component({
      selector: "tk-not-list",
      template: "<ul>@map todos(); let todo { <li>{{ todo }}</li> }</ul>",
    })
    class NotList {
      readonly todos = signal<unknown>("text");
    }
    const engine = Engine.create();
    engine.bootstrap(NotList, document.createElement("section"));
    expect(() => engine.flush())
      .toThrow("@map needs a list, got string");
  });

  test("a null list is an error that says null", () => {
    @Component({
      selector: "tk-null-list",
      template: "<ul>@map todos(); let todo { <li>{{ todo }}</li> }</ul>",
    })
    class NullList {
      readonly todos = signal<unknown>(null);
    }
    const engine = Engine.create();
    engine.bootstrap(NullList, document.createElement("section"));
    expect(() => engine.flush())
      .toThrow("@map needs a list, got null");
  });

  test("destroying the app removes the rows", async () => {
    @Component({
      selector: "tk-destroy",
      template: "<ul>@map todos(); let todo { <li>{{ todo }}</li> }</ul>",
    })
    class Destroy {
      readonly todos = signal(["a", "b"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Destroy, { host: el });
    await tick();
    app.destroy();
    expect(el.querySelectorAll("li"))
      .toHaveLength(0);
  });

  test("a row can read the @let values above the map", async () => {
    @Component({
      selector: "tk-let",
      template: "@let prefix = label(); <ul>@map todos(); let todo { <li>{{ prefix }}{{ todo }}</li> }</ul>",
    })
    class LetMap {
      readonly todos = signal(["a"]);
      label(): string {
        return "> ";
      }
    }
    const el = document.createElement("section");
    const app = bootstrap(LetMap, { host: el });
    await tick();
    expect(rows(el))
      .toEqual(["> a"]);
    app.destroy();
  });

  test("the track can read the $ variables, such as $index and $count", async () => {
    @Component({
      selector: "tk-track-index",
      template: "<ul>@map todos(); let todo; track $index + $count { <li>{{ todo }}</li> }</ul>",
    })
    class TrackIndex {
      readonly todos = signal(["a", "b"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(TrackIndex, { host: el });
    await tick();
    app.root.instance.todos.set(["x", "y"]);
    await tick();
    expect(rows(el))
      .toEqual(["x", "y"]);
    app.destroy();
  });

  test("a list reordered with the same items moves rows without recreating them", async () => {
    @Component({
      selector: "tk-reorder",
      template: "<ul>@map todos(); let todo; track todo { <li>{{ todo }}</li> }</ul>",
    })
    class Reorder {
      readonly todos = signal(["a", "b", "c"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Reorder, { host: el });
    await tick();
    const [a, b, c] = [...el.querySelectorAll("li")];
    app.root.instance.todos.set(["c", "a", "b"]);
    await tick();
    expect(rows(el))
      .toEqual(["c", "a", "b"]);
    expect([...el.querySelectorAll("li")])
      .toEqual([c, a, b]);
    app.destroy();
  });

  test("a rebuilt list whose rows did not move leaves the DOM as it is", async () => {
    @Component({
      selector: "tk-stable",
      template: "<ul>@map todos(); let todo; track todo { <li>{{ todo }}</li> }</ul>",
    })
    class Stable {
      readonly todos = signal(["a", "b"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Stable, { host: el });
    await tick();
    const [a, b] = [...el.querySelectorAll("li")];
    app.root.instance.todos.set(["a", "b", "c"]);
    await tick();
    expect(rows(el))
      .toEqual(["a", "b", "c"]);
    expect([...el.querySelectorAll("li")].slice(0, 2))
      .toEqual([a, b]);
    app.destroy();
  });
});

describe("@map errors", () => {
  test("a signal that is not called is reported, with the call to add", () => {
    @Component({
      selector: "tk-uncalled",
      template: "<ul>@map todos; let todo { <li>{{ todo }}</li> }</ul>",
    })
    class Uncalled {
      readonly todos = signal(["a"]);
    }
    const engine = Engine.create();
    engine.bootstrap(Uncalled, document.createElement("section"));
    expect(() => engine.flush())
      .toThrow("a signal is read with ()");
  });
});

describe("@map with track { fields }", () => {
  test("a row is identified by the fields together, so it keeps its element when moved", async () => {
    @Component({
      selector: "tk-fields",
      template: "<ul>@map rows(); let row; track { id, kind } { <li>{{ row.id }}{{ row.kind }}</li> }</ul>",
    })
    class Fields {
      readonly rows = signal([{ id: 1, kind: "a" }, { id: 1, kind: "b" }]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Fields, { host: el });
    await tick();
    const [first, second] = [...el.querySelectorAll("li")];
    app.root.instance.rows.set([{ id: 1, kind: "b" }, { id: 1, kind: "a" }]);
    await tick();
    expect(rows(el))
      .toEqual(["1b", "1a"]);
    expect([...el.querySelectorAll("li")])
      .toEqual([second, first]);
    app.destroy();
  });

  test("a row whose field values change is a different row", async () => {
    @Component({
      selector: "tk-fields-change",
      template: "<ul>@map rows(); let row; track { id, kind } { <li>{{ row.kind }}</li> }</ul>",
    })
    class FieldsChange {
      readonly rows = signal([{ id: 1, kind: "a" }]);
    }
    const el = document.createElement("section");
    const app = bootstrap(FieldsChange, { host: el });
    await tick();
    const before = el.querySelector("li");
    app.root.instance.rows.set([{ id: 1, kind: "b" }]);
    await tick();
    expect(rows(el))
      .toEqual(["b"]);
    expect(el.querySelector("li"))
      .not.toBe(before);
    app.destroy();
  });

  test("an object field is matched by reference, as ===", async () => {
    const owner = { name: "Ana" };
    @Component({
      selector: "tk-object-field",
      template: "<ul>@map rows(); let row; track { owner } { <li>{{ row.owner.name }}</li> }</ul>",
    })
    class ObjectField {
      readonly rows = signal([{ owner }]);
    }
    const el = document.createElement("section");
    const app = bootstrap(ObjectField, { host: el });
    await tick();
    const before = el.querySelector("li");
    app.root.instance.rows.set([{ owner: { ...owner } }]);
    await tick();
    expect(el.querySelector("li"))
      .not.toBe(before);
    app.destroy();
  });

  test("two items with the same fields are an error", () => {
    @Component({
      selector: "tk-fields-dup",
      template: "<ul>@map rows(); let row; track { id, kind } { <li>{{ row.id }}</li> }</ul>",
    })
    class FieldsDup {
      readonly rows = signal([{ id: 1, kind: "a" }, { id: 1, kind: "a" }]);
    }
    const engine = Engine.create();
    engine.bootstrap(FieldsDup, document.createElement("section"));
    expect(() => engine.flush())
      .toThrow("two items the same key");
  });

  test("an item without one of the fields is an error that names it", () => {
    @Component({
      selector: "tk-fields-missing",
      template: "<ul>@map rows(); let row; track { id, kind } { <li>{{ row.id }}</li> }</ul>",
    })
    class FieldsMissing {
      readonly rows = signal<unknown[]>([{ id: 1 }]);
    }
    const engine = Engine.create();
    engine.bootstrap(FieldsMissing, document.createElement("section"));
    expect(() => engine.flush())
      .toThrow(`needs the field "kind" on each item`);
  });

  test("an item that is not an object has no fields", () => {
    @Component({
      selector: "tk-fields-primitive",
      template: "<ul>@map rows(); let row; track { id } { <li>{{ row }}</li> }</ul>",
    })
    class FieldsPrimitive {
      readonly rows = signal<unknown[]>(["a"]);
    }
    const engine = Engine.create();
    engine.bootstrap(FieldsPrimitive, document.createElement("section"));
    expect(() => engine.flush())
      .toThrow(`needs the field "id" on each item`);
  });
});

describe("@map with a let pattern", () => {
  test("an object pattern destructures each item, and the names follow the item", async () => {
    @Component({
      selector: "tk-destructure",
      template: "<ul>@map rows(); let { id, title }; track id { <li>{{ title }}</li> }</ul>",
    })
    class Destructure {
      readonly rows = signal([{ id: 1, title: "a" }]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Destructure, { host: el });
    await tick();
    const before = el.querySelector("li");
    app.root.instance.rows.set([{ id: 1, title: "renamed" }]);
    await tick();
    expect(rows(el))
      .toEqual(["renamed"]);
    expect(el.querySelector("li"))
      .toBe(before);
    app.destroy();
  });

  test("an array pattern destructures each item into a first and a rest", async () => {
    @Component({
      selector: "tk-destructure-array",
      template: "<ul>@map pairs(); let [first, ...rest] { <li>{{ first }}:{{ rest.length }}</li> }</ul>",
    })
    class DestructureArray {
      readonly pairs = signal([["a", "b", "c"], ["x"]]);
    }
    const el = document.createElement("section");
    const app = bootstrap(DestructureArray, { host: el });
    await tick();
    expect(rows(el))
      .toEqual(["a:2", "x:0"]);
    app.destroy();
  });

  test("an as alias binds the whole item next to its destructured fields", async () => {
    @Component({
      selector: "tk-destructure-alias",
      template: "<ul>@map rows(); let { id, title } as row; track id "
        + "{ <li>{{ row.title }}:{{ title }}</li> }</ul>",
    })
    class DestructureAlias {
      readonly rows = signal([{ id: 1, title: "a" }]);
    }
    const el = document.createElement("section");
    const app = bootstrap(DestructureAlias, { host: el });
    await tick();
    const before = el.querySelector("li");
    app.root.instance.rows.set([{ id: 1, title: "renamed" }]);
    await tick();
    expect(rows(el))
      .toEqual(["renamed:renamed"]);
    expect(el.querySelector("li"))
      .toBe(before);
    app.destroy();
  });

  test("an as alias after an array pattern binds the whole array", async () => {
    @Component({
      selector: "tk-destructure-array-alias",
      template: "<ul>@map pairs(); let [first, ...rest] as list "
        + "{ <li>{{ list.length }}:{{ first }}:{{ rest.length }}</li> }</ul>",
    })
    class DestructureArrayAlias {
      readonly pairs = signal([["a", "b", "c"]]);
    }
    const el = document.createElement("section");
    const app = bootstrap(DestructureArrayAlias, { host: el });
    await tick();
    expect(rows(el))
      .toEqual(["3:a:2"]);
    app.destroy();
  });

  test("an item that does not match the pattern is an error", () => {
    @Component({
      selector: "tk-destructure-miss",
      template: "<ul>@map rows(); let { id, title } { <li>{{ title }}</li> }</ul>",
    })
    class DestructureMiss {
      readonly rows = signal<unknown[]>([{ id: 1 }]);
    }
    const engine = Engine.create();
    engine.bootstrap(DestructureMiss, document.createElement("section"));
    expect(() => engine.flush())
      .toThrow("does not match its let pattern");
  });
});

describe("@map rows without nodes", () => {
  test("a row whose body makes no nodes keeps its place, and the element after the map stays last", async () => {
    @Component({
      selector: "tk-no-nodes",
      template: "<ul>@map rows(); let row { @let shown = row; }<li>end</li></ul>",
    })
    class NoNodes {
      readonly rows = signal(["a"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(NoNodes, { host: el });
    await tick();
    app.root.instance.rows.set(["b", "a", "c"]);
    await tick();
    const ul = el.querySelector("ul")!;
    expect(ul.lastElementChild!.tagName)
      .toBe("LI");
    expect(ul.querySelectorAll("li"))
      .toHaveLength(1);
    app.destroy();
  });
});
