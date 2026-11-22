import { defineConfig } from "vitest/config";
// The compiler is read from its build, which `pretest` and `precoverage` make first.
import { tinkerCompiler } from "@tinker/compiler";
import { standardDecorators, workspaceAlias } from "./vite.shared.ts";

// The root config is for the tests. The example app has its own (examples/basics).
export default defineConfig({
  plugins: [tinkerCompiler(), standardDecorators()],
  resolve: {
    alias: workspaceAlias,
  },
  test: {
    environment: "jsdom",
    // Gives @tinker/testing the runner's hooks: see vitest.setup.ts.
    setupFiles: ["./vitest.setup.ts"],
    // Tests live next to the files they test. The example's tests run here too.
    include: ["packages/*/src/**/*.test.ts", "examples/*/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/**/*.test.ts"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 100,
        branches: 100,
      },
    },
  },
});
