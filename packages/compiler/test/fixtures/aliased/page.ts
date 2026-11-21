// A component that uses a directive through a path alias.
import { Card } from "@app/card";
import { Component } from "@tinker/core";

@Component({ selector: "tk-page", template: "<div card></div>", imports: [Card] })
export class Page {}
