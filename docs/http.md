# HTTP with `@tinker/http`

`HttpClient` sends requests. It hands each request to an `HttpBackend`, which does the
sending: the default is `FetchBackend`, which uses `fetch`. Interceptors will go between
the client and the backend, so a request can be changed on the way out and a response on
the way back. The interceptor API is not built yet.

## The client

`HttpClient` is injected like any service, and every call returns a `Task` from
`@tinker/functional`. Nothing is sent until the task runs, and cancelling it aborts the
request.

```ts
const user = client.get<User>(`/users/${id}`);
user.run({ ok: render, error: showError });
```

- `request(method, url, options?)` sends any verb: `request("PROPFIND", "/files")`. Verbs
  are not a closed list, and they are sent as given.
- `get`, `post`, `put` and `delete` are shorthands for the common verbs.
- `options` are `headers` and `body`. A string or Blob body is sent as it is. Any other
  body is sent as JSON, with `content-type: application/json` unless the request sets one.

A response body is parsed when its content type is JSON, is the text otherwise, and is
`undefined` when it is empty.

## Errors

A status that is not 2xx fails with an `HttpError`, which carries the whole response, so
the caller can read the status and the body. A network failure fails with an `Error`.

## Backends

`HTTP_BACKEND` is the backend `HttpClient` uses. `HTTP_PROVIDERS` provides the defaults:
the client, `FetchBackend` as the backend, and the global `fetch` under `FETCH`.

A test provides a fake backend under `HTTP_BACKEND`, so no request leaves the test:

```ts
const fake: HttpBackend = {
  handle: () => Task.succeed({ status: 200, headers: {}, body: { id: 1 } }),
};
providers: [provide(HTTP_BACKEND, { useValue: fake })];
```

To test `FetchBackend` itself, provide a fake `fetch` under `FETCH`.
