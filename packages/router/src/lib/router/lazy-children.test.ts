import { expect, test } from "vitest";
import { loadChildrenOnce } from "./lazy-children.ts";
import type { Route } from "./route.ts";

test("a hold given up twice is given up once: the load stays while another holds it", () => {
  const signals: AbortSignal[] = [];
  const route: Route = {
    path: "lazy",
    loadChildren: (signal) => {
      signals.push(signal);
      return new Promise(() => undefined);
    },
  };
  const loader = route.loadChildren ?? (() => Promise.resolve([]));
  const first = loadChildrenOnce(route, loader);
  const second = loadChildrenOnce(route, loader);
  first.release();
  first.release();
  expect(signals[0]?.aborted)
    .toBe(false);
  second.release();
  expect(signals[0]?.aborted)
    .toBe(true);
});
