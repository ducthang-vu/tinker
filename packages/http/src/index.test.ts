import { afterEach, describe, expect, test, vi } from "vitest";
import { Injector, runInInjectionContext, inject } from "@tinker/core";
import { FETCH, HTTP_PROVIDERS } from "./index.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HTTP_PROVIDERS", () => {
  test("FETCH defaults to the global fetch", async () => {
    const fetch = vi.fn(async () => new Response("x"));
    vi.stubGlobal("fetch", fetch);
    const { injector } = Injector.create({ providers: [...HTTP_PROVIDERS] });
    const send = runInInjectionContext(injector, () => inject(FETCH));
    await send("/default", { method: "GET" });
    expect(fetch)
      .toHaveBeenCalledWith("/default", { method: "GET" });
  });
});
