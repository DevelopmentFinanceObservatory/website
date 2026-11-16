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
    // Not a default of eslint-config-next: pnpm run build:migrate bundles the
    // migrate entrypoint here, and linting a 10mb generated bundle reports
    // thousands of problems in vendored code.
    "dist/**",
    // The prototypes app's generated files. Its source stays linted.
    "prototypes/next-env.d.ts",
    "prototypes/.next/**",
    "prototypes/out/**",
    "prototypes/dist/**",
    "prototypes/node_modules/**",
  ]),
]);

export default eslintConfig;
