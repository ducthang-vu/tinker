// Uses a directive that is neither declared here nor imported from a relative path: the
// check cannot find its selector, so the component is skipped with a warning.
import { Component } from "@tinker/core";

declare const Widget: new () => object;

@Component({ selector: "tk-external", template: "<p>x</p>", imports: [Widget] })
export class External {}
