import { expect, test } from "vitest";
import { browserPlatformLocation, toAppPath } from "./platform-location.ts";

test("the browser implementation reads and writes the address bar", () => {
  browserPlatformLocation.push("/todos/7?tab=done#top", { scroll: 3 });
  expect(browserPlatformLocation.url())
    .toBe("/todos/7?tab=done#top");
  expect(browserPlatformLocation.state())
    .toEqual({ scroll: 3 });
  browserPlatformLocation.replace("/todos", null);
  expect(browserPlatformLocation.url())
    .toBe("/todos");
  expect(browserPlatformLocation.state())
    .toBeNull();
});

test("onPop calls the listener on popstate, until it is stopped", () => {
  let calls = 0;
  const stop = browserPlatformLocation.onPop(() => {
    calls++;
  });
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  expect(calls)
    .toBe(1);
  stop();
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  expect(calls)
    .toBe(1);
});

test("under the folder named by the page's <base>, the app sees paths without it", () => {
  const base = document.createElement("base");
  base.href = "/tinker/";
  document.head.append(base);
  try {
    window.history.replaceState(null, "", "/tinker/api?x=1");
    expect(browserPlatformLocation.url())
      .toBe("/api?x=1");
    browserPlatformLocation.push("/todos", null);
    expect(window.location.pathname)
      .toBe("/tinker/todos");
    expect(browserPlatformLocation.href?.("/api"))
      .toBe("/tinker/api");
  } finally {
    base.remove();
    window.history.replaceState(null, "", "/");
  }
});

test("a <base> without a trailing slash still names a folder", () => {
  const base = document.createElement("base");
  base.href = "/tinker";
  document.head.append(base);
  try {
    window.history.replaceState(null, "", "/tinker/api");
    expect(browserPlatformLocation.url())
      .toBe("/api");
  } finally {
    base.remove();
    window.history.replaceState(null, "", "/");
  }
});

test("the folder's own URL, with no trailing slash, is the root, and a URL outside it is kept", () => {
  expect(toAppPath("/tinker/", "/tinker"))
    .toBe("/");
  expect(toAppPath("/tinker/", "/other/page"))
    .toBe("/other/page");
});
