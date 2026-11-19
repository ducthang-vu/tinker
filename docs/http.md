# HTTP with `@tinker/http`

Every request goes through one entry point, `HTTP_BACKEND`. It runs the interceptors,
outermost first, around the transport, which sends the request. The default transport is
`FetchBackend`, which uses `fetch`.

## Sending a request

A request is a plain object, and the entry point returns a `Task` from `@tinker/functional`.
Nothing is sent until the task runs, and cancelling it aborts the request.

```ts
const backend = inject(HTTP_BACKEND);
const outcome = backend.handle({ method: "GET", url: `/users/${id}` });
outcome.run({
  ok: (response) => render(response.body),
  error: (failure) => showError(failure),
});
```

- `method` is any verb, sent as given: `"PROPFIND"` is as good as `"GET"`. HTTP methods are
  case-sensitive and open.
- `headers` and `body` are optional. A string or Blob body is sent as it is. Any other body
  is sent as JSON, with `content-type: application/json` unless the request sets one.
- A response has its `status`, its `headers`, and its `body`. The body is parsed when its
  content type is JSON, is the text otherwise, and is `undefined` when it is empty.
- A status that is not 2xx fails with an `HttpError`, which carries the whole response. A
  network failure fails with an `Error`.

## Interceptors

An interceptor gets the request and `next`, which sends the request on, and returns the
outcome. It can change the request before `next`, change the response after it, or answer
without calling `next`.

```ts
const auth: HttpInterceptor = (request, next) =>
  next({ ...request, headers: { ...request.headers, authorization: token() } });
```

Interceptors are provided under `HTTP_INTERCEPTORS`, a multi-token, outermost first:

```ts
providers: [provide(HTTP_INTERCEPTORS, { useValue: auth })];
```

## Testing

`HTTP_TRANSPORT` is what sends. A test provides a fake transport, so no request leaves the
test, and the interceptors still run in front of it:

```ts
const fake: HttpBackend = {
  handle: () => Task.succeed({ status: 200, headers: {}, body: { id: 1 } }),
};
providers: [provide(HTTP_TRANSPORT, { useValue: fake })];
```

To test `FetchBackend` itself, provide a fake `fetch` under `FETCH`.

## What is not built yet

Resources (a read as signals) and mutations (a write as signals) will call the entry point,
so they go through the interceptors too. They are not built yet.
