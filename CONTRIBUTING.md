# Contributing

Issues and pull requests are welcome. The ONE Data team maintains this repository. For a large change, open an issue first so we can agree on the approach before you write it.

Participation is governed by the [Code of Conduct](https://github.com/DevelopmentFinanceObservatory/.github/blob/main/CODE_OF_CONDUCT.md). Report a security problem through GitHub private vulnerability reporting (the "Report a vulnerability" button under the Security tab), as set out in the [security policy](https://github.com/DevelopmentFinanceObservatory/.github/blob/main/SECURITY.md), and not in a public issue. For other questions see [SUPPORT.md](https://github.com/DevelopmentFinanceObservatory/.github/blob/main/SUPPORT.md).

## Set up

You need Node 22.18 or newer, pnpm, [just](https://github.com/casey/just), and Docker for the database tests.

```bash
just setup    # pnpm install and .env.local from .env.example
just doctor   # checks node, pnpm and the pnpm version in package.json
just dev      # http://localhost:3000
```

The README says which parts of the site need a reachable `apis` or `ai` service. No contribution needs access to ONE's cloud project.

## Before you open a pull request

```bash
just db-up    # local Postgres 18 on port 5433, needed by the tests
just check    # lint, typecheck, test, build
```

`just check` runs what the `ci` workflow runs (ESLint, Stylelint, `tsc`, the tests and the build), apart from the migration bundle build. Run `just format` to apply Prettier and Stylelint fixes.

A pull request needs:

- a passing `ci` check (draft pull requests run no CI until marked ready)
- an approving review from a code owner
- tests for changed behaviour in the `test` directories under `db/` and `src/lib/`
- updated documentation when you change a command, an environment variable or an endpoint

If you change `db/schema.ts`, generate the migration with `just db-generate`, review the SQL, and commit it with the schema change. Never edit a migration that has already been applied. Write a new one. `docs/development.md` has the full workflow.

## Branches

`dev` is the default branch. Branch from it and open the pull request against it. `main` is the production branch and moves only by a release pull request from `dev`.

## Maintainer notes

`docs/development.md` covers code conventions, releases, the deployed services and the deploy configuration. `deploy/README.md` covers the image, migrations on deploy and the environment contract.
