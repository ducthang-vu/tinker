// httpResource: a resource whose loader is a request. The request function is read by the
// loader, so a signal it reads sends the request again, and the request in progress is
// cancelled, which aborts it. The value is the response body; a failure is in `error`.

import { inject, type Resource, resource, type Task } from "@tinker/core";
import { HTTP_BACKEND, type HttpError } from "./backend.ts";
import type { HttpRequest } from "./request.ts";
import { map } from "@tinker/functional/v1";

export interface HttpResourceOptions<T> {
  /** The value before the first successful response. */
  readonly default: T;
  /** Whether the request waits for the first `reload()` instead of running at creation. */
  readonly lazy?: boolean;
}

/**
 * A resource of the body of a request. Call it where the injector is available (a field of a
 * component, or a service), since it takes HTTP_BACKEND from there. When `request` returns
 * `undefined`, nothing is sent: the value is kept and the state is "idle".
 */
export function httpResource<T = unknown>(
  request: () => HttpRequest | undefined,
  options: HttpResourceOptions<T>,
): Resource<T, HttpError | Error> {
  const backend = inject(HTTP_BACKEND);
  return resource<T, HttpError | Error>(
    () => {
      const current = request();
      return current === undefined
        ? undefined
        : map(backend.handle(current), (response) => response.body as T);
    },
    options,
  );
}
