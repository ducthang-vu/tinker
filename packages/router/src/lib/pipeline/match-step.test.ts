import { describe, expect, test } from "vitest";
import { fail, fromComputation, run, succeed } from "@tinker/functional";
import { type AppPath, type Segment, makeAppPath } from "../destination/app-path.ts";
import { builderOver } from "../destination/test-builder.ts";
import type { Route } from "../router/route.ts";
import {
  AllowCommand,
  type RouteGate,
  type RouteGuardCommand,
  RedirectCommand,
  RedirectPayload,
  StopCommand,
  StopPayload,
} from "./guard-step.ts";
import { createMatchStep, MAX_REDIRECTS } from "./match-step.ts";
import type { MatchedRequest, NavigationRequest } from "./request.ts";
import { Redirect, type Stop } from "./stop.ts";
import { Injector } from "@tinker/core";
import type { MatchStep } from "./steps.ts";

const declared = [{ path: "/todos", children: [{ path: "/:id" }] }, { path: "/home" }] as const;

const root: Route = {
  path: "",
  component: class {},
  children: [
    { path: "/todos", component: class {}, children: [{ path: "/:id", component: class {} }] },
    { path: "/home", component: class {} },
  ],
};

/** A request for a destination, with no redirects. */
function requestFor(destination: AppPath): NavigationRequest {
  return {
    id: 1,
    destination,
    state: null,
    arrival: "push",
    redirectFrom: [],
    activatedRoutes: [],
    trace: [],
  };
}

/** A match step over `tree`, with a fresh injector and lazy cache. */
function stepOver(tree: Route): MatchStep {
  const { injector } = Injector.create({ providers: [] });
  return createMatchStep(tree, { injector });
}

/** The result of the match task: the matched request, or the stop it ended with. */
interface Ran {
  readonly matched?: MatchedRequest;
  readonly stop?: Stop;
}

/** Runs the match step's task for `request`, and resolves with what it ended with. */
function runMatch(step: MatchStep, request: NavigationRequest): Promise<Ran> {
  return new Promise((resolve) => {
    run(step(request), {
      ok: (matched) => resolve({ matched }),
      error: (stop) => resolve({ stop }),
    });
  });
}

describe("the match step", () => {
  test("a destination of the tree matches each part to its route, with its param", async () => {
    const destination = builderOver(declared)
      .to("todos")
      .to("7")
      .build();
    const { matched } = await runMatch(stepOver(root), requestFor(destination));
    expect(matched?.chain.map((level) => level.route.path))
      .toEqual(["", "/todos", "/:id"]);
    expect(matched?.chain.at(-1)?.params)
      .toEqual({ id: "7" });
  });

  test("a destination the tree does not have is a no-route stop", async () => {
    const destination = builderOver(declared)
      .to("home")
      .build();
    const empty: Route = { path: "", component: class {}, children: [] };
    const { stop } = await runMatch(stepOver(empty), requestFor(destination));
    expect(stop)
      .toMatchObject({ kind: "rejected", reason: "no-route" });
  });

  test("a navigation past the redirect cap fails at the match step", async () => {
    const destination = builderOver(declared)
      .to("home")
      .build();
    const redirected: NavigationRequest = {
      ...requestFor(destination),
      redirectFrom: Array.from({ length: MAX_REDIRECTS + 1 }, () => destination),
    };
    const { stop } = await runMatch(stepOver(root), redirected);
    expect(stop)
      .toMatchObject({ kind: "rejected", reason: "failed" });
  });

  test("a part below a route with no children is a no-route stop", async () => {
    const below: Segment[] = [
      { kind: "segment", value: "home" },
      { kind: "segment", value: "x" },
    ];
    const { stop } = await runMatch(stepOver(root), requestFor(makeAppPath(below, {}, undefined)));
    expect(stop)
      .toMatchObject({ kind: "rejected", reason: "no-route" });
  });
});

describe("canMatch", () => {
  /** A route for `/home`, with a canMatch gate that gives `command`. */
  function homeWith(command: StopCommand | AllowCommand | RedirectCommand): Route {
    return {
      path: "/home",
      component: class {},
      canMatch: [() => succeed(command)],
    };
  }

  test("a STOP skips the route, so the next route with the same path is matched", async () => {
    const tree: Route = {
      path: "",
      component: class {},
      children: [
        homeWith(new StopCommand(new StopPayload("not yet"))),
        { path: "/home", component: class {} },
      ],
    };
    const destination = builderOver(declared)
      .to("home")
      .build();
    const { matched } = await runMatch(stepOver(tree), requestFor(destination));
    expect(matched?.chain.at(-1)?.route)
      .toBe(tree.children?.[1]);
  });

  test("a gate that allows keeps the route", async () => {
    const tree: Route = {
      path: "",
      component: class {},
      children: [homeWith(new AllowCommand())],
    };
    const destination = builderOver(declared)
      .to("home")
      .build();
    const { matched } = await runMatch(stepOver(tree), requestFor(destination));
    expect(matched?.chain.at(-1)?.route)
      .toBe(tree.children?.[0]);
  });

  test("a REDIRECT stops the navigation with a redirect to its URL", async () => {
    const target = builderOver(declared)
      .to("todos", "1")
      .build();
    const tree: Route = {
      path: "",
      component: class {},
      children: [homeWith(new RedirectCommand(new RedirectPayload(target)))],
    };
    const destination = builderOver(declared)
      .to("home")
      .build();
    const { stop } = await runMatch(stepOver(tree), requestFor(destination));
    expect(stop)
      .toBeInstanceOf(Redirect);
  });
});

describe("lazy routes", () => {
  /** A lazy route for `/lazy` whose children are a page for `""`, counting its loads. */
  function lazyTree(loads: { count: number }, canLoad: StopCommand | AllowCommand): Route {
    return {
      path: "",
      component: class {},
      children: [{
        path: "/lazy",
        canLoad: [() => succeed(canLoad)],
        loadChildren: () => {
          loads.count += 1;
          return Promise.resolve([{ path: "", component: class {} }]);
        },
      }],
    };
  }

  test("a lazy route loads its children, and matches in them", async () => {
    const loads = { count: 0 };
    const destination = makeAppPath(
      [{ kind: "segment", value: "lazy" }],
      {},
      undefined,
    );
    const { matched } = await runMatch(
      stepOver(lazyTree(loads, new AllowCommand())),
      requestFor(destination),
    );
    expect(loads.count)
      .toBe(1);
    expect(matched?.chain.map((level) => level.route.path))
      .toEqual(["", "/lazy", ""]);
  });

  test("a canLoad STOP rejects the navigation, and the children are not loaded", async () => {
    const loads = { count: 0 };
    const destination = makeAppPath(
      [{ kind: "segment", value: "lazy" }],
      {},
      undefined,
    );
    const { stop } = await runMatch(
      stepOver(lazyTree(loads, new StopCommand(new StopPayload("signed out")))),
      requestFor(destination),
    );
    expect(loads.count)
      .toBe(0);
    expect(stop)
      .toMatchObject({ kind: "rejected", reason: "guard" });
  });

  test("a lazy route loads once: a later navigation uses the loaded children", async () => {
    const loads = { count: 0 };
    const tree = lazyTree(loads, new AllowCommand());
    const step = stepOver(tree);
    const destination = makeAppPath([{ kind: "segment", value: "lazy" }], {}, undefined);
    await runMatch(step, requestFor(destination));
    await runMatch(step, requestFor(destination));
    expect(loads.count)
      .toBe(1);
  });

  test("a failed load is a failed stop, and is not kept", async () => {
    let attempts = 0;
    const tree: Route = {
      path: "",
      component: class {},
      children: [{
        path: "/lazy",
        loadChildren: () => {
          attempts += 1;
          return Promise.reject(new Error("offline"));
        },
      }],
    };
    const destination = makeAppPath([{ kind: "segment", value: "lazy" }], {}, undefined);
    const step = stepOver(tree);
    const { stop } = await runMatch(step, requestFor(destination));
    expect(stop)
      .toMatchObject({ kind: "rejected", reason: "failed" });
    await runMatch(step, requestFor(destination));
    expect(attempts)
      .toBe(2);
  });
});

describe("a gate or a load that fails", () => {
  test("a canMatch gate that throws fails the navigation", async () => {
    const tree: Route = {
      path: "",
      component: class {},
      children: [{
        path: "/home",
        component: class {},
        canMatch: [() => {
          throw new Error("boom");
        }],
      }],
    };
    const destination = builderOver(declared)
      .to("home")
      .build();
    const { stop } = await runMatch(stepOver(tree), requestFor(destination));
    expect(stop)
      .toMatchObject({ kind: "rejected", reason: "failed" });
  });

  test("a canMatch gate whose task fails fails the navigation", async () => {
    const tree: Route = {
      path: "",
      component: class {},
      children: [{
        path: "/home",
        component: class {},
        canMatch: [() => fail(new Error("no service"))],
      }],
    };
    const destination = builderOver(declared)
      .to("home")
      .build();
    const { stop } = await runMatch(stepOver(tree), requestFor(destination));
    expect(stop)
      .toMatchObject({ kind: "rejected", reason: "failed" });
  });

  test("a canLoad REDIRECT sends the navigation elsewhere, and nothing is loaded", async () => {
    let loads = 0;
    const target = builderOver(declared)
      .to("home")
      .build();
    const tree: Route = {
      path: "",
      component: class {},
      children: [{
        path: "/lazy",
        canLoad: [() => succeed(new RedirectCommand(new RedirectPayload(target)))],
        loadChildren: () => {
          loads += 1;
          return Promise.resolve([]);
        },
      }],
    };
    const destination = makeAppPath([{ kind: "segment", value: "lazy" }], {}, undefined);
    const { stop } = await runMatch(stepOver(tree), requestFor(destination));
    expect(stop)
      .toBeInstanceOf(Redirect);
    expect(loads)
      .toBe(0);
  });

  test("a canLoad gate that throws rejects the navigation as failed", async () => {
    const tree: Route = {
      path: "",
      component: class {},
      children: [{
        path: "/lazy",
        canLoad: [() => {
          throw new Error("boom");
        }],
        loadChildren: () => Promise.resolve([]),
      }],
    };
    const destination = makeAppPath([{ kind: "segment", value: "lazy" }], {}, undefined);
    const { stop } = await runMatch(stepOver(tree), requestFor(destination));
    expect(stop)
      .toMatchObject({ kind: "rejected", reason: "failed" });
  });

  test("a loader that throws as it is called fails the navigation, and is not kept", async () => {
    let attempts = 0;
    const tree: Route = {
      path: "",
      component: class {},
      children: [{
        path: "/lazy",
        loadChildren: () => {
          attempts += 1;
          throw new Error("bad chunk");
        },
      }],
    };
    const destination = makeAppPath([{ kind: "segment", value: "lazy" }], {}, undefined);
    const step = stepOver(tree);
    const { stop } = await runMatch(step, requestFor(destination));
    expect(stop)
      .toMatchObject({ kind: "rejected", reason: "failed" });
    await runMatch(step, requestFor(destination));
    expect(attempts)
      .toBe(2);
  });

  test("two navigations that reach a lazy route at once share one load", async () => {
    let loads = 0;
    const tree: Route = {
      path: "",
      component: class {},
      children: [{
        path: "/lazy",
        loadChildren: () => {
          loads += 1;
          return Promise.resolve([{ path: "", component: class {} }]);
        },
      }],
    };
    const destination = makeAppPath([{ kind: "segment", value: "lazy" }], {}, undefined);
    const step = stepOver(tree);
    const [first, second] = await Promise.all([
      runMatch(step, requestFor(destination)),
      runMatch(step, requestFor(destination)),
    ]);
    expect(loads)
      .toBe(1);
    expect(first.matched)
      .toBeDefined();
    expect(second.matched)
      .toBeDefined();
  });
});

describe("cancelling a navigation", () => {
  /** Starts the match task for `request`: its cancel, and what it ended with. */
  function startMatch(
    step: MatchStep,
    request: NavigationRequest,
  ): { cancel: () => void; ran: Promise<Ran> } {
    let cancel: () => void = () => undefined;
    const ran = new Promise<Ran>((resolve) => {
      cancel = run(step(request), {
        ok: (matched) => resolve({ matched }),
        error: (stop) => resolve({ stop }),
      });
    });
    return { cancel, ran };
  }

  /** A lazy tree whose loader records its signal, and resolves when `finish` is called. */
  function deferredTree(signals: AbortSignal[]): { tree: Route; finish: () => void } {
    let finish: () => void = () => undefined;
    const tree: Route = {
      path: "",
      component: class {},
      children: [{
        path: "/lazy",
        loadChildren: (signal) => {
          signals.push(signal);
          return new Promise((resolve) => {
            finish = () => resolve([{ path: "", component: class {} }]);
          });
        },
      }],
    };
    return { tree, finish: () => finish() };
  }

  const lazyDestination = makeAppPath([{ kind: "segment", value: "lazy" }], {}, undefined);

  test("cancelling a navigation that is the only one waiting aborts its load", () => {
    const signals: AbortSignal[] = [];
    const { tree } = deferredTree(signals);
    const { cancel } = startMatch(stepOver(tree), requestFor(lazyDestination));
    expect(signals[0]?.aborted)
      .toBe(false);
    cancel();
    expect(signals[0]?.aborted)
      .toBe(true);
  });

  test("a load another navigation still waits for is not aborted", async () => {
    const signals: AbortSignal[] = [];
    const { tree, finish } = deferredTree(signals);
    const step = stepOver(tree);
    const first = startMatch(step, requestFor(lazyDestination));
    const second = startMatch(step, requestFor(lazyDestination));
    first.cancel();
    expect(signals[0]?.aborted)
      .toBe(false);
    finish();
    const { matched } = await second.ran;
    expect(matched)
      .toBeDefined();
  });

  test("after its load was aborted, a later navigation loads the children again", async () => {
    const signals: AbortSignal[] = [];
    const { tree, finish } = deferredTree(signals);
    const step = stepOver(tree);
    startMatch(step, requestFor(lazyDestination))
      .cancel();
    const again = startMatch(step, requestFor(lazyDestination));
    expect(signals.length)
      .toBe(2);
    finish();
    const { matched } = await again.ran;
    expect(matched)
      .toBeDefined();
  });

  /** A gate that allows only when `finish` is called: its task waits until then. */
  function heldGate(): { gate: RouteGate; finish: () => void } {
    const held: { finish?: () => void } = {};
    const gate: RouteGate = () =>
      fromComputation<RouteGuardCommand, unknown>((ok) => {
        held.finish = () => ok(new AllowCommand());
      });
    return { gate, finish: () => held.finish?.() };
  }

  test("a navigation cancelled while a gate waits starts no further gate", () => {
    const { gate, finish } = heldGate();
    let later = 0;
    const tree: Route = {
      path: "",
      component: class {},
      children: [{
        path: "/home",
        component: class {},
        canMatch: [gate, () => {
          later += 1;
          return succeed(new AllowCommand());
        }],
      }],
    };
    const destination = builderOver(declared)
      .to("home")
      .build();
    const { cancel } = startMatch(stepOver(tree), requestFor(destination));
    cancel();
    finish();
    expect(later)
      .toBe(0);
  });

  test("a navigation cancelled while its canLoad waits does not load the children", () => {
    const { gate, finish } = heldGate();
    let loads = 0;
    const tree: Route = {
      path: "",
      component: class {},
      children: [{
        path: "/lazy",
        canLoad: [gate],
        loadChildren: () => {
          loads += 1;
          return Promise.resolve([]);
        },
      }],
    };
    const destination = makeAppPath([{ kind: "segment", value: "lazy" }], {}, undefined);
    const { cancel } = startMatch(stepOver(tree), requestFor(destination));
    cancel();
    finish();
    expect(loads)
      .toBe(0);
  });

  test("a load aborted late does not forget the load that a later navigation started", async () => {
    let loads = 0;
    const finishers: Array<() => void> = [];
    const tree: Route = {
      path: "",
      component: class {},
      children: [{
        path: "/lazy",
        loadChildren: (signal) => {
          loads += 1;
          return new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")));
            finishers.push(() => resolve([{ path: "", component: class {} }]));
          });
        },
      }],
    };
    const destination = makeAppPath([{ kind: "segment", value: "lazy" }], {}, undefined);
    const step = stepOver(tree);
    startMatch(step, requestFor(destination))
      .cancel();
    const second = startMatch(step, requestFor(destination));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const third = startMatch(step, requestFor(destination));
    expect(loads)
      .toBe(2);
    finishers.at(-1)?.();
    expect((await second.ran).matched)
      .toBeDefined();
    expect((await third.ran).matched)
      .toBeDefined();
  });
});
