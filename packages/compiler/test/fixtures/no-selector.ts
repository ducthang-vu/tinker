// A directive whose selector is computed at run time: the compiler cannot read it.
import { Directive } from "@tinker/core";

declare function pick(): string;

@Directive({ selector: pick() })
export class Computed {}
