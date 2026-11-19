import { describe, expect, test, vi } from "vitest";
import { Injector, provide, runInInjectionContext, inject, Task, type Provider } from "@tinker/core";
import {
  HTTP_BACKEND,
  HTTP_INTERCEPTORS,
  HTTP_TRANSPORT,
  HttpError,
  InterceptingBackend,
  type HttpBackend,
  type HttpInterceptor,
  type HttpRequest,
  type HttpResponse,
} from "./index.ts";

/** A transport that records each request it sends, and answers with `body`. */
function fakeTransport(body: unknown = "ok") {
  const sent: HttpRequest[] = [];
  const transport: HttpBackend = {
    handle: (request) => {
      sent.push(request);
      return Task.succeed({ status: 200, headers: {}, body });
    },
  };
  return { sent, transport };
}

/** The entry point, with `interceptors` and `transport`. */
function entryWith(transport: HttpBackend, interceptors: readonly HttpInterceptor[]): HttpBackend {
  const providers: Provider[] = [
    provide(HTTP_BACKEND, { useClass: InterceptingBackend }),
    provide(HTTP_TRANSPORT, { useValue: transport }),
    ...interceptors.map((interceptor) => provide(HTTP_INTERCEPTORS, { useValue: interceptor })),
  ];
  const { injector } = Injector.create({ providers });
  return runInInjectionContext(injector, () => inject(HTTP_BACKEND));
}

/** Run a task and resolve with its outcome. */
function run<T, E>(task: Task<T, E>): Promise<T> {
  return new Promise((ok, error) => {
    task.run({ ok, error });
  });
}

describe("the entry point", () => {
  test("with no interceptors, a request goes straight to the transport", async () => {
    const { sent, transport } = fakeTransport({ id: 1 });
    const response = await run(entryWith(transport, [])
      .handle({ method: "GET", url: "/a" }));
    expect(sent)
      .toEqual([{ method: "GET", url: "/a" }]);
    expect(response.body)
      .toEqual({ id: 1 });
  });

  test("interceptors run outermost first, around the transport, on the way out and back", async () => {
    const { transport } = fakeTransport();
    const log: string[] = [];
    const outer: HttpInterceptor = (request, next) => {
      log.push("outer in");
      return Task.map(next(request), (response) => {
        log.push("outer out");
        return response;
      });
    };
    const inner: HttpInterceptor = (request, next) => {
      log.push("inner in");
      return Task.map(next(request), (response) => {
        log.push("inner out");
        return response;
      });
    };
    const transportSpy = vi.spyOn(transport, "handle");
    transportSpy.mockImplementation((request) => {
      log.push("transport");
      return Task.succeed({ status: 200, headers: {}, body: request.url });
    });
    await run(entryWith(transport, [outer, inner])
      .handle({ method: "GET", url: "/o" }));
    expect(log)
      .toEqual(["outer in", "inner in", "transport", "inner out", "outer out"]);
  });

  test("an interceptor can change the request before it is sent", async () => {
    const { sent, transport } = fakeTransport();
    const auth: HttpInterceptor = (request, next) =>
      next({ ...request, headers: { ...request.headers, authorization: "token" } });
    await run(entryWith(transport, [auth])
      .handle({ method: "POST", url: "/p", body: 1 }));
    expect(sent[0]!.headers)
      .toEqual({ authorization: "token" });
  });

  test("an interceptor can change the response it gets back", async () => {
    const { transport } = fakeTransport({ raw: 1 });
    const unwrap: HttpInterceptor = (request, next) =>
      Task.map(next(request), (response: HttpResponse) => ({
        ...response,
        body: (response.body as { raw: number }).raw,
      }));
    const response = await run(entryWith(transport, [unwrap])
      .handle({ method: "GET", url: "/u" }));
    expect(response.body)
      .toBe(1);
  });

  test("an interceptor can answer without calling next: the transport is not called", async () => {
    const { sent, transport } = fakeTransport();
    const cached: HttpInterceptor = () =>
      Task.succeed({ status: 200, headers: {}, body: "from cache" });
    const response = await run(entryWith(transport, [cached])
      .handle({ method: "GET", url: "/c" }));
    expect(sent)
      .toEqual([]);
    expect(response.body)
      .toBe("from cache");
  });

  test("a failure of the transport reaches the caller, through the interceptors", async () => {
    const transport: HttpBackend = {
      handle: () => Task.fail(new HttpError({ status: 500, headers: {}, body: "down" })),
    };
    const passing: HttpInterceptor = (request, next) => next(request);
    await expect(run(entryWith(transport, [passing])
      .handle({ method: "GET", url: "/f" })))
      .rejects.toBeInstanceOf(HttpError);
  });
});
