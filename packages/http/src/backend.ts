// The backend: one entry point for every request. It runs the interceptors (see
// interceptors.ts) around the send, and the send is fetch. A test replaces FETCH, the one
// function that touches the network, so the interceptors still run in the test.

import { inject, Injectable, InjectionToken, Task } from "@tinker/core";
import { HTTP_INTERCEPTORS, type HttpOutcome } from "./interceptors.ts";
import type { HttpRequest, HttpResponse } from "./request.ts";

/** Handles a request: runs it through the interceptors, and sends it. */
export interface HttpBackend {
  handle(request: HttpRequest): HttpOutcome;
}

/** The backend every request goes through. HTTP_PROVIDERS provides FetchBackend. */
export const HTTP_BACKEND = new InjectionToken<HttpBackend>("HTTP_BACKEND");

/** The fetch function FetchBackend calls. The default is the global fetch. */
export type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

/** The fetch function, a token so a test can replace it. */
export const FETCH = new InjectionToken<FetchFunction>("FETCH");

/** A response whose status is not 2xx: the request was sent, and the server refused it. */
export class HttpError extends Error {
  constructor(readonly response: HttpResponse<unknown>) {
    super(`HTTP ${response.status}`);
    this.name = "HttpError";
  }
}

/** The backend: the interceptors run in order around the send, which uses fetch. */
@Injectable()
export class FetchBackend implements HttpBackend {
  private readonly fetch = inject(FETCH);
  private readonly interceptors = inject(HTTP_INTERCEPTORS);

  handle(request: HttpRequest): HttpOutcome {
    const chain = this.interceptors.reduceRight<(request: HttpRequest) => HttpOutcome>(
      (next, interceptor) => (current) => interceptor(current, next),
      (current) => this.send(current),
    );
    return chain(request);
  }

  /** Sends the request with fetch: cancelling the task aborts it. */
  private send(request: HttpRequest): HttpOutcome {
    return Task.flatMap(
      Task.fromPromise(async (signal) => {
        const init = serialize(request);
        const response = await this.fetch(request.url, { ...init, signal });
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await readBody(response),
        } satisfies HttpResponse;
      }),
      (response) =>
        response.status >= 200 && response.status < 300
          ? Task.succeed(response)
          : Task.fail(new HttpError(response)),
    );
  }
}

/** The RequestInit for a request: its verb, headers and body, as fetch takes them. */
function serialize(request: HttpRequest): RequestInit {
  const headers: Record<string, string> = { ...request.headers };
  const { body } = request;
  if (body === undefined) {
    return { method: request.method, headers };
  }
  if (typeof body === "string" || body instanceof Blob) {
    return { method: request.method, headers, body };
  }
  if (!hasHeader(headers, "content-type")) {
    headers["content-type"] = "application/json";
  }
  return { method: request.method, headers, body: JSON.stringify(body) };
}

/** Whether `headers` has `name`, whatever the case of the name. */
function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
  return Object.keys(headers)
    .some((key) => key.toLowerCase() === name);
}

/** The body of a response: parsed when it is JSON, the text otherwise, undefined when empty. */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") {
    return undefined;
  }
  const type = response.headers.get("content-type") ?? "";
  return type.includes("application/json") ? JSON.parse(text) : text;
}
