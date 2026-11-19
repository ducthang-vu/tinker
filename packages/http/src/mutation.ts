// HTTP mutations: one factory per verb. Each makes a `mutation` whose mutator sends a request
// through HTTP_BACKEND, so the interceptors apply. The input of a call is the body (POST, PUT,
// PATCH) or only used for the URL (DELETE). The result is the body of the response.

import { inject, Task, type Mutation, type MutationOptions, mutation } from "@tinker/core";
import { HTTP_BACKEND, type HttpError } from "./backend.ts";

/**
 * The URL of a call: fixed, or built from the input of the call. When the function returns
 * `undefined`, the call is not sent.
 */
export type HttpUrl<I> = string | ((input: I) => string | undefined);

export interface HttpMutationOptions<T, U> extends MutationOptions<T, U> {
  /** Headers sent with every call of the mutation. */
  readonly headers?: Readonly<Record<string, string>>;
}

/** POST: the input is the JSON body. */
export function httpPost<I, T = unknown, U = unknown>(
  url: HttpUrl<I>,
  options: HttpMutationOptions<T, U> = {},
): Mutation<I, T, HttpError | Error> {
  return httpMutation<I, T, U>("POST", url, (input) => input, options);
}

/** PUT: the input is the JSON body. */
export function httpPut<I, T = unknown, U = unknown>(
  url: HttpUrl<I>,
  options: HttpMutationOptions<T, U> = {},
): Mutation<I, T, HttpError | Error> {
  return httpMutation<I, T, U>("PUT", url, (input) => input, options);
}

/** PATCH: the input is the JSON body. */
export function httpPatch<I, T = unknown, U = unknown>(
  url: HttpUrl<I>,
  options: HttpMutationOptions<T, U> = {},
): Mutation<I, T, HttpError | Error> {
  return httpMutation<I, T, U>("PATCH", url, (input) => input, options);
}

/** DELETE: no body; the input is only used to build the URL. */
export function httpDelete<I, T = unknown, U = unknown>(
  url: HttpUrl<I>,
  options: HttpMutationOptions<T, U> = {},
): Mutation<I, T, HttpError | Error> {
  return httpMutation<I, T, U>("DELETE", url, () => undefined, options);
}

/**
 * The shared shape of the verbs. Call it where the injector is available, since it takes
 * HTTP_BACKEND from there.
 */
function httpMutation<I, T, U>(
  method: string,
  url: HttpUrl<I>,
  bodyOf: (input: I) => unknown,
  options: HttpMutationOptions<T, U>,
): Mutation<I, T, HttpError | Error> {
  const backend = inject(HTTP_BACKEND);
  const { headers, ...mutationOptions } = options;
  return mutation<I, T, HttpError | Error, U>(
    (input) => {
      const target = typeof url === "string" ? url : url(input);
      if (target === undefined) {
        return undefined;
      }
      return Task.map(
        backend.handle({
          method,
          url: target,
          ...(headers && { headers }),
          body: bodyOf(input),
        }),
        (response) => response.body as T,
      );
    },
    mutationOptions,
  );
}
