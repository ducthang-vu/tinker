// Helpers shared by the example's tests: find a button by its text, and click it.

import type { TestingElement } from "@tinker/testing";

/** The button under `scope` whose text is `label`. Throws if there is none. */
export function buttonNamed(scope: TestingElement, label: string): HTMLElement {
  const found = scope.queryAll("button")
    .find((button) => button.element.textContent?.trim() === label);
  if (!found) {
    throw new Error(`No button "${label}"`);
  }
  return found.element as HTMLElement;
}

/** The text of the first element under `scope` that matches `selector`. */
export function textOf(scope: TestingElement, selector: string): string {
  return scope.query(selector).element.textContent ?? "";
}

/** The item at `index`. Throws, naming the index, when there is none. */
export function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No item ${index}: there are ${items.length}`);
  }
  return item;
}
