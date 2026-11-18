import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TestBed } from "@tinker/testing";
import { Clock } from "./clock.ts";

const START = new Date(2026, 0, 1, 10, 0, 0);

describe("Clock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("shows the time", () => {
    const ref = TestBed.component(Clock)
      .build();
    expect(ref.root.query("p")?.element.textContent)
      .toBe(START.toLocaleTimeString());
    ref.destroy();
  });

  test("ticks every second", () => {
    const ref = TestBed.component(Clock)
      .build();
    vi.advanceTimersByTime(1000);
    ref.detectChanges();
    expect(ref.root.query("p")?.element.textContent)
      .toBe(new Date(2026, 0, 1, 10, 0, 1)
        .toLocaleTimeString());
    ref.destroy();
  });

  test("destroying the clock stops its timer", () => {
    const ref = TestBed.component(Clock)
      .build();
    expect(vi.getTimerCount())
      .toBe(1);
    ref.destroy();
    expect(vi.getTimerCount())
      .toBe(0);
  });
});
