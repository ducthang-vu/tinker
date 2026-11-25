import { expect, test } from "vitest";
import { inject, Injector, provide, runInInjectionContext } from "@tinker/core";
import { tick } from "../../../../core/src/view/internal/test-support.ts";
import { Location } from "./location.ts";
import { PLATFORM_LOCATION, type PlatformLocation } from "./platform-location.ts";

/** A platform location that records what the router does, and can go back in time. */
function fakePlatform(url = "/todos", state: unknown = null) {
  let current = { url, state };
  const listeners = new Set<() => void>();
  const platform: PlatformLocation = {
    url: () => current.url,
    state: () => current.state,
    push: (next, nextState) => {
      current = { url: next, state: nextState };
    },
    replace: (next, nextState) => {
      current = { url: next, state: nextState };
    },
    onPop: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    platform,
    listeners,
    /** A back or forward move: the browser changes, then its listeners run. */
    pop(url: string, state: unknown) {
      current = { url, state };
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

/** A Location in the context of the fake, and the destroy of its injector. */
function locationWith(platform: PlatformLocation) {
  const { injector, destroy } = Injector.create({
    providers: [
      provide(PLATFORM_LOCATION, { useValue: platform }),
      provide(Location, { useClass: Location }),
    ],
  });
  return { location: runInInjectionContext(injector, () => inject(Location)), destroy };
}

test("starts from the URL and state of the browser", () => {
  const fake = fakePlatform("/todos?tab=done", { scroll: 320 });
  const { location } = locationWith(fake.platform);
  expect(location.url())
    .toBe("/todos?tab=done");
  expect(location.state())
    .toEqual({ scroll: 320 });
});

test("go pushes a new entry and updates the URL and state", () => {
  const fake = fakePlatform();
  const { location } = locationWith(fake.platform);
  location.go("/todos/7", { scroll: 0 });
  expect(location.url())
    .toBe("/todos/7");
  expect(location.state())
    .toEqual({ scroll: 0 });
});

test("go with no state sets the state to null", () => {
  const fake = fakePlatform("/todos", { scroll: 1 });
  const { location } = locationWith(fake.platform);
  location.go("/about");
  expect(location.state())
    .toBeNull();
});

test("replace changes the current entry", () => {
  const fake = fakePlatform("/todos");
  const { location } = locationWith(fake.platform);
  location.replace("/todos?tab=open", { tab: "open" });
  expect(location.url())
    .toBe("/todos?tab=open");
  expect(location.state())
    .toEqual({ tab: "open" });
});

test("a back or forward move is announced to listeners, and the view stays until it is committed", async () => {
  const fake = fakePlatform("/todos");
  const { location } = locationWith(fake.platform);
  location.go("/todos/7");
  const seen: { url: string; state: unknown }[] = [];
  location.onPop((url, state) => seen.push({ url, state }));
  fake.pop("/todos", { scroll: 320 });
  await tick();
  expect(seen)
    .toEqual([{ url: "/todos", state: { scroll: 320 } }]);
  expect(location.url())
    .toBe("/todos/7");
});

test("a listener that stops listening is no longer called", async () => {
  const fake = fakePlatform("/todos");
  const { location } = locationWith(fake.platform);
  let calls = 0;
  const stop = location.onPop(() => {
    calls += 1;
  });
  stop();
  fake.pop("/todos", null);
  await tick();
  expect(calls)
    .toBe(0);
});
test("destroying the injector stops listening to the browser", () => {
  const fake = fakePlatform();
  const { destroy } = locationWith(fake.platform);
  expect(fake.listeners.size)
    .toBe(1);
  destroy();
  expect(fake.listeners.size)
    .toBe(0);
});
