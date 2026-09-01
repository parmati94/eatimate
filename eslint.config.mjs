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
    // The ingest virtualenv ships Playwright's bundled browser JS, some of it
    // over 500KB on one line. Linting it crashed `npm run lint` outright with
    // "RangeError: Invalid string length", so the whole repo lint was dead --
    // unnoticed because CI runs tsc and vitest, not lint.
    "ingest/.venv/**",
  ]),
]);

export default eslintConfig;
