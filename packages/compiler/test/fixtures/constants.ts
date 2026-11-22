// Constants another file can import: a template, a broken template, and a selector.
import { Directive } from "@tinker/core";

export const prefix = "<p>";
export const page = "<p>page</p>";
export const brokenPage = "<p>{{ a + }}</p>";
export const markedSelector = "[marked]";

@Directive({ selector: markedSelector })
export class Marked {}
