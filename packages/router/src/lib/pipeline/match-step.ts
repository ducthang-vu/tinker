// The match step: finds the route of each part of a destination, from the root down. A destination
// is already made of checked parts (the builder and `parse` made it), so this step only confirms
// that the tree has a route for each part, and returns the levels it matched. A navigation that has
// been redirected too often fails here, before any route is looked at.

import { Left, Right } from "@tinker/functional";
import type { Part } from "../destination/url-builder.ts";
import type { LevelMatch } from "../router/match.ts";
import type { Route } from "../router/route.ts";
import type { MatchedRequest } from "./request.ts";
import type { MatchStep } from "./steps.ts";
import { failed, noRoute, type Stop } from "./stop.ts";

/** The most redirects one navigation may follow. A navigation past it fails at the match step. */
export const MAX_REDIRECTS = 10;

/** A path without its leading slash, as a route is compared with a part. */
function segmentOf(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

/**
 * The levels the parts match, root first: the root, then one level per part. A param part matches a
 * param child with its name; a segment part matches a literal child with its value. `undefined`
 * when a part has no route under the one before it.
 *
 * @param root The root route of the tree.
 * @param parts The parts of the destination, in order.
 * @returns The matched levels, or undefined.
 */
export function matchParts(root: Route, parts: readonly Part[]): readonly LevelMatch[] | undefined {
  const levels: LevelMatch[] = [{ route: root, params: {}, segments: [] }];
  let current = root;
  for (const part of parts) {
    const child = (current.children ?? []).find((node) => {
      const name = segmentOf(node.path);
      return part.kind === "param" ? name === `:${part.name}` : name === part.value;
    });
    if (child === undefined) {
      return undefined;
    }
    levels.push({
      route: child,
      params: part.kind === "param" ? { [part.name]: part.value } : {},
      segments: [part.value],
    });
    current = child;
  }
  return levels;
}

/**
 * The match step for a tree with `root` at its top.
 *
 * @param root The root route of the tree.
 * @returns A match step: the request with its levels, or a stop.
 */
export function createMatchStep(root: Route): MatchStep {
  return (request) => {
    if (request.redirectFrom.length > MAX_REDIRECTS) {
      return Left.of<Stop, MatchedRequest>(
        failed(request, new Error(`more than ${MAX_REDIRECTS} redirects`)),
      );
    }
    const chain = matchParts(root, request.destination.parts);
    if (chain === undefined) {
      return Left.of<Stop, MatchedRequest>(noRoute(request));
    }
    return Right.of<MatchedRequest, Stop>({ ...request, chain });
  };
}
