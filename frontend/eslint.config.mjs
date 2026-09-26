import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
    "e2e-components/.build/**",
    "e2e-epub/.build-preview/**",
    "public/epub-reader/vendor/**",

    // Another repository's source, linked in by `setup-addons.sh`. Ignoring
    // it keeps core's required check from becoming the first thing that
    // lints the addon repositories.
    "src/addons/**",
  ]),
  {
    // The current codebase predates React Compiler-oriented hooks lint
    // rules. Keep lint useful for regressions while avoiding a wide
    // behavioral refactor just to satisfy static heuristics.
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // A prop that is declared, passed, and destructured but never read is
    // not tidiness: it is wiring that was never finished.
    //
    // `ignoreRestSiblings` is off deliberately: the allowance would only
    // hide a real one. `_`-prefix anything genuinely meant to be discarded.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          ignoreRestSiblings: false,
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["server.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
