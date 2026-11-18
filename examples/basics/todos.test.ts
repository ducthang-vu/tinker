import { describe, expect, test } from "vitest";
import { TestBed } from "@tinker/testing";
import { Toggle, Todos } from "./todos.ts";
import { buttonNamed, nth } from "./testing-helpers.ts";

describe("Todos", () => {
  test("starts with three rows, one of them done", () => {
    const ref = TestBed.component(Todos)
      .build();
    expect(ref.root.queryAll(Toggle))
      .toHaveLength(3);
    expect(ref.root.query("p")
      .text())
      .toContain("1 of 3 done, 3 toggles on screen");
    ref.destroy();
  });

  test("a row's button flips that row, and only that row", () => {
    const ref = TestBed.component(Todos)
      .build();
    nth(ref.root.queryAll(Toggle), 1).element.dispatchEvent(new MouseEvent("click"));
    ref.detectChanges();
    expect(ref.root.query("p")
      .text())
      .toContain("2 of 3 done");
    expect(nth(ref.root.queryAll("li"), 1).element.classList.contains("done"))
      .toBe(true);
    expect(nth(ref.root.queryAll("li"), 2).element.classList.contains("done"))
      .toBe(false);
    ref.destroy();
  });

  test("Add appends a task that is not done", () => {
    const ref = TestBed.component(Todos)
      .build();
    buttonNamed(ref.root, "Add")
      .click();
    ref.detectChanges();
    expect(ref.root.queryAll(Toggle))
      .toHaveLength(4);
    expect(ref.root.query("p")
      .text())
      .toContain("1 of 4 done");
    expect(ref.root.query("ul")
      .text())
      .toContain("Task 4");
    ref.destroy();
  });

  test("Clear removes every task and shows the empty case", () => {
    const ref = TestBed.component(Todos)
      .build();
    buttonNamed(ref.root, "Clear")
      .click();
    ref.detectChanges();
    expect(ref.root.query("ul")
      .text())
      .toContain("Nothing to do");
    expect(ref.root.query("p")
      .text())
      .toContain("0 of 0 done");
    ref.destroy();
  });

  test("the first and last rows are marked", () => {
    const ref = TestBed.component(Todos)
      .build();
    const rows = ref.root.queryAll("li");
    expect(nth(rows, 0)
      .query("em")
      .text())
      .toBe("first");
    expect(nth(rows, 2)
      .query("em")
      .text())
      .toBe("last");
    ref.destroy();
  });

  test("the summary shows each title with a check when done", () => {
    const ref = TestBed.component(Todos)
      .build();
    const summary = nth(ref.root.queryAll("ul"), 1)
      .text();
    expect(summary)
      .toContain("✓ Write the docs");
    expect(summary)
      .toContain("· Ship the release");
    ref.destroy();
  });
});
