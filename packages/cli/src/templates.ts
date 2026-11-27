// The files of a new app, by their path in the app's folder. Each is what `tinker new` writes.
// The app is a root component (`App`) in src/app.ts, bootstrapped by src/main.ts.

/** The test runners a new app can use. */
export const TEST_RUNNERS = ["vitest", "node"] as const;
export type TestRunner = (typeof TEST_RUNNERS)[number];

/** The test runner of a new app when `--test-runner` gives none. */
export const DEFAULT_TEST_RUNNER: TestRunner = "vitest";

/** The script of the Node test runner: it loads the loader, and runs the test files under src/. */
const NODE_TEST = "node --experimental-strip-types "
  + "--conditions=development --import ./register.mjs --test \"src/**/*.test.ts\"";

/** The files of a new app named `name`, by their path relative to the app's folder. */
export function appFiles(
  name: string,
  prefix: string,
  testRunner: TestRunner,
): Map<string, string> {
  const files = new Map([
    ["package.json", packageJson(name, prefix, testRunner)],
    ["index.html", indexHtml(name, prefix)],
    ["vite.config.ts", viteConfig()],
    ["src/main.ts", mainTs()],
    ["src/app.ts", appTs(name, prefix)],
    ["tsconfig.json", tsconfig()],
    [".gitignore", gitignore()],
    ["README.md", readme(name, testRunner)],
  ]);
  if (testRunner === "node") {
    files.set("register.mjs", registerLoader());
    files.set("hooks.mjs", loaderHooks());
  }
  return files;
}

function packageJson(name: string, prefix: string, testRunner: TestRunner): string {
  const node = testRunner === "node";
  return `${JSON.stringify({
    name,
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: {
      dev: "tinker dev",
      build: "tinker build",
      preview: "tinker preview",
      typecheck: "tsc --noEmit",
      test: node ? NODE_TEST : "vitest run",
    },
    dependencies: {
      "@tinker/core": "*",
    },
    devDependencies: node
      ? {
          "@tinker/cli": "*",
          "@tinker/compiler": "*",
          "typescript": "npm:@typescript/typescript6@6.0.2",
          "@types/node": "^22.10.2",
          "@babel/core": "^8.1.2",
          "@babel/plugin-proposal-decorators": "^8.0.2",
          "@babel/plugin-transform-typescript": "^8.1.3",
        }
      : {
          "@tinker/cli": "*",
          "@tinker/compiler": "*",
          "typescript": "npm:@typescript/typescript6@6.0.2",
          "vitest": "^5.1.0",
        },
    tinker: { prefix, testRunner },
  }, null, 2)}\n`;
}

function indexHtml(name: string, prefix: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
  </head>
  <body>
    <${prefix}-app></${prefix}-app>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
`;
}

function viteConfig(): string {
  return `// The app's build settings: the Tinker config (the compiler, the decorators, the aliases, and
// the base element the router reads).
import { tinkerConfig } from "@tinker/compiler";

const config = tinkerConfig();

export default {
  plugins: [...config.plugins],
  resolve: { alias: [...config.aliases] },
};
`;
}

function mainTs(): string {
  return `import { bootstrap } from "@tinker/core";
import { App } from "./app.ts";

bootstrap(App);
`;
}

function appTs(name: string, prefix: string): string {
  return `import { Component } from "@tinker/core";

@Component({
  selector: "${prefix}-app",
  template: \`<h1>{{ title }}</h1>\`,
})
export class App {
  readonly title = "${name}";
}
`;
}

/** The compiler settings: strict TypeScript, with the `.ts` import paths the app uses. */
function tsconfig(): string {
  return `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      strict: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      allowImportingTsExtensions: true,
      skipLibCheck: true,
      noEmit: true,
      customConditions: ["development"],
    },
    include: ["src", "vite.config.ts"],
  }, null, 2)}\n`;
}

/** What git should not keep: the installed packages, the build, and logs. */
function gitignore(): string {
  return `node_modules/
dist/
*.log
`;
}

/** How to run the app, for whoever opens it next. */
function readme(name: string, testRunner: TestRunner): string {
  const tests = testRunner === "node"
    ? "npm test           # run the tests (Node's built-in test runner; see docs/cli.md)"
    : "npm test           # run the tests (vitest; see docs/cli.md)";
  return `# ${name}

A Tinker app.

## Commands

\`\`\`bash
npm install        # install the packages
npm run dev        # serve the app, until it is stopped
npm run build      # build the app into dist/
npm run preview    # serve the built app (run build first)
npm run typecheck  # check the types
${tests}
\`\`\`
`;
}

/** The loader's registration: Node runs the hooks of hooks.mjs for every module the tests load. */
function registerLoader(): string {
  return `// Registers the hooks of hooks.mjs with Node, for \`npm test\`. See README.md.
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
`;
}

/**
 * The loader's hooks: each .ts file the tests load gets Tinker's decorators and its TypeScript
 * types removed, the same steps the build of the app takes. Node then runs the result.
 */
function loaderHooks(): string {
  return `// The load hook for the tests: it transforms each .ts module (not a dependency) with Babel,
// for the decorators and the TypeScript types. Node strips nothing from source a hook gives it.
import { transformAsync } from "@babel/core";
import transformTypescript from "@babel/plugin-transform-typescript";
import proposalDecorators from "@babel/plugin-proposal-decorators";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts") || url.includes("/node_modules/")) {
    return nextLoad(url, context);
  }
  const filename = fileURLToPath(url);
  const source = await readFile(filename, "utf8");
  const result = await transformAsync(source, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [
      [proposalDecorators, { version: "2023-11" }],
      [transformTypescript, { isTSX: false }],
    ],
  });
  return { format: "module", source: result.code, shortCircuit: true };
}
`;
}
