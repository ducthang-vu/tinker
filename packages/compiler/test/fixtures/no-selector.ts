// A directive whose selector is not a literal: the compiler cannot read it.
import { Directive } from "@tinker/core";

const selector = "[computed]";

@Directive({ selector })
export class Computed {}
