// A directive and a component another file imports: read by the compiler tests.
import { Component, Directive } from "@tinker/core";

@Directive({ selector: "[item]" })
export class Item {}

@Component({ selector: "tk-card", template: "<p>card</p>" })
export class Card {}
