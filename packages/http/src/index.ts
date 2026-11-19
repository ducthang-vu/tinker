// The public entry point for HTTP: HttpClient sends requests through an HttpBackend.
// HTTP_PROVIDERS provides the defaults (FetchBackend, using fetch); a test provides a fake
// backend under HTTP_BACKEND instead.

import { type Provider, provide } from "@tinker/core";
import { FETCH, FetchBackend, HTTP_BACKEND } from "./backend.ts";
import { HttpClient } from "./client.ts";

export { FETCH, FetchBackend, HTTP_BACKEND, HttpError } from "./backend.ts";
export type { FetchFunction, HttpBackend } from "./backend.ts";
export { HttpClient } from "./client.ts";
export type { HttpRequest, HttpResponse, RequestOptions } from "./request.ts";

/** The defaults: HttpClient, FetchBackend as the backend, and the global fetch. */
export const HTTP_PROVIDERS: readonly Provider[] = [
  HttpClient,
  provide(HTTP_BACKEND, { useClass: FetchBackend }),
  provide(FETCH, { useFactory: () => (url, init) => globalThis.fetch(url, init) }),
];
