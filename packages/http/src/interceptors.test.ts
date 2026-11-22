import { describe, expect, test } from "vitest";
import { Injector, inject, provide, runInInjectionContext, type Task, type Provider } from "@tinker/core";
import { map, succeed, run as runTask } from "@tinker/functional";
import {
  HTTP_TRANSPORT,
  FetchHttpBackend,
  HTTP_BACKEND,
  HTTP_INTERCEPTORS,
  HttpError,
  type HttpTransport,

  type HttpInterceptor,
  type HttpResponse,
} from "./index.ts";

/** A fetch that answers with `body` as JSON, and records each call. */
function fakeFetch(body: unknown = "ok", status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: HttpTransport = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetch };
}

/** The backend, with `interceptors` and `fetch`. */
function backendWith(
  fetch: HttpTransport,
  interceptors: readonly HttpInterceptor[],
): FetchHttpBackend {
  const providers: Provider[] = [
    provide(HTTP_BACKEND, { useClass: FetchHttpBackend }),
    provide(HTTP_TRANSPORT, { useValue: fetch }),
    ...interceptors.map((interceptor) => provide(HTTP_INTERCEPTORS, { useValue: interceptor })),
  ];
  const { injector } = Injector.create({ providers });
  return runInInjectionContext(injector, () => inject(HTTP_BACKEND));
}

/** Run a task and resolve with its outcome. */
function run<T, E>(task: Task<T, E>): Promise<T> {
  return new Promise((ok, error) => {
    runTask(task, { ok, error });
  });
}

describe("the backend's interceptors", () => {
  test("with no interceptors, a request is sent with fetch and its body is parsed", async () => {
    const { calls, fetch } = fakeFetch({ id: 1 });
    const response = await run(backendWith(fetch, [])
      .handle({ method: "GET", url: "/a" }));
    expect(calls[0]!.url)
      .toBe("/a");
    expect(calls[0]!.init.method)
      .toBe("GET");
    expect(response.body)
      .toEqual({ id: 1 });
  });

  test("interceptors run outermost first, around the send, on the way out and back", async () => {
    const log: string[] = [];
    const logged = (name: string): HttpInterceptor => (request, next) => {
      log.push(`${name} in`);
      return map(next(request), (response) => {
        log.push(`${name} out`);
        return response;
      });
    };
    const { fetch } = fakeFetch();
    const sending = async (url: string, init: RequestInit) => {
      log.push("send");
      return fetch(url, init);
    };
    const backend = backendWith(sending, [logged("outer"), logged("inner")]);
    await run(backend.handle({ method: "GET", url: "/o" }));
    expect(log)
      .toEqual(["outer in", "inner in", "send", "inner out", "outer out"]);
  });

  test("an interceptor can change the request before it is sent", async () => {
    const { calls, fetch } = fakeFetch();
    const auth: HttpInterceptor = (request, next) =>
      next({ ...request, headers: { ...request.headers, authorization: "token" } });
    await run(backendWith(fetch, [auth])
      .handle({ method: "POST", url: "/p", body: 1 }));
    expect(calls[0]!.init.headers)
      .toEqual({ "authorization": "token", "content-type": "application/json" });
  });

  test("an interceptor can change the response it gets back", async () => {
    const { fetch } = fakeFetch({ raw: 1 });
    const unwrap: HttpInterceptor = (request, next) =>
      map(next(request), (response: HttpResponse) => ({
        ...response,
        body: (response.body as { raw: number }).raw,
      }));
    const response = await run(backendWith(fetch, [unwrap])
      .handle({ method: "GET", url: "/u" }));
    expect(response.body)
      .toBe(1);
  });

  test("an interceptor can answer without calling next: fetch is not called", async () => {
    const { calls, fetch } = fakeFetch();
    const cached: HttpInterceptor = () =>
      succeed({ status: 200, headers: {}, body: "from cache" });
    const response = await run(backendWith(fetch, [cached])
      .handle({ method: "GET", url: "/c" }));
    expect(calls)
      .toEqual([]);
    expect(response.body)
      .toBe("from cache");
  });

  test("a status that is not 2xx reaches the caller, through the interceptors, as an HttpError", async () => {
    const { fetch } = fakeFetch({ error: "down" }, 500);
    const passing: HttpInterceptor = (request, next) => next(request);
    await expect(run(backendWith(fetch, [passing])
      .handle({ method: "GET", url: "/f" })))
      .rejects.toBeInstanceOf(HttpError);
  });
});
