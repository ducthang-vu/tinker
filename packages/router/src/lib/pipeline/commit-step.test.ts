import { describe, expect, test } from "vitest";
import { run } from "@tinker/functional";
import { UrlBuilder } from "../destination/url-builder.ts";
import { createCommitStep, type BrowserWriter } from "./commit-step.ts";
import type { MatchedRequest } from "./request.ts";
import type { Stop } from "./stop.ts";

const declared = [{ path: "/todos", children: [{ path: "/:id" }] }] as const;

/** A browser that records what it is asked to do, and starts at `url`. */
function fakeBrowser(url: string, refuse = false) {
  const calls: string[] = [];
  let current = url;
  const browser: BrowserWriter = {
    url: () => current,
    go: (next) => {
      if (refuse) {
        throw new Error("refused");
      }
      calls.push(`go ${next}`);
      current = next;
    },
    replace: (next) => {
      calls.push(`replace ${next}`);
      current = next;
    },
  };
  return { browser, calls };
}

/** A matched request for the destination, as the match step would make it. */
function matchedFor(arrival: "push" | "pop"): MatchedRequest {
  const destination = UrlBuilder.for(declared)
    .withSegment("todos")
    .withParam("id", "7")
    .build();
  return { id: 1, destination, state: { x: 1 }, arrival, redirectFrom: [], chain: [] };
}

/** Runs the commit step and returns its outcome: the committed request, or the stop. */
function commit(step: ReturnType<typeof createCommitStep>, request: MatchedRequest) {
  const seen: { ok?: MatchedRequest; error?: Stop }[] = [];
  run(step(request), {
    ok: (value) => {
      seen.push({ ok: value });
    },
    error: (error) => {
      seen.push({ error });
    },
  });
  return seen[0];
}

describe("the commit step", () => {
  test("a push adds the history entry, with the base, and activates the routes", () => {
    const { browser, calls } = fakeBrowser("/app/home");
    const activated: MatchedRequest[] = [];
    const step = createCommitStep({ browser, base: "/app", activate: (m) => activated.push(m) });
    const outcome = commit(step, matchedFor("push"));
    expect(calls)
      .toEqual(["go /app/todos/7"]);
    expect(activated)
      .toHaveLength(1);
    expect(outcome?.ok)
      .toBeDefined();
  });

  test("a pop with the browser already at the destination changes nothing, and activates", () => {
    const { browser, calls } = fakeBrowser("/app/todos/7");
    const activated: MatchedRequest[] = [];
    const step = createCommitStep({ browser, base: "/app", activate: (m) => activated.push(m) });
    commit(step, matchedFor("pop"));
    expect(calls)
      .toEqual([]);
    expect(activated)
      .toHaveLength(1);
  });

  test("a pop where a redirect moved the URL replaces the current entry", () => {
    const { browser, calls } = fakeBrowser("/app/elsewhere");
    const step = createCommitStep({ browser, base: "/app", activate: () => {} });
    commit(step, matchedFor("pop"));
    expect(calls)
      .toEqual(["replace /app/todos/7"]);
  });

  test("a browser that refuses the change stops with Failed, and nothing is activated", () => {
    const { browser } = fakeBrowser("/app/home", true);
    const activated: MatchedRequest[] = [];
    const step = createCommitStep({ browser, base: "/app", activate: (m) => activated.push(m) });
    const outcome = commit(step, matchedFor("push"));
    expect(outcome?.error)
      .toMatchObject({ kind: "rejected", reason: "failed" });
    expect(activated)
      .toEqual([]);
  });
});
