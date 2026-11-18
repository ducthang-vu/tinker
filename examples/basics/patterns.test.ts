import { describe, expect, test } from "vitest";
import { TestBed } from "@tinker/testing";
import { Patterns } from "./patterns.ts";
import { buttonNamed } from "./testing-helpers.ts";

describe("Patterns", () => {
  test("the status moves through its values, and the alternatives match", () => {
    const ref = TestBed.component(Patterns)
      .build();
    expect(ref.root.query("p")
      .text())
      .toContain("idle");
    buttonNamed(ref.root, "Next status")
      .click();
    ref.detectChanges();
    expect(ref.root.text())
      .toContain("Working…");
    buttonNamed(ref.root, "Next status")
      .click();
    ref.detectChanges();
    expect(ref.root.text())
      .toContain("Working…");
    buttonNamed(ref.root, "Next status")
      .click();
    ref.detectChanges();
    expect(ref.root.text())
      .toContain("Stopped: failed");
    ref.destroy();
  });

  test("a score falls in a range", () => {
    const ref = TestBed.component(Patterns)
      .build();
    expect(ref.root.text())
      .toContain("Below the pass mark");
    buttonNamed(ref.root, "Next score")
      .click();
    ref.detectChanges();
    expect(ref.root.text())
      .toContain("Passed");
    buttonNamed(ref.root, "Next score")
      .click();
    ref.detectChanges();
    expect(ref.root.text())
      .toContain("Excellent");
    ref.destroy();
  });

  test("an outcome binds its value, or matches the error when there is one", () => {
    const ref = TestBed.component(Patterns)
      .build();
    expect(ref.root.text())
      .toContain("Got 42");
    buttonNamed(ref.root, "Toggle outcome")
      .click();
    ref.detectChanges();
    expect(ref.root.text())
      .toContain("Failed: timeout");
    ref.destroy();
  });

  test("a list matches its shape", () => {
    const ref = TestBed.component(Patterns)
      .build();
    expect(ref.root.text())
      .toContain("No items");
    buttonNamed(ref.root, "Next list")
      .click();
    ref.detectChanges();
    expect(ref.root.text())
      .toContain("Just apple");
    buttonNamed(ref.root, "Next list")
      .click();
    ref.detectChanges();
    expect(ref.root.text())
      .toContain("apple, and 2 more");
    ref.destroy();
  });

  test("a name that is present is greeted, and a missing one is not", () => {
    const ref = TestBed.component(Patterns)
      .build();
    expect(ref.root.text())
      .toContain("Hello, stranger");
    buttonNamed(ref.root, "Next name")
      .click();
    ref.detectChanges();
    expect(ref.root.text())
      .toContain("Hello, Ana");
    ref.destroy();
  });
});
