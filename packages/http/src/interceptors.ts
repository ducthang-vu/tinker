// Interceptors: what happens to every request on its way out and back. An interceptor gets
// the request and `next`, which sends the request on, and returns the outcome. It can change
// the request before `next`, change the response after it, or answer without calling `next`.
//
//   const auth: HttpInterceptor = (request, next) =>
//     next({ ...request, headers: { ...request.headers, authorization: token() } });
//
// HTTP_BACKEND is the one entry point: it runs the interceptors, outermost first, around the
// transport. Every request goes through it, so an interceptor sees all of them.

import { inject, Injectable, InjectionToken, Task } from "@tinker/core";
import { HTTP_TRANSPORT, type HttpBackend, type HttpError } from "./backend.ts";
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

/**
 * The entry point: every request is sent through it. HTTP_PROVIDERS provides
 * InterceptingBackend.
 */
export const HTTP_BACKEND = new InjectionToken<HttpBackend>("HTTP_BACKEND");

/** The backend every request goes through: the interceptors around the transport. */
@Injectable()
export class InterceptingBackend implements HttpBackend {
  private readonly transport = inject(HTTP_TRANSPORT);
  private readonly interceptors = inject(HTTP_INTERCEPTORS);

  handle(request: HttpRequest): HttpOutcome {
    const send = this.interceptors.reduceRight<(request: HttpRequest) => HttpOutcome>(
      (next, interceptor) => (current) => interceptor(current, next),
      (current) => this.transport.handle(current),
    );
    return send(request);
  }
}
