// ESLint: Tinker's formatter (and, later, its linter).
//
// Formatting comes from @stylistic (`npm run format` fixes what it can).
// typescript-eslint only provides the parser: it reads TypeScript through
// the TypeScript 6 API (`typescript` in package.json), since TypeScript 7
// (`typescript7`, used by the build and typecheck scripts) has no API.

import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import stylistic from "@stylistic/eslint-plugin";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/", "coverage/", "node_modules/"] },
  // A disable comment that no longer disables anything is an error too.
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      // No `any`. To use one on purpose, say so where it is used:
      //   // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Disable comments must name their rules and give a reason (after `--`).
  comments.recommended,
  {
    rules: {
      "@eslint-community/eslint-comments/require-description": "error",
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
    },
  },
  stylistic.configs.customize({
    indent: 2,
    quotes: "double",
    semi: true,
    commaDangle: "always-multiline",
    braceStyle: "1tbs",
    arrowParens: true,
    jsx: false,
  }),
  {
    rules: {
      // A chain of calls goes one call per line: `a.b()` stays, `a.b().c()` breaks.
      "@stylistic/newline-per-chained-call": ["error", { ignoreChainWithDepth: 1 }],
      // Long lines are reported, not rewrapped: break them by hand.
      "@stylistic/max-len": [
        "error",
        {
          code: 100,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
    },
  },
];
