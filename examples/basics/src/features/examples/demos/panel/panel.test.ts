import { describe, expect, test, vi } from "vitest";
import { MockComponentBuilder, TestBed } from "@tinker/testing";
import { Gauge, Panel } from "./panel.ts";
import { buttonNamed } from "../../../../../testing/testing-helpers.ts";

describe("Panel", () => {
  test("its button sets the gauge it names", () => {
    const ref = TestBed.component(Panel)
      .build();
    buttonNamed(ref.root, "Set")
      .click();
    ref.detectChanges();
    expect(ref.root.query(Gauge)
      .text())
      .toBe("level 3");
    ref.destroy();
  });

  test("with the gauge mocked, the button calls the mock's show with 3", () => {
    const show = vi.fn();
    const mock = MockComponentBuilder.of(Gauge)
      .methods({ show })
      .build();
    const ref = TestBed.override(Gauge, mock)
      .component(Panel)
      .build();
    buttonNamed(ref.root, "Set")
      .click();
    ref.detectChanges();
    expect(show)
      .toHaveBeenCalledWith(3);
    ref.destroy();
  });
});
