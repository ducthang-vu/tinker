import { expect, test } from "vitest";
import { browserPlatformLocation } from "./platform-location.ts";

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
