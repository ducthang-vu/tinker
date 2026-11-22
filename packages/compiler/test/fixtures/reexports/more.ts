// A directive that another file re-exports with `export *`: read by the compiler tests.
import { Directive } from "@tinker/core";

@Directive({ selector: "[more]" })
export class More {}
