// Gives @tinker/testing the Vitest run's afterEach, and whether a test is running, so that a
// fixture `cleanup()` would destroy at the wrong time is refused when it is built (TestBed.build).

import { afterEach, expect } from "vitest";
import { registerRunner } from "@tinker/testing";

registerRunner({
  afterEach,
  inTest: () => expect.getState().currentTestName !== undefined,
});
