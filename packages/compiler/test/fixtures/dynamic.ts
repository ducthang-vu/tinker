// A component whose template is not a literal: skipped, or an error in strict mode.
import { Component } from "@tinker/core";

const html = "<p>dynamic</p>";

@Component({ selector: "tk-dynamic", template: html })
export class Dynamic {}
