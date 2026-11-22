// A directive that another file re-exports under a new name: read by the compiler tests.
import { Directive } from "@tinker/core";

@Directive({ selector: "[renamed]" })
export class Item {}
