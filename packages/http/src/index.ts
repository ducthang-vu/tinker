// The public entry point for HTTP. A request is a plain object, sent through HTTP_BACKEND:
// interceptors (HTTP_INTERCEPTORS) run around the transport (HTTP_TRANSPORT), which is
// FetchBackend by default. A test provides a fake transport, so no request leaves the test.

import { type Provider, provide } from "@tinker/core";
import { FETCH, FetchBackend, HTTP_TRANSPORT } from "./backend.ts";
import { HTTP_BACKEND, InterceptingBackend } from "./interceptors.ts";

export { FETCH, FetchBackend, HTTP_TRANSPORT, HttpError } from "./backend.ts";
export type { FetchFunction, HttpBackend } from "./backend.ts";
export { HTTP_BACKEND, HTTP_INTERCEPTORS, InterceptingBackend } from "./interceptors.ts";
export type { HttpInterceptor, HttpOutcome } from "./interceptors.ts";
export type { HttpRequest, HttpResponse, RequestOptions } from "./request.ts";

/** The defaults: InterceptingBackend as the entry point, FetchBackend as the transport. */
export const HTTP_PROVIDERS: readonly Provider[] = [
  provide(HTTP_BACKEND, { useClass: InterceptingBackend }),
  provide(HTTP_TRANSPORT, { useClass: FetchBackend }),
  provide(FETCH, { useFactory: () => (url, init) => globalThis.fetch(url, init) }),
];
