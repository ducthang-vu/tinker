// The backend: what callers inject to send a request. It runs the interceptors (see
// interceptors.ts) around the transport, and the transport is one instance: native fetch,
// under HTTP_TRANSPORT. A test replaces the transport, and the interceptors still run.

import { inject, Injectable, InjectionToken, type Task } from "@tinker/core";
import { HTTP_INTERCEPTORS, type HttpOutcome } from "./interceptors.ts";
import type { HttpRequest, HttpResponse } from "./request.ts";
import { flatMap, fromPromise, succeed, fail } from "@tinker/functional";

/** The transport: what sends one request. Native fetch is the one instance. */
export type HttpTransport = (url: string, init: RequestInit) => Promise<Response>;

/** The transport, a token so a test can replace it. */
export const HTTP_TRANSPORT = new InjectionToken<HttpTransport>("HTTP_TRANSPORT");

/** A response whose status is not 2xx: the request was sent, and the server refused it. */
export class HttpError extends Error {
  constructor(readonly response: HttpResponse<unknown>) {
    super(`HTTP ${response.status}`);
    this.name = "HttpError";
  }
}

/**
 * The backend every request goes through: the interceptors run in order around the transport.
 * Callers inject HTTP_BACKEND, which is this class.
 */
/** The token callers inject to send a request: the backend, FetchHttpBackend. */
export const HTTP_BACKEND = new InjectionToken<FetchHttpBackend>("HTTP_BACKEND");

@Injectable()
export class FetchHttpBackend {
  private readonly transport = inject(HTTP_TRANSPORT);
  private readonly interceptors = inject(HTTP_INTERCEPTORS);

  /** Send `request` through the interceptors. Cancelling the task aborts the transport. */
  handle(request: HttpRequest): HttpOutcome {
    const chain = this.interceptors.reduceRight<(request: HttpRequest) => HttpOutcome>(
      (next, interceptor) => (current) => interceptor(current, next),
      (current) => this.send(current),
    );
    return chain(request);
  }

  private send(request: HttpRequest): HttpOutcome {
    return flatMap(
      fromPromise(async (signal) => {
        const init = serialize(request);
        const response = await this.transport(request.url, { ...init, signal });
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await readBody(response),
        } satisfies HttpResponse;
      }),
      (response) =>
        response.status >= 200 && response.status < 300
          ? succeed(response)
          : fail(new HttpError(response)),
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
