import { describe, expect, test } from "vitest";
import { Injector, runInInjectionContext } from "@tinker/core";
import { run as runTask, type Task } from "@tinker/functional";
import { HTTP_TRANSPORT, FetchHttpBackend, HttpError, type HttpTransport, type HttpRequest } from "./index.ts";

/** A fetch that answers with `response` and records each call. */
function fakeFetch(response: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: HttpTransport = async (url, init) => {
    calls.push({ url, init });
    return response();
  };
  return { calls, fetch };
}

/** A FetchHttpBackend with `fetch` provided under HTTP_TRANSPORT. */
function backendWith(fetch: HttpTransport): FetchHttpBackend {
  const { injector } = Injector.create({
    providers: [FetchHttpBackend, { provide: HTTP_TRANSPORT, useValue: fetch }] as never,
  });
  return runInInjectionContext(injector, () => new FetchHttpBackend());
}

function run<T, E>(task: Task<T, E>): Promise<T> {
  return new Promise((ok, error) => {
    runTask(task, { ok, error });
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("FetchHttpBackend responses", () => {
  test("a JSON response is parsed, with its status and headers", async () => {
    const { fetch } = fakeFetch(() => json({ id: 1 }));
    const response = await run(backendWith(fetch)
      .handle({ method: "GET", url: "/x" }));
    expect(response.status)
      .toBe(200);
    expect(response.body)
      .toEqual({ id: 1 });
    expect(response.headers["content-type"])
      .toBe("application/json");
  });

  test("a text response is its text, and an empty one is undefined", async () => {
    const text = fakeFetch(() => new Response("hello", { status: 200 }));
    expect((await run(backendWith(text.fetch)
      .handle({ method: "GET", url: "/t" }))).body)
      .toBe("hello");
    const empty = fakeFetch(() => new Response("", { status: 200 }));
    expect((await run(backendWith(empty.fetch)
      .handle({ method: "GET", url: "/e" }))).body)
      .toBeUndefined();
  });

  test("a status that is not 2xx fails with an HttpError carrying the response", async () => {
    const { fetch } = fakeFetch(() => json({ error: "gone" }, 404));
    const error = await run(backendWith(fetch)
      .handle({ method: "GET", url: "/g" }))
      .then(() => undefined, (failure: unknown) => failure);
    expect(error)
      .toBeInstanceOf(HttpError);
    expect((error as HttpError).response.status)
      .toBe(404);
    expect((error as HttpError).response.body)
      .toEqual({ error: "gone" });
  });

  test("a network failure fails with an Error", async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new Error("offline")));
    await expect(run(backendWith(fetch)
      .handle({ method: "GET", url: "/n" })))
      .rejects.toThrow("offline");
  });
});

describe("FetchHttpBackend bodies and headers", () => {
  test("a content type the author gives for an object body is kept, whatever its case", async () => {
    const { calls, fetch } = fakeFetch(() => json({}));
    await run(backendWith(fetch)
      .handle({
        method: "POST",
        url: "/k",
        headers: { "CONTENT-TYPE": "application/x-custom" },
        body: { a: 1 },
      }));
    expect(calls[0]!.init.headers)
      .toEqual({ "CONTENT-TYPE": "application/x-custom" });
  });

  test("a body without a content type is read as text", async () => {
    const bytes = fakeFetch(() => new Response(new Uint8Array([104, 105]), { status: 200 }));
    expect((await run(backendWith(bytes.fetch)
      .handle({ method: "GET", url: "/b" }))).body)
      .toBe("hi");
  });
});

describe("FetchHttpBackend requests", () => {
  test("an object body is sent as JSON, with the JSON content type", async () => {
    const { calls, fetch } = fakeFetch(() => json({}));
    const request: HttpRequest = { method: "POST", url: "/p", body: { a: 1 } };
    await run(backendWith(fetch)
      .handle(request));
    expect(calls[0]!.init.body)
      .toBe(JSON.stringify({ a: 1 }));
    expect(calls[0]!.init.headers)
      .toEqual({ "content-type": "application/json" });
  });

  test("a content type the author gives is kept, and a string body is sent as it is", async () => {
    const { calls, fetch } = fakeFetch(() => json({}));
    await run(backendWith(fetch)
      .handle({
        method: "PUT",
        url: "/s",
        headers: { "Content-Type": "text/plain" },
        body: "raw",
      }));
    expect(calls[0]!.init.body)
      .toBe("raw");
    expect(calls[0]!.init.headers)
      .toEqual({ "Content-Type": "text/plain" });
  });

  test("the verb is sent as given, and a request without a body has none", async () => {
    const { calls, fetch } = fakeFetch(() => json({}));
    await run(backendWith(fetch)
      .handle({ method: "PROPFIND", url: "/v" }));
    expect(calls[0]!.init.method)
      .toBe("PROPFIND");
    expect(calls[0]!.init.body)
      .toBeUndefined();
  });

  test("cancelling the task aborts the request", () => {
    const { calls, fetch } = fakeFetch(() => new Promise<Response>(() => {}));
    const cancel = runTask(backendWith(fetch)
      .handle({ method: "GET", url: "/c" }), {});
    cancel();
    expect(calls[0]!.init.signal?.aborted)
      .toBe(true);
  });
});
