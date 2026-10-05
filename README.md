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
  with `dfo-infra`. They define the Cloud Run service, and this repo's CI
  only swaps images onto it.
- `db/` holds the schema migration runner: a Cloud Run Job connects to the
  website databases as an IAM service account through the Cloud SQL
  connector and applies forward-only migrations before each deploy moves
  the service to a new image.
- `.github/workflows/` holds the CI and deploy workflows. CI runs `lint`,
  `typecheck`, `test`, and `build` on every PR. The deploy workflow runs
  on pushes to `staging` that touch the image's inputs.
- `docs/development.md` — how to run the app locally and the conventions
  the code follows (styles, components, animation system).
- `docs/feedback.md` — the feedback endpoint (`POST /api/feedback`): the
  frontend contract, the storage/Slack/email sinks and their config, and
  the local dev loop.
- `docs/analytics.md` — usage events (the `event` table and what each
  surface records), Sentry, and the guest Studio limit.

## Repo map

| Repo                                                          | What it is                                                                                                                                                             |
|---------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [`dfo-dcp`](https://github.com/ONEcampaign/dfo-dcp)           | The knowledge graph engine, ONE's fork of Data Commons, serving the graph over the mixer and SDMX APIs.                                                                |
| [`dfo-apis`](https://github.com/ONEcampaign/dfo-apis)         | The Search, Datasets, Graph, and Presentation APIs. The Search, Datasets, and Graph APIs read from the `dfo-dcp` graph, and the Presentation API persists to PostgreSQL. |
| [`dfo-ai`](https://github.com/ONEcampaign/dfo-ai)             | The agent harness and the DFO's MCP servers, deployed as one Cloud Run service.                                                                                        |
| [`dfo-spec-kit`](https://github.com/ONEcampaign/dfo-spec-kit) | Shared spec models (spec-id hashing, materialisation, manifest and component-spec schemas) that publish the TS types this app renders from [forthcoming].              |
| [`dfo-website`](https://github.com/ONEcampaign/dfo-website)   | This repo, the public Next.js site and the proxy that fronts the platform for external traffic.                                                                        |
| [`dfo-skills`](https://github.com/ONEcampaign/dfo-skills)     | The open repository of domain-knowledge packages agents load dynamically at runtime [forthcoming].                                                                     |
| [`dfo-infra`](https://github.com/ONEcampaign/dfo-infra)       | Infrastructure as code: the Cloud Run service definitions, service accounts, scaling, and secrets.                                                                     |

## Deployed services

All services run in the `dev-fin-observatory` GCP project, region
`northamerica-northeast1`.

| Repo          | Service                                                          |
|---------------|------------------------------------------------------------------|
| `dfo-website` | https://dfo-dev-website-staging-zms5lj4zhq-nn.a.run.app          |
| `dfo-apis`    | https://dfo-dev-apis-zms5lj4zhq-nn.a.run.app/docs                |
| `dfo-ai`      | https://dfo-dev-ai-zms5lj4zhq-nn.a.run.app/docs                  |
| `dfo-dcp`     | https://dfo-dev-dc-datacommons-service-zms5lj4zhq-nn.a.run.app   |

`dfo-website`'s service is the one `staging` deploys to. `dfo-apis`,
`dfo-ai`, and `dfo-dcp` run their own dev services. `dfo-apis` and
`dfo-ai` return 404 at the root and serve Swagger UI at `/docs`. The
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
staging service automatically on every push to `staging`. `main` is the
production release branch. It only ever fast-forwards to a validated
`staging` commit and never auto-deploys. Production deploys through a
manual `workflow_dispatch` that promotes the image already built for that
commit.
`dfo-infra` owns the Cloud Run service *definition* (service account,
scaling, secrets, env vars). This repo's CI only swaps images on the
service `dfo-infra` already defined. See `deploy/README.md` for the
vars/secrets and prerequisites.

## Contributing

`staging` is the default branch. Branch off it and open a pull request
into it. The `ci` check has to pass before the PR merges, and force-pushes
are blocked. Each merge deploys to staging.

`main` is production, the same model `dfo-apis` uses with `dev` in place
of `staging`. Nobody opens pull requests into it. To release:

1. Confirm the `staging` commit you want is deployed and validated on the
   staging service.
1. Fast-forward `main` to it with `git push origin <sha>:main`. Because
   `staging` contains everything on `main`, this is always a clean
   fast-forward.
1. Tag it: `git tag prod-YYYY-MM-DD <sha> && git push origin prod-YYYY-MM-DD`.
1. Promote the image: `just deploy-prod <sha>`.

The SHA must be one `deploy.yml` built an image for, so pick the commit
the staging service is running, not a later docs-only commit. `main`
requires the `ci` check and blocks force-pushes and deletion, so it can
only move forward.
