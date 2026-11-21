// A component that uses the badge directive in its template.
import { Component, signal } from "@tinker/core";
import { Badge } from "./badge.ts";

@Component({
  selector: "lib-alert",
  template: `<p badge>{{ message() }}</p>`,
  imports: [Badge],
})
export class Alert {
  readonly message = signal("Saved");
}
