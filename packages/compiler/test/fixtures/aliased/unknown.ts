// A component that imports from an alias that names no file: not found, so not checked.
import { Nothing } from "@app/missing/nothing";
import { Component } from "@tinker/core";

@Component({ selector: "tk-unknown", template: "<p></p>", imports: [Nothing] })
export class Unknown {}
