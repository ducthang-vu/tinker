// The public entry point for HTTP. A request is a plain object, sent through HTTP_BACKEND:
// the interceptors (HTTP_INTERCEPTORS) run around the send, which is fetch (FETCH) by
// default. A test replaces FETCH, so no request leaves the test.

import { type Provider, provide } from "@tinker/core";
import { FETCH, FetchBackend, HTTP_BACKEND } from "./backend.ts";

export { FETCH, FetchBackend, HTTP_BACKEND, HttpError } from "./backend.ts";
export type { FetchFunction, HttpBackend } from "./backend.ts";
export { HTTP_INTERCEPTORS } from "./interceptors.ts";
export type { HttpInterceptor, HttpOutcome } from "./interceptors.ts";
export type { HttpRequest, HttpResponse, RequestOptions } from "./request.ts";

/** The defaults: FetchBackend as the backend, and the global fetch under FETCH. */
export const HTTP_PROVIDERS: readonly Provider[] = [
  provide(HTTP_BACKEND, { useClass: FetchBackend }),
  provide(FETCH, { useFactory: () => (url, init) => globalThis.fetch(url, init) }),
];
