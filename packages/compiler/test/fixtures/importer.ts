// Imports a component and a directive from a file next to it: the check finds them on disk.
import { Card, Item } from "./item.ts";
import { Component } from "@tinker/core";

@Component({
  selector: "tk-page",
  template: "<div item><tk-card></tk-card></div>",
  imports: [Item, Card],
})
export class Page {}
