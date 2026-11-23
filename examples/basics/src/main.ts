// Tinker basics: one app. Its shell (features/examples/app/app.ts) routes to its pages
// (features/examples/app/routes.ts).
// The practical examples are at "/", each card is one topic:
//
// - features/examples/demos/counter/counter.ts: a component with its own provided store,
//   a directive that changes it, and an output the template listens to.
// - features/examples/demos/highlight/highlight.ts: directives with host class and attribute
//   bindings, shared by the other files.
// - features/examples/demos/clock/clock.ts: an @Effect that cleans up when destroyed, and
//   @AfterNextRender.
// - features/examples/demos/todos/todos.ts: @map over a list, track, the $ variables,
//   destructuring, and the empty case of @match.
// - features/examples/demos/patterns/patterns.ts: @match with each pattern form.
// - features/examples/demos/notice/notice.ts: a component whose template and CSS are files,
//   next to it.
//
// The API reference, generated from the TSDoc, is at "/api" (features/apidoc/api-docs.ts).

import { bootstrap, provide } from "@tinker/core";
import { valueOrThrow } from "@tinker/functional";
import { PLATFORM_LOCATION, provideRouter } from "@tinker/router";
import { App } from "./features/examples/app/app.ts";
import { basedPlatformLocation } from "./features/examples/app/base-location.ts";
import { ROUTES } from "./features/examples/app/routes.ts";

// The bundle sits in the assets folder under the app's base: the root locally, or "/tinker/" on
// GitHub Pages. The router reads its paths from under that base.
const base = new URL("../", import.meta.url /* @vite-ignore: resolved at run time */).pathname;

// The first provider of a token wins, so the location for the base comes before provideRouter's,
// which would otherwise use the browser's own location.
valueOrThrow(bootstrap(App, {
  providers: [
    provide(PLATFORM_LOCATION, { useValue: basedPlatformLocation(base) }),
    ...provideRouter(ROUTES),
  ],
}));
