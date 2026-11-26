import { describe, expect, test } from "vitest";
import { run } from "@tinker/functional";
import { builderOver } from "../destination/test-builder.ts";
import { createCommitStep, type BrowserWriter } from "./commit-step.ts";
import type { MatchedRequest } from "./request.ts";
import type { Stop } from "./stop.ts";

const declared = [{ path: "/todos", children: [{ path: "/:id", component: class {} }] }] as const;

/** A browser that records what it is asked to do, and starts at `url`. */
function fakeBrowser(url: string, refuse = false) {
  const calls: string[] = [];
  let current = url;
  const browser: BrowserWriter = {
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
  const destination = builderOver(declared)
    .to("todos")
    .to("7")
    .build();
  return {
    id: 1,
    destination,
    state: { x: 1 },
    arrival,
    redirectFrom: [],
    activatedRoutes: [],
    trace: [],
    chain: [],
  };
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
  test("a push adds the history entry, and activates the routes", () => {
    const { browser, calls } = fakeBrowser("/home");
    const activated: MatchedRequest[] = [];
    const step = createCommitStep({ browser, activate: (m) => activated.push(m) });
    const outcome = commit(step, matchedFor("push"));
    expect(calls)
      .toEqual(["go /todos/7"]);
    expect(activated)
      .toHaveLength(1);
    expect(outcome?.ok)
      .toBeDefined();
  });

  test("a pop replaces the entry with the destination, even when the URL is the same, and activates", () => {
    const { browser, calls } = fakeBrowser("/todos/7");
    const activated: MatchedRequest[] = [];
    const step = createCommitStep({ browser, activate: (m) => activated.push(m) });
    commit(step, matchedFor("pop"));
    expect(calls)
      .toEqual(["replace /todos/7"]);
    expect(activated)
      .toHaveLength(1);
  });
  test("a pop where a redirect moved the URL replaces the current entry", () => {
    const { browser, calls } = fakeBrowser("/elsewhere");
    const step = createCommitStep({ browser, activate: () => {} });
    commit(step, matchedFor("pop"));
    expect(calls)
      .toEqual(["replace /todos/7"]);
  });

  test("a browser that refuses the change stops with Failed, and nothing is activated", () => {
    const { browser } = fakeBrowser("/home", true);
    const activated: MatchedRequest[] = [];
    const step = createCommitStep({ browser, activate: (m) => activated.push(m) });
    const outcome = commit(step, matchedFor("push"));
    expect(outcome?.error)
      .toMatchObject({ kind: "rejected", reason: "failed" });
    expect(activated)
      .toEqual([]);
  });
});
