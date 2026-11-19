import { describe, expect, test } from "vitest";
import { Injector, provide, runInInjectionContext, signal, type Provider } from "@tinker/core";
import { tick } from "../../core/src/view/internal/test-support.ts";
import { FetchHttpBackend, HTTP_BACKEND, HTTP_TRANSPORT, httpResource, type HttpTransport } from "./index.ts";

/** A transport that answers each call with `respond(url)`, and records the URLs. */
function transportWith(respond: (url: string) => Response) {
  const urls: string[] = [];
  const transport: HttpTransport = async (url) => {
    urls.push(url);
    return respond(url);
  };
  return { urls, transport };
}

/** Create the resources in the context of the backend, with `transport`. */
function inBackend<T>(transport: HttpTransport, create: () => T): T {
  const providers: Provider[] = [
    provide(HTTP_BACKEND, { useClass: FetchHttpBackend }),
    provide(HTTP_TRANSPORT, { useValue: transport }),
  ];
  const { injector } = Injector.create({ providers });
  return runInInjectionContext(injector, create);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("httpResource", () => {
  test("loads the body of the request", async () => {
    const { transport } = transportWith(() => json({ name: "Ada" }));
    const user = inBackend(transport, () =>
      httpResource(() => ({ method: "GET", url: "/user" }), { default: { name: "" } }));
    await tick();
    expect(user.value())
      .toEqual({ name: "Ada" });
    expect(user.state())
      .toBe("fetched");
  });

  test("a signal the request reads sends it again", async () => {
    const { urls, transport } = transportWith((url) => json({ url }));
    const id = signal(1);
    const user = inBackend(transport, () =>
      httpResource(() => ({ method: "GET", url: `/users/${id()}` }), { default: {} }));
    await tick();
    id.set(2);
    await tick();
    expect(urls)
      .toEqual(["/users/1", "/users/2"]);
    expect(user.value())
      .toEqual({ url: "/users/2" });
  });

  test("a status that is not 2xx is the error, and the last success stays", async () => {
    const answers = [json({ ok: true }), json({ error: "gone" }, 404)];
    const { transport } = transportWith(() => answers.shift()!);
    const id = signal(1);
    const res = inBackend(transport, () =>
      httpResource(() => ({ method: "GET", url: `/x/${id()}` }), { default: {} }));
    await tick();
    id.set(2);
    await tick();
    expect(res.state())
      .toBe("failed");
    expect(res.error()?.message)
      .toBe("HTTP 404");
    expect(res.value())
      .toEqual({ ok: true });
  });

  test("a lazy resource sends nothing until it is reloaded", async () => {
    const { urls, transport } = transportWith(() => json({}));
    const res = inBackend(transport, () =>
      httpResource(() => ({ method: "GET", url: "/later" }), { default: {}, lazy: true }));
    await tick();
    expect(urls)
      .toEqual([]);
    expect(res.state())
      .toBe("idle");
    res.reload();
    await tick();
    expect(urls)
      .toEqual(["/later"]);
  });
});

describe("httpResource that skips its request", () => {
  test("a request that is undefined sends nothing, and the state is idle", async () => {
    const { urls, transport } = transportWith(() => json({}));
    const res = inBackend(transport, () =>
      httpResource(() => undefined, { default: { name: "" } }));
    await tick();
    expect(urls)
      .toEqual([]);
    expect(res.state())
      .toBe("idle");
    expect(res.value())
      .toEqual({ name: "" });
  });

  test("a signal that makes the request undefined stops the sending, and keeps the value", async () => {
    const { urls, transport } = transportWith((url) => json({ url }));
    const id = signal<number | undefined>(1);
    const res = inBackend(transport, () =>
      httpResource(() => (id() === undefined ? undefined : { method: "GET", url: `/users/${id()}` }), { default: {} }));
    await tick();
    id.set(undefined);
    await tick();
    expect(urls)
      .toEqual(["/users/1"]);
    expect(res.state())
      .toBe("idle");
    expect(res.value())
      .toEqual({ url: "/users/1" });
  });
});
