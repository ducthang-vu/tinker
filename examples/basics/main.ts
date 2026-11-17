// Tinker basics, split by topic. Each file is one part of the demo:
//
// - counter.ts: a component with its own provided store, a directive that
//   changes it, and an output the template listens to.
// - highlight.ts: directives with host class and attribute bindings, shared
//   by the other files.
// - clock.ts: an @Effect that cleans up when destroyed, and @AfterNextRender.
// - todos.ts: @map over a list, track, the $ variables, destructuring, and the
//   empty case of @match.
// - patterns.ts: @match with each pattern form.
//
// This file starts one app per component. Each renders into the element of its
// selector in index.html, and each is its own engine.

import { bootstrap } from "@tinker/core";
import { Clock } from "./clock.ts";
import { Counter } from "./counter.ts";
import { Patterns } from "./patterns.ts";
import { Todos } from "./todos.ts";

bootstrap(Counter);
bootstrap(Clock);
bootstrap(Todos);
bootstrap(Patterns);
