import { describe, expect, test } from "vitest";
import { Selector } from "./selector.ts";
import { match, Left, Right } from "@tinker/functional/v1";

const element = (name: string, attributes: Record<string, string> = {}) => ({
  name,
  attributes: Object.entries(attributes)
    .map(([n, value]) => ({ name: n, value })),
});
const matches = (selector: string, el: ReturnType<typeof element>) => match(Selector.parse(selector), { Left: (error) => {
  throw error;
}, Right: (value) => value })
  .matches(el);
const error = (selector: string) => match(Selector.parse(selector), { Left: (e) => e.message, Right: () => "no error" });

describe("Selector", () => {
  test("a tag matches elements with that name, case-insensitively", () => {
    expect(matches("tk-card", element("tk-card")))
      .toBe(true);
    expect(matches("TK-Card", element("tk-card")))
      .toBe(true);
    expect(matches("tk-card", element("div")))
      .toBe(false);
  });

  test("[attr] requires the attribute, with any value", () => {
    expect(matches("[tooltip]", element("button", { tooltip: "" })))
      .toBe(true);
    expect(matches("[toolTip]", element("button", { tooltip: "x" })))
      .toBe(true);
    expect(matches("[tooltip]", element("button")))
      .toBe(false);
  });

  test("[attr=value] requires that value, quoted or not", () => {
    for (const selector of ["[type=submit]", `[type="submit"]`, "[type='submit']", "[ type = submit ]"]) {
      expect(matches(selector, element("button", { type: "submit" })))
        .toBe(true);
      expect(matches(selector, element("button", { type: "reset" })))
        .toBe(false);
    }
    expect(matches(`[title=""]`, element("p", { title: "" })))
      .toBe(true);
  });

  test(".class requires the class among the element's classes", () => {
    expect(matches(".primary", element("button", { class: "big  primary" })))
      .toBe(true);
    expect(matches(".primary", element("button", { class: "primary-ish" })))
      .toBe(false);
    expect(matches(".primary", element("button")))
      .toBe(false);
  });

  test("combinations require everything", () => {
    const selector = "button[tooltip].primary";
    expect(matches(selector, element("button", { tooltip: "", class: "primary" })))
      .toBe(true);
    expect(matches(selector, element("a", { tooltip: "", class: "primary" })))
      .toBe(false);
    expect(matches(selector, element("button", { class: "primary" })))
      .toBe(false);
    expect(matches(selector, element("button", { tooltip: "" })))
      .toBe(false);
  });

  test(":not(...) excludes the elements its selector matches", () => {
    expect(matches("button:not([disabled])", element("button")))
      .toBe(true);
    expect(matches("button:not([disabled])", element("button", { disabled: "" })))
      .toBe(false);
    expect(matches("button:not([type=submit])", element("button", { type: "reset" })))
      .toBe(true);
    expect(matches("button:not([type=submit])", element("button", { type: "submit" })))
      .toBe(false);
    expect(matches(":not(.a)", element("p", { class: "b" })))
      .toBe(true);
    expect(matches(":not(.a)", element("p", { class: "a" })))
      .toBe(false);
  });

  test(":not(...) with a comma list excludes what any part matches", () => {
    const selector = "div:not(.a, [hidden])";
    expect(matches(selector, element("div")))
      .toBe(true);
    expect(matches(selector, element("div", { class: "a" })))
      .toBe(false);
    expect(matches(selector, element("div", { hidden: "" })))
      .toBe(false);
  });

  test("several :not(...) all apply, and combine with the rest", () => {
    const selector = "button[tooltip]:not(.a):not([disabled])";
    expect(matches(selector, element("button", { tooltip: "" })))
      .toBe(true);
    expect(matches(selector, element("button", { tooltip: "", class: "a" })))
      .toBe(false);
    expect(matches(selector, element("button", { tooltip: "", disabled: "" })))
      .toBe(false);
    expect(matches(selector, element("button")))
      .toBe(false);
  });

  test("a comma list matches what any of its selectors matches", () => {
    const selector = "button, [tooltip].primary, a:not(.x)";
    expect(matches(selector, element("button")))
      .toBe(true);
    expect(matches(selector, element("div", { tooltip: "", class: "primary" })))
      .toBe(true);
    expect(matches(selector, element("a", { class: "x" })))
      .toBe(false);
    expect(matches(selector, element("a")))
      .toBe(true);
    expect(matches(selector, element("div", { tooltip: "" })))
      .toBe(false);
  });

  test("commas inside quotes or parentheses do not separate selectors", () => {
    expect(matches(`[title="a, b"]`, element("p", { title: "a, b" })))
      .toBe(true);
    expect(matches(`[title="a, b"]`, element("p", { title: "a" })))
      .toBe(false);
    expect(matches("p:not(.a, .b)", element("p", { class: "b" })))
      .toBe(false);
    expect(matches("p:not(.a, .b), button", element("button", { class: "b" })))
      .toBe(true);
  });

  test("keeps its source", () => {
    expect(match(Selector.parse(" [a] "), { Left: (error) => {
      throw error;
    }, Right: (value) => value }).source)
      .toBe(" [a] ");
  });

  test("reports what is not supported", () => {
    expect(error(""))
      .toBe(`Empty selector: write e.g. "[tooltip]" or "tk-card"`);
    expect(error("div p"))
      .toBe(
        `Unsupported selector "div p" at " p": write a tag, [attr], [attr=value], .class or :not(...)`,
      );
    expect(error("div:not()"))
      .toBe(`Empty part in ":not()" of "div:not()": write e.g. ":not([disabled])"`);
    expect(error("div:not(.a,)"))
      .toMatch(/^Empty part in ":not\(\.a,\)"/);
    expect(error("div:not(:not(.a))"))
      .toMatch(/^Unsupported selector "div:not\(:not\(\.a\)\)" at ":not\(:not\(\.a\)\)"/);
    expect(error("div:hover"))
      .toMatch(/^Unsupported selector "div:hover" at ":hover"/);
    expect(error("div,"))
      .toBe(`Empty part in selector list "div,": write e.g. "[tooltip], tk-card"`);
    expect(error(", p"))
      .toBe(`Empty part in selector list ", p": write e.g. "[tooltip], tk-card"`);
    expect(error("   "))
      .toBe(`Empty selector: write e.g. "[tooltip]" or "tk-card"`);
    expect(error("[a"))
      .toMatch(/^Unsupported selector "\[a" at "\[a"/);
    expect(error("#id"))
      .toMatch(/^Unsupported selector/);
  });
});
