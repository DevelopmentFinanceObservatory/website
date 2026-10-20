# DFO website

The Next.js application behind [developmentfinance.org](https://developmentfinance.org): the data search, the Studio (a chat and canvas workspace for building charts and tables), reference pages, and user accounts. It also acts as the proxy that carries all outside traffic, including MCP, to the platform APIs.

It is part of the [Development Finance Observatory](https://github.com/DevelopmentFinanceObservatory), an initiative of [ONE Data](https://data.one.org) built on [Google Data Commons](https://datacommons.org).

This repository is under active development. Interfaces, schemas, and data may change without notice.

## What's inside

- `src/` holds the application: the App Router pages and API routes in `src/app`, atomic components in `src/components`, and the proxy, search, Studio, auth and feedback code in `src/lib`.
- `db/` holds the Drizzle schema, the forward-only migrations and the runner that applies them.
- `deploy/` holds the Dockerfile and the deploy notes.
- `.github/workflows/` holds CI and the deploy workflows.
- `docs/` holds the maintainer and endpoint documentation.

The site talks to three neighbouring repositories: [`apis`](https://github.com/DevelopmentFinanceObservatory/apis) for search, datasets and graph queries, [`ai`](https://github.com/DevelopmentFinanceObservatory/ai) for the Studio agent and MCP servers, and [`infra`](https://github.com/DevelopmentFinanceObservatory/infra) for the Cloud Run services that run it. The org profile has the [full repository map](https://github.com/DevelopmentFinanceObservatory).

## Getting started

You need Node 22.18 or newer and pnpm. `just doctor` checks both, and `just setup` installs dependencies and creates `.env.local` from `.env.example`.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Only the dev apis proxy below needs access to ONE's Google Cloud project (`dev-fin-observatory`). What runs depends on which back ends you can reach:

- The static pages, `pnpm lint` and `pnpm typecheck` run with no configuration.
- The data search and graph pages call the DFO apis service at `SEARCH_API_BASE`. `.env.example` points it at `http://localhost:8083`, where ONE maintainers run a `gcloud run services proxy` to the dev deployment; that proxy needs an account with invoker access in `dev-fin-observatory`, as `docs/development.md` describes. Without that access, point it at your own `apis` instance.
- The Studio needs an `ai` harness at `STUDIO_API_BASE` (default `http://localhost:8080`) and a `STUDIO_TOKEN`, which ONE issues for its own deployments. Run the `ai` repository locally to use it.
- Accounts and saved conversations need local Postgres (`just db-up && just db-migrate`, which requires Docker) and your own OAuth client credentials for at least one sign-in provider.
- `pnpm test` needs the local Postgres but nothing from the cloud.

Without `DATABASE_URL`, the dev server logs a warning and keeps serving the pages that do not use the database. `docs/development.md` lists every variable and the full command set.

## Documentation

- [`docs/development.md`](docs/development.md): running locally, the database, code conventions, branches, releases and the deployed services.
- [`docs/feedback.md`](docs/feedback.md): the feedback endpoint (`POST /api/feedback`), its sinks and the local development loop.
- [`docs/analytics.md`](docs/analytics.md): usage events, Sentry and the Studio prompt allowance.
- [`deploy/README.md`](deploy/README.md): the image build, migrations on deploy, GitHub variables and the runtime environment contract.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT. See [LICENSE](LICENSE).
