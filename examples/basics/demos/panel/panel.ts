// A parent calling a child's public method through a template reference: the child is
// named with exportAs, and the parent's handler calls its method. A test can replace the
// child with a mock and check the call.

import { Component, signal } from "@tinker/core";

@Component({
  selector: "tk-gauge",
  exportAs: "gauge",
  template: "<span>{{ shown() }}</span>",
})
export class Gauge {
  readonly shown = signal("idle");

  show(level: number): void {
    this.shown.set(`level ${level}`);
  }
}

@Component({
  selector: "tk-panel",
  template: `<tk-gauge #g="gauge"></tk-gauge><button (click)="g.show(3)">Set</button>`,
  imports: [Gauge],
})
export class Panel {}
