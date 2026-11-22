// The public entry point for HTTP. Callers inject HTTP_BACKEND, which runs the interceptors
// (HTTP_INTERCEPTORS) around the transport (HTTP_TRANSPORT: native fetch). A test replaces the
// transport, so no request leaves the test.

import { type Provider, provide } from "@tinker/core";
import { FetchHttpBackend, HTTP_BACKEND, HTTP_TRANSPORT } from "./lib/backend/backend.ts";

export { FetchHttpBackend, HTTP_BACKEND, HTTP_TRANSPORT, HttpError } from "./lib/backend/backend.ts";
export type { HttpTransport } from "./lib/backend/backend.ts";
export { HTTP_INTERCEPTORS } from "./lib/backend/interceptors.ts";
export { httpResource } from "./lib/resource/resource.ts";
export type { HttpResourceOptions } from "./lib/resource/resource.ts";
export { httpDelete, httpPatch, httpPost, httpPut } from "./lib/resource/mutation.ts";
export type { HttpMutationOptions, HttpUrl } from "./lib/resource/mutation.ts";
export type { HttpInterceptor, HttpOutcome } from "./lib/backend/interceptors.ts";
export type { HttpRequest, HttpResponse, RequestOptions } from "./lib/backend/request.ts";

/** The defaults: the backend, and native fetch as the transport. */
export const HTTP_PROVIDERS: readonly Provider[] = [
  provide(HTTP_BACKEND, { useClass: FetchHttpBackend }),
  provide(HTTP_TRANSPORT, { useValue: (url, init) => globalThis.fetch(url, init) }),
];
