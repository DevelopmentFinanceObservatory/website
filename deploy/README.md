# Deploy

GitHub Actions in this repo builds the `dfo-website` image (the Next.js app
in standalone output mode) and swaps it onto an existing Cloud Run service.
It never creates or reconfigures a service. `deploy.yml` deploys staging
on every push to `staging` that touches the image's inputs, and runs only
in the ONEcampaign copy of this repo. `deploy-prod.yml` deploys production
on every push to `main` (or a manual dispatch from `main`), and runs only
in the DevelopmentFinanceObservatory copy, whose `main` is a tree copy of a
ONEcampaign commit. Both call `build-migrate-deploy.yml`, so staging and
production run the same build, migration and deploy steps against their
own GitHub Environment. The sibling `dfo-infra` repo owns the Cloud Run
service and migration Job definitions (service account, scaling, secrets,
env vars) that these workflows target.

The deploy job checks the environment's vars and secrets before
authenticating to GCP, and fails with an error naming whatever is
missing.

## Image naming

```
${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/dfo-website:<tag>
```

`<tag>` is the full git SHA of the commit the workflow built. Each
environment builds into its own Artifact Registry repo (`AR_REPO` in its
GitHub Environment), and the migration Job and service are pointed at the
pushed image's digest rather than the tag.

## Schema migrations

Every deploy also runs a Cloud Run Job that applies the website
database's schema migrations before the service moves to the new image:
`build-migrate-deploy.yml` points the Job at the image it just pushed,
executes it with `--wait`, and only updates the service once the Job exits
0. A failed migration fails the deploy and leaves the service on its current
image. dfo-infra defines each environment's Job (named by
`MIGRATE_JOB_WEBSITE`, `dfo-dev-website-staging-migrate` on staging) and the
migrator identity it runs as. This repo owns the migrate entrypoint and the
migrations themselves, both under `db/`.

## Migration ordering

Running the Job to completion before the service update protects the new
image. It never starts against a schema it doesn't expect. It gives no such
protection to the old image, which keeps serving traffic for the entire
Job run and keeps serving it afterwards if the service update then fails. A
migration that removes or narrows something the old image still reads
breaks that revision as soon as the migration commits, and a failed
service update leaves the now-incompatible old revision live with no
automatic rollback.

The way to keep that gap closed is to spread a schema change that isn't
purely additive across separate deploys rather than making it in one.
Add the new column, table, or default in a migration the current code
doesn't yet use. Ship the code that reads or writes it in a later deploy,
once the addition has been live long enough that every revision still
running expects it. Remove whatever the old code used in a further deploy
after that, once nothing in the running image depends on it. Each of those
is its own migration and its own deploy. Combining an addition with the
removal it eventually enables reopens the gap this ordering exists to
close.

`build-migrate-deploy.yml` treats the Job as an opaque command with an exit
code. It has
no visibility into the statements a migration runs, so it cannot tell an
additive change from a destructive one, and no notion of which code
paths in the image still in service depend on what the schema currently
provides. Judging that a migration is safe for the revision it will run
against, and sequencing the schema change and the code change across the
right number of deploys, is the responsibility of whoever authors the
migration.

## GitHub vars and secrets

`build-migrate-deploy.yml` reads these from a GitHub Environment matching the
deploy
target (`staging`, `production`). Configure the same variable and secret
*names* in each environment with per-environment values. The workflow YAML
doesn't change between environments, only the environment it targets does.
These are the same names `dfo-ai` uses, except the service and migration Job
vars, so the `dfo-infra` foundation outputs slot into both repos the same way.

| Name                  | Kind   | Example value                                                                               | Who provides it                                     |
| --------------------- | ------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `WIF_PROVIDER`        | secret | `projects/123456789/locations/global/workloadIdentityPools/github/providers/github-actions` | dfo-infra (WIF pool/provider)                       |
| `WIF_SA`              | secret | `dfo-website-staging-deployer@dev-fin-observatory.iam.gserviceaccount.com`                  | dfo-infra (deployer service account)                |
| `REGION`              | var    | `northamerica-northeast1` (staging), `europe-west1` (production)                            | dfo-infra                                           |
| `PROJECT_ID`          | var    | `dev-fin-observatory` (staging)                                                             | dfo-infra                                           |
| `AR_REPO`             | var    | `dfo-website-staging` (staging)                                                             | dfo-infra (Artifact Registry repo, per environment) |
| `SERVICE_WEBSITE`     | var    | `dfo-dev-website-staging` (staging)                                                         | dfo-infra                                           |
| `MIGRATE_JOB_WEBSITE` | var    | `dfo-dev-website-staging-migrate` (staging)                                                 | dfo-infra (migration Cloud Run Job)                 |

The service names above are the ones dfo-infra defines; whatever appears in
its `website` stack outputs goes in this var verbatim.

## GCP prerequisites (dfo-infra)

For staging, dfo-infra has set up:

- A binding letting this repo's GitHub Actions impersonate the
  `dfo-website-staging-deployer` service account through the shared
  Workload Identity Federation pool and provider that already serves
  `dfo-ai` (foundation,
  [dfo-infra#7](https://github.com/ONEcampaign/dfo-infra/issues/7), closed),
  with the per-repo restriction at the SA binding.
- That deployer service account, with:
  - `roles/run.developer` (update Cloud Run services)
  - `roles/artifactregistry.writer` to push images
  - `roles/iam.serviceAccountUser` (act as the Cloud Run runtime SA, if
    that's a separate identity)
- The Cloud Run service for the `dfo-website` image, including its runtime
  service account, scaling config, env vars, and secrets. This repo's
  workflows only ever update the `--image` on the service that already
  exists.
- The `dfo-website-staging` Artifact Registry repo, in the
  `dev-fin-observatory` project.
- The `dfo-dev-website-staging-migrate` Job, its migrator service account,
  and the Postgres grants that account needs. `deploy.yml` only executes
  the Job dfo-infra already created.

Production needs the same set in its own project: a deployer service
account with the same roles, its own Artifact Registry repo, Cloud Run
service, and migration Job with its migrator identity.

## Runtime env contract (provisional)

The app defines the definitive contract once it exists. Known so far:

| Name (provisional)                    | What it is                                                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STUDIO_API_BASE`                     | The `dfo-ai` harness the `/api/studio/*` proxy forwards to; plain env var set by dfo-infra                                                                                  |
| `STUDIO_TOKEN`                        | Bearer token the studio proxy sends to the harness; secret reference set by dfo-infra                                                                                       |
| `SEARCH_API_BASE`                     | The `dfo-apis` Search, Datasets and graph APIs; required, a production server without it refuses to start; plain env var set by dfo-infra                                   |
| `MCP_API_TOKEN`                       | Bearer token the `/mcp` proxy sends to the harness; dfo-infra mounts it from Secret Manager (`dfo-dev-mcp-api-token`, the harness's own secret)                             |
| `CALLER_HMAC_KEY`                     | HMAC key for the client-IP digest `/mcp` sends as `x-dfo-caller`; unset, none is sent; secret set by dfo-infra                                                              |
| `TRUSTED_PROXY_HOPS`                  | Which `X-Forwarded-For` entry is the client, counted from the right; keys the `/api` rate limit and the `/mcp` caller digest; default 0 (Cloud Run's); +1 per load balancer |
| `WEBSITE_DB_INSTANCE_CONNECTION_NAME` | Cloud SQL instance the connector dials over PSC; set by dfo-infra                                                                                                           |
| `WEBSITE_DB_USER`                     | Runtime IAM database user; set by dfo-infra                                                                                                                                 |
| `WEBSITE_DB_NAME`                     | Database name; set by dfo-infra                                                                                                                                             |
| `BETTER_AUTH_SECRET`                  | Signs auth sessions; generated and stored in Secret Manager by dfo-infra                                                                                                    |
| `BETTER_AUTH_URL`                     | This app's own public origin; plain env var set by dfo-infra                                                                                                                |
| `GOOGLE_CLIENT_ID`                    | Google sign-in OAuth client ID; optional, from Secret Manager                                                                                                               |
| `GOOGLE_CLIENT_SECRET`                | Google sign-in OAuth client secret; optional, from Secret Manager                                                                                                           |

The public MCP URL is `/mcp`. Next redirects `/mcp/` to `/mcp` with a 308,
which keeps the method and body. The proxy forwards either form to the
harness's `/mcp/`.

The proxy forwards `content-type`, `accept` and every `mcp-*` request header
(`mcp-method` and `mcp-name` among them, which the harness checks against the
request body), and returns `content-type`, `content-disposition`,
`content-length`, `www-authenticate` and every `mcp-*` response header.
`x-dfo-caller` is set by the proxy, whatever the client sent. `authorization`
is set by the proxy only when `MCP_API_TOKEN` is set; otherwise the client's
own `authorization` header goes through to the harness. A malformed
`TRUSTED_PROXY_HOPS` stops a production server at startup. If one reaches a
running process (in dev), `/mcp` sends no caller and `/api` rate-limits every
client under one shared address, each with one error logged.

## Repo-side prerequisites

- The application itself, following the conventions in the root README
  (pnpm, `output: 'standalone'`, the `lint`/`typecheck`/`test`/`build`
  script contract).
- The migrate entrypoint and its migrations, both under `db/`. The
  Dockerfile bundles `db/migrate.ts` and copies `db/migrations` into every
  website image regardless of whether this deploy's Job runs it, so the
  Job can always run against whatever image it's pointed at.
- Branch protection matching `dfo-apis`, with `staging` in the role of its
  `dev` branch. `staging` is the default branch and requires a pull request
  (zero approvals) with the `ci` check passing, and blocks force pushes.
  `main` requires the `ci` check and blocks force pushes and deletion.
- The `staging` and `production` GitHub Environments, restricted to their
  own branch (`staging` to `staging`, `production` to `main`). `deploy.yml`
  maps branch to environment, so a branch with no matching environment
  fails the deploy with an explicit error rather than deploying somewhere
  wrong. The `staging` environment lives in the ONEcampaign repo and
  `production` in the DevelopmentFinanceObservatory repo. Environment
  required reviewers are not used, because the org's
  GitHub plan does not support them on private repos.
- The vars/secrets table above, populated per environment.
