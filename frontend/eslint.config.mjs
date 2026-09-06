import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Generated test artifacts:
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
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
    // not tidiness: it is wiring that was never finished. `#189` was two of
    // them — `onMetaSelect` reached `TrashFileGrid` and `TrashFileList` and
    // neither called it, so Cmd/Ctrl-click multi-selection in the trash was
    // silently dead. TypeScript does not object, and a test that calls the
    // module's API rather than pressing the thing cannot see it.
    //
    // `ignoreRestSiblings` is off deliberately. It defaults to true so that
    // `const { a, ...rest } = props` can drop `a` on purpose — but there is
    // no instance of that idiom in `src`, so the allowance would only ever
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
