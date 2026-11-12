import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    open: "/examples/counter/",
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
