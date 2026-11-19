// ChildActivatedRoute: the activated route an outlet shows, as a signal of a Maybe: None when it
// shows nothing. Whoever owns the outlet provides it, so the outlet only reads it.

import { InjectionToken, type Maybe, type ReadonlySignal } from "@tinker/core";
import type { ActivatedRoute } from "./activated-route.ts";

export const ChildActivatedRoute = new InjectionToken<ReadonlySignal<Maybe<ActivatedRoute>>>(
  "ChildActivatedRoute",
);
