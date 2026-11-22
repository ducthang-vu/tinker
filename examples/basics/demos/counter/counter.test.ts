import { describe, expect, test } from "vitest";
import { MockComponentBuilder, MockDirectiveBuilder, TestBed } from "@tinker/testing";
import { Counter, Step } from "./counter.ts";
import { Highlight } from "../highlight/highlight.ts";
import { buttonNamed } from "../../support/testing-helpers.ts";

describe("Counter", () => {
  test("starts at zero, which is even, with no change yet", () => {
    const ref = TestBed.component(Counter)
      .build();
    expect(ref.root.text())
      .toContain("Count: 0 (even)");
    expect(ref.root.text())
      .toContain("no change yet");
    ref.destroy();
  });

  test("a button adds its step to the count and says what changed", () => {
    const ref = TestBed.component(Counter)
      .build();
    buttonNamed(ref.root, "+10")
      .click();
    ref.detectChanges();
    expect(ref.root.text())
      .toContain("Count: 10 (even)");
    expect(ref.root.text())
      .toContain("last change: +10");
    ref.destroy();
  });

  test("a negative count is marked and odd", () => {
    const ref = TestBed.component(Counter)
      .build();
    buttonNamed(ref.root, "-1")
      .click();
    ref.detectChanges();
    expect(ref.root.text())
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
    expect(first.root.text())
      .toContain("Count: 1");
    expect(second.root.text())
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

  test("with Highlight mocked, hovering the count does not highlight it", () => {
    const mock = new MockDirectiveBuilder(Highlight)
      .build();
    const ref = TestBed.override(Highlight, mock)
      .component(Counter)
      .build();
    ref.root.query("p")
      .dispatchEvent("mouseenter");
    expect(ref.root.query("p").element.classList.contains("highlighted"))
      .toBe(false);
    expect(ref.root.query(Highlight).instance)
      .toBeInstanceOf(mock);
    ref.destroy();
  });
});
