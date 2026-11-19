// ChildActivatedRoute: the activated route an outlet shows, as a signal, or undefined when it shows
// nothing. Whoever owns the outlet provides it, so the outlet only reads it.

import { InjectionToken, type ReadonlySignal } from "@tinker/core";
import type { ActivatedRoute } from "./activated-route.ts";

export const ChildActivatedRoute = new InjectionToken<ReadonlySignal<ActivatedRoute | undefined>>(
  "ChildActivatedRoute",
);
