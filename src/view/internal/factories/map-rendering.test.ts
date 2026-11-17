import { describe, expect, test } from "vitest";
import { signal } from "../../../signals/index.ts";
import { bootstrap } from "../../bootstrap.ts";
import { Component } from "../authoring/decorators.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve));

/** The text of each row's element, in the page's order. */
function rows(el: HTMLElement): string[] {
  return [...el.querySelectorAll("li")].map((li) => li.textContent!.trim());
}

describe("@map", () => {
  test("renders one row per item, in order", () => {
    @Component({
      selector: "tk-list",
      template: "<ul>@map todos(); let todo { <li>{{ todo }}</li> }</ul>",
    })
    class List {
      readonly todos = signal(["a", "b", "c"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(List, { host: el });
    expect(rows(el))
      .toEqual(["a", "b", "c"]);
    app.destroy();
  });

  test("an empty list renders no rows", () => {
    @Component({
      selector: "tk-empty",
      template: "<ul>@map todos(); let todo { <li>{{ todo }}</li> }</ul>",
    })
    class Empty {
      readonly todos = signal<string[]>([]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Empty, { host: el });
    expect(rows(el))
      .toEqual([]);
    app.destroy();
  });

  test("the implicit variables are $index, $first, $last, $even, $odd and $count", () => {
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
    expect(() => bootstrap(Dup, { host: document.createElement("section") }))
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
    expect(() => bootstrap(NotList, { host: document.createElement("section") }))
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
    expect(() => bootstrap(NullList, { host: document.createElement("section") }))
      .toThrow("@map needs a list, got null");
  });

  test("destroying the app removes the rows", () => {
    @Component({
      selector: "tk-destroy",
      template: "<ul>@map todos(); let todo { <li>{{ todo }}</li> }</ul>",
    })
    class Destroy {
      readonly todos = signal(["a", "b"]);
    }
    const el = document.createElement("section");
    const app = bootstrap(Destroy, { host: el });
    app.destroy();
    expect(el.querySelectorAll("li"))
      .toHaveLength(0);
  });

  test("a row can read the @let values above the map", () => {
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
    expect(() => bootstrap(Uncalled, { host: document.createElement("section") }))
      .toThrow("a signal is read with ()");
  });
});
