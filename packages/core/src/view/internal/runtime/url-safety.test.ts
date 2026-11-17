import { describe, expect, test } from "vitest";
import { isEventAttribute, isSafeUrl, isUrlAttribute } from "./url-safety.ts";

describe("isSafeUrl", () => {
  test("allows http, https, mailto, tel and relative URLs", () => {
    for (const url of ["https://example.com/a", "http://example.com", "mailto:a@b.c",
      "tel:+15550100", "/docs/page", "page.html", "#top", "//example.com/x"]) {
      expect(isSafeUrl(url), url)
        .toBe(true);
    }
  });

  test("refuses script and data URLs, whatever the case or stray characters", () => {
    for (const url of ["javascript:alert(1)", "JavaScript:alert(1)", "java\tscript:alert(1)",
      " javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:msgbox(1)"]) {
      expect(isSafeUrl(url), url)
        .toBe(false);
    }
  });

  test("refuses a URL that does not parse", () => {
    expect(isSafeUrl("http://[::"))
      .toBe(false);
  });
});

describe("isUrlAttribute and isEventAttribute", () => {
  test("recognises URL attributes regardless of case", () => {
    expect([isUrlAttribute("href"), isUrlAttribute("SRC"), isUrlAttribute("title")])
      .toEqual([true, true, false]);
  });

  test("refuses any name starting with on, since any of them may be a handler", () => {
    expect([isEventAttribute("onclick"), isEventAttribute("OnLoad"), isEventAttribute("title")])
      .toEqual([true, true, false]);
    expect(isEventAttribute("one"))
      .toBe(true);
  });
});
