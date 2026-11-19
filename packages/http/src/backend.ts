// The transport is what actually sends a request. Every request goes through HTTP_BACKEND
// (see interceptors.ts), which runs the interceptors and then the transport. The default
// transport is FetchBackend, which uses fetch; a test provides a fake one under
// HTTP_TRANSPORT, so no request leaves the test.

import { InjectionToken, Injectable, inject } from "@tinker/core";
import { Task } from "@tinker/core";
import type { HttpRequest, HttpResponse } from "./request.ts";

/** Sends a request. A task that fails with an HttpError for a status that is not 2xx. */
export interface HttpBackend {
  handle(request: HttpRequest): Task<HttpResponse, HttpError | Error>;
}

/** What actually sends a request: FetchBackend by default. */
export const HTTP_TRANSPORT = new InjectionToken<HttpBackend>("HTTP_TRANSPORT");

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

/** The default transport: the request is sent with fetch, and cancelling aborts it. */
@Injectable()
export class FetchBackend implements HttpBackend {
  private readonly fetch = inject(FETCH);

  handle(request: HttpRequest): Task<HttpResponse, HttpError | Error> {
    const sent = Task.fromPromise(async (signal) => {
      const init = serialize(request);
      const response = await this.fetch(request.url, { ...init, signal });
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await readBody(response),
      } satisfies HttpResponse;
    });
    return Task.flatMap(sent, (response) =>
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
