import { computed, h, mount, signal } from "../../src/index.ts";

function Counter() {
  const count = signal(0);
  const parity = computed(() => (count() % 2 === 0 ? "even" : "odd"));

  return h(
    "div",
    null,
    h("h1", null, "Count: ", count),
    h("p", { className: parity }, "The count is ", parity),
    h("button", { onClick: () => count.set((n) => n - 1) }, "-"),
    h("button", { onClick: () => count.set((n) => n + 1) }, "+"),
  );
}

mount(Counter, document.getElementById("app")!);
