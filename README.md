# dfo-website

The public site of the Development Finance Observatory (DFO). A single
Next.js application serves the frontend (chat and canvas workspace,
reference pages) and acts as the backend proxy for **all** API traffic to
the platform, including MCP. This is not the DFO brochure website, the small
live site that gets archived at launch.

## Status: in progress

The application code lands in slices as Ode builds it; the homepage, the
data search, the Studio and user accounts are in.
Around it:

- `deploy/` holds the Dockerfile pattern and the division of responsibility
  with `infra`. They define the Cloud Run service, and this repo's CI
  only swaps images onto it.
- `db/` holds the schema migration runner: a Cloud Run Job connects to the
  website databases as an IAM service account through the Cloud SQL
  connector and applies forward-only migrations before each deploy moves
  the service to a new image.
- `.github/workflows/` holds the CI and deploy workflows. CI runs `lint`,
  `typecheck`, `test`, and `build` on every PR that is not a draft, and on
  each push to `dev`. The deploy workflow runs on pushes to `dev`
  that touch the image's inputs.
- `docs/development.md` — how to run the app locally and the conventions
  the code follows (styles, components, animation system).
- `docs/feedback.md` — the feedback endpoint (`POST /api/feedback`): the
  frontend contract, the storage/Slack/email sinks and their config, and
  the local dev loop.
- `docs/analytics.md` — usage events (the `event` table and what each
  surface records), Sentry, and the guest Studio limit.

## Repo map

| Repo                                                                    | What it is                                                                                                                                                           |
|-------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [`dcp`](https://github.com/DevelopmentFinanceObservatory/dcp)           | The knowledge graph engine, ONE's fork of Data Commons, serving the graph over the mixer and SDMX APIs.                                                              |
| [`apis`](https://github.com/DevelopmentFinanceObservatory/apis)         | The Search, Datasets, Graph, and Presentation APIs. The Search, Datasets, and Graph APIs read from the `dcp` graph, and the Presentation API persists to PostgreSQL. |
| [`ai`](https://github.com/DevelopmentFinanceObservatory/ai)             | The agent harness and the DFO's MCP servers, deployed as one Cloud Run service.                                                                                      |
| [`spec-kit`](https://github.com/DevelopmentFinanceObservatory/spec-kit) | Shared spec models (spec-id hashing, materialisation, manifest and component-spec schemas) that publish the TS types this app renders from [forthcoming].            |
| [`website`](https://github.com/DevelopmentFinanceObservatory/website)   | This repo, the public Next.js site and the proxy that fronts the platform for external traffic.                                                                      |
| [`skills`](https://github.com/DevelopmentFinanceObservatory/skills)     | The open repository of domain-knowledge packages agents load dynamically at runtime [forthcoming].                                                                   |
| [`infra`](https://github.com/DevelopmentFinanceObservatory/infra)       | Infrastructure as code: the Cloud Run service definitions, service accounts, scaling, and secrets.                                                                   |

## Deployed services

All services run in the `dev-fin-observatory` GCP project, region
`northamerica-northeast1`.

| Repo      | Service                                                        |
|-----------|----------------------------------------------------------------|
| `website` | https://dfo-dev-website-staging-zms5lj4zhq-nn.a.run.app        |
| `apis`    | https://dfo-dev-apis-zms5lj4zhq-nn.a.run.app/docs              |
| `ai`      | https://dfo-dev-ai-zms5lj4zhq-nn.a.run.app/docs                |
| `dcp`     | https://dfo-dev-dc-datacommons-service-zms5lj4zhq-nn.a.run.app |

`website`'s service is the one `dev` deploys to. `apis`, `ai`, and `dcp`
run their own dev services. `apis` and `ai` return 404 at the root and serve Swagger UI at `/docs`. The
website service is reachable by anyone with the URL.

## Conventions

Changing any of these is fine — change the workflows and `deploy/Dockerfile`
in the same PR.

- **pnpm** as the package manager, with a committed `pnpm-lock.yaml` and a
  `packageManager` field in `package.json`. `ci.yml`'s pnpm setup reads its
  version from that field and fails without it.
- **TypeScript, strict**, Next.js App Router.
- `package.json` defines `lint`, `typecheck`, `test`, and `build` scripts.
  That is the contract `ci.yml` runs.
- `next.config.*` sets `output: 'standalone'`, so `deploy/Dockerfile` can
  copy the standalone server into the runtime image.

## Deploys

GitHub Actions builds the `dfo-website` image and updates the Cloud Run
dev service automatically on every push to `dev`. `main` is the
production release branch. A push to `main` builds and deploys production
through the `production` GitHub Environment, which needs approval from the
release reviewers.
`infra` owns the Cloud Run service *definition* (service account,
scaling, secrets, env vars). This repo's CI only swaps images on the
service `infra` already defined. See `deploy/README.md` for the
vars/secrets and prerequisites.

## Contributing

`dev` is the default branch. Branch off it and open a pull request
into it. The `ci` check has to pass before the PR merges, and force-pushes
are blocked. Each merge deploys to the dev service.

`main` is production, the same model `apis` uses. To release:

1. Confirm the `dev` commit you want is deployed and validated on the
   dev service.
1. Open a pull request from `dev` into `main`. `main` requires one approval
   and the `ci` check, and blocks force-pushes and deletion.
1. Merge it. `deploy-prod.yml` builds and deploys that commit once the
   release reviewers approve the `production` environment.
1. Tag it: `git tag prod-YYYY-MM-DD <sha> && git push origin prod-YYYY-MM-DD`.
