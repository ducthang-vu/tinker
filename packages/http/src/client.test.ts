import { describe, expect, test, vi } from "vitest";
import { inject, Injector, provide, runInInjectionContext, type Provider, Task } from "@tinker/core";
import { HTTP_BACKEND, type HttpBackend, HttpClient, type HttpRequest, type HttpResponse } from "./index.ts";

/** Run `fn` in an injector with `providers`, and return what it returns. */
function inContext<T>(providers: readonly Provider[], fn: () => T): T {
  const { injector } = Injector.create({ providers });
  return runInInjectionContext(injector, fn);
}

/** A backend that records each request and answers with `body`. */
function fakeBackend(body: unknown = "ok") {
  const sent: HttpRequest[] = [];
  const backend: HttpBackend = {
    handle: (request) => {
      sent.push(request);
      return Task.succeed({ status: 200, headers: {}, body });
    },
  };
  return { sent, providers: [provide(HTTP_BACKEND, { useValue: backend })] };
}

/** Run a task and resolve with its outcome. */
function run<T, E>(task: Task<T, E>): Promise<T> {
  return new Promise((ok, error) => {
    task.run({ ok, error });
  });
}

describe("HttpClient.request", () => {
  test("sends any verb as given, to the URL, and resolves with the body", async () => {
    const { sent, providers } = fakeBackend({ found: true });
    const client = inContext([HttpClient, ...providers], () => inject(HttpClient));
    const body = await run(client.request("PROPFIND", "/files", { headers: { depth: "1" } }));
    expect(sent)
      .toEqual([{ method: "PROPFIND", url: "/files", headers: { depth: "1" } }]);
    expect(body)
      .toEqual({ found: true });
  });

  test("a request is not sent until the task runs", () => {
    const spy = vi.fn();
    const backend: HttpBackend = {
      handle: () => Task.from<HttpResponse, Error>((ok) => {
        spy();
        ok({ status: 200, headers: {}, body: undefined });
      }),
    };
    const client = inContext(
      [HttpClient, provide(HTTP_BACKEND, { useValue: backend })],
      () => inject(HttpClient),
    );
    const task = client.get("/later");
    expect(spy)
      .not.toHaveBeenCalled();
    task.run({});
    expect(spy)
      .toHaveBeenCalledTimes(1);
  });
});

describe("HttpClient shorthands", () => {
  test("get, post, put and delete send their verbs, with the body", async () => {
    const { sent, providers } = fakeBackend();
    const client = inContext([HttpClient, ...providers], () => inject(HttpClient));
    await run(client.get("/a"));
    await run(client.post("/a", { body: { name: "x" } }));
    await run(client.put("/a", { body: "text" }));
    await run(client.delete("/a"));
    expect(sent.map((request) => request.method))
      .toEqual(["GET", "POST", "PUT", "DELETE"]);
    expect(sent[1]!.body)
      .toEqual({ name: "x" });
    expect(sent[2]!.body)
      .toBe("text");
  });
});
