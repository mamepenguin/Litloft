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
    // The component fixture's bundle: minified output of the real
    // components, built by e2e-components/build-bundle.ts.
    "e2e-components/.build/**",

    // Another repository's source, linked in by `setup-addons.sh`.
    //
    // Be clear about what this does and does not decide. **Nothing lints
    // these files today.** None of the four addon repositories has an eslint
    // config or a `package.json`; measured across all four, the only
    // occurrence of "eslint" in their CI is a comment saying it is not run,
    // and the only occurrences in their sources are `eslint-disable`
    // directives written for a linter that has never looked at them. `tsc` is
    // the whole of the static checking those files get.
    //
    // So this entry does not remove coverage that existed. It keeps core's
    // required check from becoming the first thing that lints four other
    // repositories — which is a real decision about who owns those errors and
    // where they get fixed, and a bigger one than the change that surfaced
    // it. It matches the split `design-decisions.md` §Addons draws, and the
    // reason those repositories' own jobs run `tsc` against core but not
    // `eslint`.
    //
    // Until `setup-addons.sh` began building this directory for real, that
    // was true by accident: eslint does not follow a symlinked directory.
    // Now it is true by declaration, which is the only change here. Measured
    // at the time — with the directory real and no ignore, eslint went from
    // `0 errors, 63 warnings` (exit 0) to `10 errors, 98 warnings` (exit 1),
    // every new one from an addon.
    //
    // Two of those errors are `react-hooks/rules-of-hooks`, both in
    // `knowledge`'s `KnowledgeEditSection.test.tsx`, and both are false
    // positives: the hooks run inside a `vi.mock` factory's `default:` arrow,
    // which React renders as the mocked component, and the rule's heuristic
    // only objects because an anonymous function assigned to `default` has no
    // capitalised name. Were they real, the suite could not be green — React
    // throws on a hook called outside a render.
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
