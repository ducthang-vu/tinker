// HttpClient: the one way to send requests. `request` takes any verb, since verbs can
// be added at will; `get`, `post`, `put` and `delete` are shorthands for the common ones.
// Every call returns a task: nothing is sent until it is run, and cancelling it aborts
// the request.

import { Injectable, inject, Task } from "@tinker/core";
import { HTTP_BACKEND } from "./backend.ts";
import type { HttpError } from "./backend.ts";
import type { RequestOptions } from "./request.ts";

@Injectable()
export class HttpClient {
  private readonly backend = inject(HTTP_BACKEND);

  /** Send a request with `method` (any verb) to `url`, and resolve with the body. */
  request<T = unknown>(
    method: string,
    url: string,
    options: RequestOptions = {},
  ): Task<T, HttpError | Error> {
    return Task.map(this.backend.handle({ ...options, method, url }),
      (response) => response.body as T);
  }

  get<T = unknown>(url: string, options?: RequestOptions): Task<T, HttpError | Error> {
    return this.request<T>("GET", url, options);
  }

  post<T = unknown>(url: string, options?: RequestOptions): Task<T, HttpError | Error> {
    return this.request<T>("POST", url, options);
  }

  put<T = unknown>(url: string, options?: RequestOptions): Task<T, HttpError | Error> {
    return this.request<T>("PUT", url, options);
  }

  delete<T = unknown>(url: string, options?: RequestOptions): Task<T, HttpError | Error> {
    return this.request<T>("DELETE", url, options);
  }
}
