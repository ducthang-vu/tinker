// Interceptors: what happens to every request on its way out and back. An interceptor gets
// the request and `next`, which sends the request on, and returns the outcome. It can change
// the request before `next`, change the response after it, or answer without calling `next`.
//
//   const auth: HttpInterceptor = (request, next) =>
//     next({ ...request, headers: { ...request.headers, authorization: token() } });
//
// FetchHttpBackend runs the interceptors, outermost first, around the send. Every request goes
// through it, so an interceptor sees all of them.

import { InjectionToken, Task } from "@tinker/core";
import type { HttpError } from "./backend.ts";
import type { HttpRequest, HttpResponse } from "./request.ts";

/** What a request ends with: a response, or a failure. */
export type HttpOutcome = Task<HttpResponse, HttpError | Error>;

/** An interceptor. `next` sends the request on, and returns its outcome. */
export type HttpInterceptor = (
  request: HttpRequest,
  next: (request: HttpRequest) => HttpOutcome,
) => HttpOutcome;

/** The interceptors, outermost first, in the order their providers give them. */
export const HTTP_INTERCEPTORS = InjectionToken.multi<HttpInterceptor>("HTTP_INTERCEPTORS");
