import { describe, expect, test } from "vitest";
import { Injector, provide, runInInjectionContext, resource, type Task, type Provider } from "@tinker/core";
import { tick } from "../../../../core/src/view/internal/test-support.ts";
import { succeed } from "@tinker/functional";
import {
  FetchHttpBackend,
  HTTP_BACKEND,
  HTTP_TRANSPORT,
  httpDelete,
  httpPatch,
  httpPost,
  httpPut,
  type HttpTransport,
} from "../../index.ts";

/** A transport that answers each call with `respond`, and records the requests it got. */
type Sent = { url: string; init: RequestInit };

function transportWith(respond: () => Response) {
  const sent: Sent[] = [];
  const transport: HttpTransport = async (url, init) => {
    sent.push({ url, init });
    return respond();
  };
  return { sent, transport };
}

/** The first request the transport got. */
function first(sent: readonly Sent[]): Sent {
  return sent[0] as Sent;
}

/** Create the mutations in the context of the backend, with `transport`. */
function inBackend<T>(transport: HttpTransport, create: () => T): T {
  const providers: Provider[] = [
    provide(HTTP_BACKEND, { useClass: FetchHttpBackend }),
    provide(HTTP_TRANSPORT, { useValue: transport }),
  ];
  const { injector } = Injector.create({ providers });
  return runInInjectionContext(injector, create);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("httpPost", () => {
  test("sends the input as a JSON body and gives the response body", async () => {
    const { sent, transport } = transportWith(() => json({ id: 7 }));
    const create = inBackend(transport, () => httpPost<{ title: string }, { id: number }>("/todos"));
    create.mutate({ title: "write" });
    await tick();
    expect(first(sent).url)
      .toBe("/todos");
    expect(first(sent).init.method)
      .toBe("POST");
    expect(first(sent).init.body)
      .toBe(JSON.stringify({ title: "write" }));
    expect(create.result())
      .toEqual({ id: 7 });
    expect(create.outcome())
      .toBe("succeeded");
  });

  test("builds the URL from the input, and sends the headers", async () => {
    const { sent, transport } = transportWith(() => json({}));
    const save = inBackend(transport, () =>
      httpPost<{ id: number }>((input) => `/todos/${input.id}`, { headers: { "x-team": "core" } }));
    save.mutate({ id: 3 });
    await tick();
    expect(first(sent).url)
      .toBe("/todos/3");
    expect(first(sent).init.headers)
      .toEqual({ "x-team": "core", "content-type": "application/json" });
  });

  test("a status that is not 2xx is the error", async () => {
    const { transport } = transportWith(() => json({ error: "invalid" }, 422));
    const create = inBackend(transport, () => httpPost<{}>("/todos"));
    create.mutate({});
    await tick();
    expect(create.outcome())
      .toBe("failed");
    expect(create.error()?.message)
      .toBe("HTTP 422");
  });

  test("a success updates the resource through onSuccess", async () => {
    const { transport } = transportWith(() => json({ id: 9 }));
    const { list, create } = inBackend(transport, () => {
      const list = resource<number[], Error>(() => succeed([1]), { default: [], lazy: true });
      list.reload();
      const create = httpPost<{}, { id: number }, number[]>("/todos", {
        resource: list,
        onSuccess: (current, made) => [...current, made.id],
      });
      return { list, create };
    });
    create.mutate({});
    await tick();
    expect(list.value())
      .toEqual([1, 9]);
  });
});

describe("httpPut and httpPatch", () => {
  test("PUT sends the input as the body", async () => {
    const { sent, transport } = transportWith(() => json({ ok: true }));
    const replace = inBackend(transport, () => httpPut<{ title: string }>("/todos/1"));
    replace.mutate({ title: "new" });
    await tick();
    expect(first(sent).init.method)
      .toBe("PUT");
    expect(first(sent).init.body)
      .toBe(JSON.stringify({ title: "new" }));
  });

  test("PATCH sends the input as the body", async () => {
    const { sent, transport } = transportWith(() => json({ ok: true }));
    const edit = inBackend(transport, () => httpPatch<{ done: boolean }>("/todos/1"));
    edit.mutate({ done: true });
    await tick();
    expect(first(sent).init.method)
      .toBe("PATCH");
    expect(first(sent).init.body)
      .toBe(JSON.stringify({ done: true }));
  });
});

describe("httpDelete", () => {
  test("sends no body, and the input builds the URL", async () => {
    const { sent, transport } = transportWith(() => new Response(null, { status: 204 }));
    const remove = inBackend(transport, () => httpDelete<number>((id) => `/todos/${id}`));
    remove.mutate(5);
    await tick();
    expect(first(sent).url)
      .toBe("/todos/5");
    expect(first(sent).init.method)
      .toBe("DELETE");
    expect(first(sent).init.body)
      .toBeUndefined();
    expect(remove.outcome())
      .toBe("succeeded");
  });
});
