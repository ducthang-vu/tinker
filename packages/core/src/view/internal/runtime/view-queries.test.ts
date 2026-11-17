import { describe, expect, test } from "vitest";
import { ViewQueries } from "./view-queries.ts";

class Badge {}
class Other {}

describe("ViewQueries", () => {
  test("of(type) lists the instances of that type, and only those", () => {
    const queries = new ViewQueries();
    const badge = new Badge();
    queries.add(badge, document.createElement("i"));
    queries.add(new Other(), document.createElement("i"));
    expect(queries.of(Badge)())
      .toEqual([badge]);
  });

  test("the instances come in document order, whatever the order they were added in", () => {
    const parent = document.createElement("div");
    const first = document.createElement("i");
    const second = document.createElement("i");
    parent.append(first, second);
    const queries = new ViewQueries();
    const late = new Badge();
    const early = new Badge();
    queries.add(late, second);
    queries.add(early, first);
    expect(queries.of(Badge)())
      .toEqual([early, late]);
  });

  test("two instances on one element keep their order, and an element compares equal to itself", () => {
    const element = document.createElement("i");
    const queries = new ViewQueries();
    const one = new Badge();
    const two = new Badge();
    queries.add(one, element);
    queries.add(two, element);
    expect(queries.of(Badge)())
      .toEqual([one, two]);
  });

  test("the function returned by add removes the instance", () => {
    const queries = new ViewQueries();
    const badge = new Badge();
    const remove = queries.add(badge, document.createElement("i"));
    remove();
    expect(queries.of(Badge)())
      .toEqual([]);
  });

  test("reordered() makes the list read the DOM again", () => {
    const parent = document.createElement("div");
    const first = document.createElement("i");
    const second = document.createElement("i");
    parent.append(first, second);
    const queries = new ViewQueries();
    const a = new Badge();
    const b = new Badge();
    queries.add(a, first);
    queries.add(b, second);
    const list = queries.of(Badge);
    expect(list())
      .toEqual([a, b]);
    parent.append(first);
    queries.reordered();
    expect(list())
      .toEqual([b, a]);
  });

  test("elementsOf(type) gives an ElementRef for each instance's element, in order", () => {
    const parent = document.createElement("div");
    const first = document.createElement("i");
    const second = document.createElement("b");
    parent.append(first, second);
    const queries = new ViewQueries();
    queries.add(new Badge(), second);
    queries.add(new Badge(), first);
    expect(queries.elementsOf(Badge)()
      .map((ref) => ref.nativeElement))
      .toEqual([first, second]);
  });
});
