// A component whose template is computed at run time: skipped, or an error in strict mode.
import { Component } from "@tinker/core";

declare function render(): string;

@Component({ selector: "tk-dynamic", template: render() })
export class Dynamic {}
