# Deploy

GitHub Actions in this repo builds the `dfo-website` image (the Next.js app
in standalone output mode) and swaps it onto an existing Cloud Run service.
It never creates or reconfigures a service. `deploy.yml` deploys dev
on every push to `dev` that touches the image's inputs. `deploy-prod.yml`
deploys production on every push to `main` (or a manual dispatch from
`main`). Both call `build-migrate-deploy.yml`, so dev and production run
the same build, migration and deploy steps against their own GitHub
Environment. The sibling `infra` repo owns the Cloud Run
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
executes it with `--wait`, and only updates the service once the Job exits 0. A failed migration fails the deploy and leaves the service on its current
image. infra defines each environment's Job (named by
`MIGRATE_JOB_WEBSITE`, `dfo-dev-website-staging-migrate` on dev) and the
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

## Event export

In production a Cloud Run Job, `dfo-prod-website-export`, copies the
`event` table into the BigQuery table `event` in `EXPORT_BQ_DATASET`
(`website_export`) every hour. It runs the website image with the command
`node dist/export-events.cjs` (`db/export-events.ts`, bundled by
`pnpm build:export-events`). `build-migrate-deploy.yml` points it at each
new image after the service update, only where `EXPORT_JOB_WEBSITE` is
set. infra defines the Job, its identity, the dataset and the schedule.

The Job reads the database as its own IAM user, a member of the NOLOGIN
role `website_export_reader`, which migration `0019_event_export_grant`
grants `SELECT` on `event` alone. infra creates the role in every tier, so
its apply must land before the deploy that first carries the migration.

| Env var                                                                     | What it is                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `WEBSITE_DB_INSTANCE_CONNECTION_NAME`, `WEBSITE_DB_NAME`, `WEBSITE_DB_USER` | The database as the service reads it, `DATABASE_URL` locally |
| `EXPORT_BQ_PROJECT`                                                         | The BigQuery project                                         |
| `EXPORT_BQ_DATASET`                                                         | The BigQuery dataset                                         |
| `EXPORT_ID_HMAC_KEY`                                                        | Key for the visitor and user id digests                      |

Each run replaces every UTC day from the latest day in the table minus one
through today, so a missed run is made up by the next one. When the table
is empty or missing, the Job creates it and loads every day from the first
event. The run also replaces every earlier day whose count of `event` rows
differs from its partition's row count. It takes both counts per day up
front, one `GROUP BY` over the whole `event` table and one over the
BigQuery table's `created_at` column. Each day is read in pages into a
scratch file, then loaded into its partition (`event$YYYYMMDD`,
`WRITE_TRUNCATE`, `ALLOW_FIELD_ADDITION`, so a column added to the schema
reaches the table on the next load). A replace never shrinks a partition.
Nothing deletes `event` rows, and they carry no foreign key to `user`, so
deleting an account leaves them in place. A day that reads fewer rows than
its partition holds is therefore a fault, such as a wrong database, an
emptied table or a lagging replica. That day keeps its partition, the
other days still load, and the run then fails naming each short day with
both counts, as it does for a day that reads fewer rows than its source
count from the start of the run, whatever its partition holds. Its counts
still differ, so the day stays in every later run, however many later days
load, and fails each one until it matches. The Job's failure alert
therefore fires on every run until the export is complete. A day that
reads no rows and holds none loads nothing. The Job logs each day as it
finishes. A failure names the day it failed on and any short day before
it, and that day keeps its partition as it was. A database query that runs
past 5 minutes fails the run (`statement_timeout` on the Job's pool), and
so does a BigQuery count job that bills more than 1 GB, about 125 million
rows, or runs past 2 minutes (`maximumBytesBilled` and `jobTimeoutMs`),
all well inside the Job's 1800 s task timeout.

The table is partitioned by day on `created_at`:

| Column         | Type      | Value                                                                           |
| -------------- | --------- | ------------------------------------------------------------------------------- |
| `id`           | INT64     | `event.id`                                                                      |
| `created_at`   | TIMESTAMP | `event.created_at`                                                              |
| `name`         | STRING    | `event.name`                                                                    |
| `page`         | STRING    | `event.page` without its query string or fragment, a share id as `:id`, or null |
| `signed_in`    | BOOL      | whether `user_id` is set                                                        |
| `visitor_hash` | STRING    | HMAC-SHA256 hex of `visitor_id`, null without one                               |
| `user_hash`    | STRING    | HMAC-SHA256 hex of `user_id`, null without one                                  |
| `props`        | JSON      | the event's allow-listed props, `shareId` as its HMAC-SHA256 hex                |

`page` keeps a path only when it is a slash followed by letters, digits
and `_ - . : /`, up to 300 characters, the characters the site's routes
use (`PAGE_PATH` in `db/event-export.ts`). Any other text the browser
posts as its page exports as null. The id in `/s/<id>`, `/embed/<id>` and
the pages under them exports as `:id`, since a share id opens its share.

`PROP_RULES` in `db/event-export.ts` lists the props each event keeps:
enums, booleans, counts and ids, each checked against its rule, since the
browser posts its own props. Search query text, refused terms, card units
and every list or nested object stay in Postgres. `shareId` exports as
its HMAC-SHA256 hex under `EXPORT_ID_HMAC_KEY`, so share, embed and
search events still join on it. A new event name fails
the typecheck until it has an entry there. Changing `EXPORT_ID_HMAC_KEY`
changes every digest, so drop the BigQuery table afterwards and let the
next run reload it.

## GitHub vars and secrets

`build-migrate-deploy.yml` reads these from a GitHub Environment matching the
deploy
target (`dev`, `production`). Configure the same variable and secret
_names_ in each environment with per-environment values. The workflow YAML
doesn't change between environments, only the environment it targets does.
These are the same names `ai` uses, except the service and migration Job
vars, so the `infra` foundation outputs slot into both repos the same way.

| Name                  | Kind   | Example value                                                                               | Who provides it                                 |
| --------------------- | ------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `WIF_PROVIDER`        | secret | `projects/123456789/locations/global/workloadIdentityPools/github/providers/github-actions` | infra (WIF pool/provider)                       |
| `WIF_SA`              | secret | `dfo-website-staging-deployer@dev-fin-observatory.iam.gserviceaccount.com`                  | infra (deployer service account)                |
| `REGION`              | var    | `northamerica-northeast1` (dev), `europe-west1` (production)                                | infra                                           |
| `PROJECT_ID`          | var    | `dev-fin-observatory` (dev)                                                                 | infra                                           |
| `AR_REPO`             | var    | `dfo-website-staging` (dev)                                                                 | infra (Artifact Registry repo, per environment) |
| `SERVICE_WEBSITE`     | var    | `dfo-dev-website-staging` (dev)                                                             | infra                                           |
| `MIGRATE_JOB_WEBSITE` | var    | `dfo-dev-website-staging-migrate` (dev)                                                     | infra (migration Cloud Run Job)                 |
| `EXPORT_JOB_WEBSITE`  | var    | `dfo-prod-website-export` (production only)                                                 | infra (event export Cloud Run Job)              |

The service names above are the ones infra defines; whatever appears in
its `website` stack outputs goes in this var verbatim.

## GCP prerequisites (infra)

For dev, infra has set up:

- A binding letting this repo's GitHub Actions impersonate the
  `dfo-website-staging-deployer` service account through the shared
  Workload Identity Federation pool and provider that already serves
  `ai` (foundation), with the per-repo restriction at the SA binding.
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
  the Job infra already created.

Production needs the same set in its own project: a deployer service
account with the same roles, its own Artifact Registry repo, Cloud Run
service, and migration Job with its migrator identity.

## Runtime env contract (provisional)

The app defines the definitive contract once it exists. Known so far:

| Name (provisional)                    | What it is                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STUDIO_API_BASE`                     | The `dfo-ai` harness the `/api/studio/*` proxy forwards to; plain env var set by infra                                                                                                                  |
| `STUDIO_TOKEN`                        | Bearer token the studio proxy sends to the harness; secret reference set by infra                                                                                                                       |
| `SEARCH_API_BASE`                     | The `dfo-apis` Search, Datasets and graph APIs; required, a production server without it refuses to start; plain env var set by infra                                                                   |
| `MCP_API_TOKEN`                       | Bearer token the `/mcp` proxy sends to the harness; infra mounts it from Secret Manager (`dfo-dev-mcp-api-token`, the harness's own secret)                                                             |
| `CALLER_HMAC_KEY`                     | HMAC key for the client-IP digest `/mcp` sends as `x-dfo-caller`; unset, none is sent; secret set by infra                                                                                              |
| `RATE_LIMIT_WINDOW_S`                 | Rate-limit window in seconds; default 60                                                                                                                                                                |
| `RATE_LIMIT_API`                      | Calls per window per address on `/api`; default 120                                                                                                                                                     |
| `RATE_LIMIT_PIN`                      | Calls per window per address on `/api/download-pin`; default 10                                                                                                                                         |
| `RATE_LIMIT_MCP`                      | Requests per window per address on `/mcp`; default 300, above `/api` because a vendor's address can carry many users                                                                                    |
| `OPENAI_APPS_CHALLENGE`               | OpenAI's domain-verification token; `/.well-known/openai-apps-challenge` serves it as plain text, 404 while unset                                                                                       |
| `TRUSTED_PROXY_HOPS`                  | Which `X-Forwarded-For` entry is the client, counted from the right; keys the `/api` and `/mcp` limits, the guest Studio allowance and the caller digest; default 0 (Cloud Run's); +1 per load balancer |
| `WEBSITE_DB_INSTANCE_CONNECTION_NAME` | Cloud SQL instance the connector dials over PSC; set by infra                                                                                                                                           |
| `WEBSITE_DB_USER`                     | Runtime IAM database user; set by infra                                                                                                                                                                 |
| `WEBSITE_DB_NAME`                     | Database name; set by infra                                                                                                                                                                             |
| `BETTER_AUTH_SECRET`                  | Signs auth sessions; generated and stored in Secret Manager by infra                                                                                                                                    |
| `BETTER_AUTH_URL`                     | This app's own public origin; plain env var set by infra                                                                                                                                                |
| `GOOGLE_CLIENT_ID`                    | Google sign-in OAuth client ID; optional, from Secret Manager                                                                                                                                           |
| `GOOGLE_CLIENT_SECRET`                | Google sign-in OAuth client secret; optional, from Secret Manager                                                                                                                                       |

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
running process (in dev), `/mcp` sends no caller and `/api` and `/mcp` rate-limit
every client under one shared address, each with one error logged.

## Repo-side prerequisites

- The application itself, following the conventions in `docs/development.md`
  (pnpm, `output: 'standalone'`, the `lint`/`typecheck`/`test`/`build`
  script contract).
- The migrate entrypoint and its migrations, both under `db/`. The
  Dockerfile bundles `db/migrate.ts` and copies `db/migrations` into every
  website image regardless of whether this deploy's Job runs it, so the
  Job can always run against whatever image it's pointed at.
- Branch protection matching `apis`. `dev` is the default branch and
  requires a pull request (zero approvals) with the `ci` check passing, and
  blocks force pushes. `main` requires one approval and the `ci` check, and
  blocks force pushes and deletion.
- The `dev` and `production` GitHub Environments, restricted to their own
  branch (`dev` to `dev`, `production` to `main`). `production` requires
  approval from the `release` reviewers. `deploy.yml` maps branch to
  environment, so a branch with no matching environment fails the deploy
  with an explicit error rather than deploying somewhere wrong.
- The vars/secrets table above, populated per environment.
