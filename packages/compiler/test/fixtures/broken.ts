// A component whose template does not compile: the check must fail on it.
import { Component } from "@tinker/core";

@Component({ selector: "tk-broken", template: "<p>{{ a + }}</p>" })
export class Broken {}
