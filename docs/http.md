# HTTP with `@tinker/http`

Every request goes through `HTTP_BACKEND`, which is `FetchHttpBackend`. It runs the
interceptors, outermost first, around the send, which is `fetch`.

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

`HTTP_TRANSPORT` is the one instance that touches the network: native `fetch`. A test provides a fake `fetch`, so no
request leaves the test, and the interceptors still run in front of it:

```ts
const fakeTransport: HttpTransport = async () =>
  new Response(JSON.stringify({ id: 1 }), { headers: { "content-type": "application/json" } });
providers: [provide(HTTP_TRANSPORT, { useValue: fakeTransport })];
```


## Resources

`httpResource(request, { default })` is a resource whose loader is a request. The request is
a function, so a signal it reads sends the request again. Its value is the response body, and
a failure is in `error`. See [`resource.md`](resource.md) for the state, `set`, and `reload`.

```ts
const user = httpResource(() => ({ method: "GET", url: `/users/${id()}` }), { default: emptyUser });
```

When the request function returns `undefined`, nothing is sent: the value is kept and the state is
`"idle"`. This is how a request waits for its inputs, e.g. `() => id() === undefined ? undefined : …`.

## Mutations

There is one factory per verb: `httpPost`, `httpPut`, `httpPatch` and `httpDelete`. Each returns
a `mutation` (see [`resource.md`](resource.md)) whose calls go through `HTTP_BACKEND`, so the
interceptors apply. The input of a call is the JSON body for POST, PUT and PATCH. DELETE sends no
body, and its input only builds the URL.

```ts
const create = httpPost<NewTodo, Todo, Todo[]>("/todos", {
  resource: todos,
  onSuccess: (current, made) => [...current, made],
});
create.mutate({ title: "write docs" });

const remove = httpDelete<number>((id) => `/todos/${id}`, { resource: todos });
remove.mutate(todo.id);
```

- **The URL** is a string, or a function of the input.
- **`headers`** are sent with every call of the mutation.
- **The result** is the response body. A status that is not 2xx is the error, and it leaves the
  resource alone.
- **The options** are the mutation's: `resource`, `onSuccess`. Calls run in parallel, as they do
  for any mutation.

The verbs are separate functions because each one has a different body rule. A verb that is not
listed is not built in yet.
