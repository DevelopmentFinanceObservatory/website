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
  // The export Job reaches Postgres and BigQuery only through db/bounded.ts,
  // whose clients bound every call in time. It imports the Cloud SQL
  // connector's setup from db/connection.ts and none of its pool builders.
  {
    files: ["db/event-export.ts", "db/account-export.ts", "db/export-events.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...["pg", "@google-cloud/bigquery"].map((name) => ({ name })),
            ...["./connection", "./connection.ts"].map((name) => ({
              name,
              importNames: ["buildRuntimePool", "buildCounterPool", "buildMigratorPool"],
            })),
          ].map((path) => ({ ...path, message: "Use the bounded clients in db/bounded.ts." })),
        },
      ],
    },
  },
]);

export default eslintConfig;
