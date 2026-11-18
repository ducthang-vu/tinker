import { describe, expect, test } from "vitest";
import { TestBed } from "@tinker/testing";
import { Counter } from "./counter.ts";
import { buttonNamed } from "./testing-helpers.ts";

describe("Counter", () => {
  test("starts at zero, which is even, with no change yet", () => {
    const ref = TestBed.component(Counter)
      .build();
    expect(ref.root.element.textContent)
      .toContain("Count: 0 (even)");
    expect(ref.root.element.textContent)
      .toContain("no change yet");
    ref.destroy();
  });

  test("a button adds its step to the count and says what changed", () => {
    const ref = TestBed.component(Counter)
      .build();
    buttonNamed(ref.root, "+10")
      .click();
    ref.detectChanges();
    expect(ref.root.element.textContent)
      .toContain("Count: 10 (even)");
    expect(ref.root.element.textContent)
      .toContain("last change: +10");
    ref.destroy();
  });

  test("a negative count is marked and odd", () => {
    const ref = TestBed.component(Counter)
      .build();
    buttonNamed(ref.root, "-1")
      .click();
    ref.detectChanges();
    expect(ref.root.element.textContent)
      .toContain("Count: -1 (odd)");
    expect(ref.root.query("p").element.classList.contains("negative"))
      .toBe(true);
    ref.destroy();
  });

  test("each counter has its own count", () => {
    const first = TestBed.component(Counter)
      .build();
    const second = TestBed.component(Counter)
      .build();
    buttonNamed(first.root, "+1")
      .click();
    first.detectChanges();
    expect(first.root.element.textContent)
      .toContain("Count: 1");
    expect(second.root.element.textContent)
      .toContain("Count: 0");
    first.destroy();
    second.destroy();
  });

  test("the buttons have tooltips", () => {
    const ref = TestBed.component(Counter)
      .build();
    expect(ref.root.queryAll("button")
      .map((button) => button.element.getAttribute("title")))
      .toEqual(["Remove one", "Add one", "Add ten"]);
    ref.destroy();
  });

  test("hovering the count highlights it", () => {
    const ref = TestBed.component(Counter)
      .build();
    const count = ref.root.query("p").element;
    expect(count.classList.contains("highlighted"))
      .toBe(false);
    count.dispatchEvent(new MouseEvent("mouseenter"));
    ref.detectChanges();
    expect(count.classList.contains("highlighted"))
      .toBe(true);
    ref.destroy();
  });
});
