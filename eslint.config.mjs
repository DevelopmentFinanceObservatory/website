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
  ]),
]);

export default eslintConfig;
