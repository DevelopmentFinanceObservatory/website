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

In production a Cloud Run Job, `dfo-prod-website-export`, copies the `event` table into the BigQuery table `event` in `EXPORT_BQ_DATASET` (`website_export`) every hour. It runs the website image with the command `node dist/export-events.cjs` (`db/export-events.ts`, bundled by `pnpm build:export-events`). `build-migrate-deploy.yml` points it at each new image after the service update, only where `EXPORT_JOB_WEBSITE` is set. infra defines the Job, its identity, the dataset and the schedule.

The Job reads the database as its own IAM user, a member of the NOLOGIN role `website_export_reader`, which migration `0019_event_export_grant` grants `SELECT` on `event`, migration `0020_account_daily` on the view `account_daily`, and migration `0021_account_daily_before_today` on the view `account_daily_source`, and on nothing else. infra creates the role in every tier, so its apply must land before the deploy that first carries the migration.

| Env var                                                  | What it is                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `WEBSITE_DB_INSTANCE_CONNECTION_NAME`, `WEBSITE_DB_NAME` | The database the Job reads, `DATABASE_URL` locally                        |
| `WEBSITE_DB_USER`                                        | The exporter's own IAM database user, a member of `website_export_reader` |
| `EXPORT_BQ_PROJECT`                                      | The BigQuery project                                                      |
| `EXPORT_BQ_DATASET`                                      | The BigQuery dataset                                                      |
| `EXPORT_ID_HMAC_KEY`                                     | Key for the visitor and user id digests                                   |

Each run replaces every UTC day from the latest day in the table minus one through today, so a missed run is made up by the next one. When the table is empty or missing, the Job creates it and loads every day from the first event. The run also replaces every earlier day whose count of `event` rows differs from its partition's row count. It takes both counts per day up front, one `GROUP BY` over the whole `event` table and the partitions' row counts from the dataset's `INFORMATION_SCHEMA.PARTITIONS`, which reads table metadata and scans no rows. Each day is read in pages, in `created_at` and id order with each page starting after the last row of the one before, and only with the prop keys `PROP_RULES` keeps. The pages go to a scratch file, then load into the day's partition (`event$YYYYMMDD`, `WRITE_TRUNCATE`, `ALLOW_FIELD_ADDITION`). A load adds a new NULLABLE column to the table, and fails on a new REQUIRED one, so `ExportField` in `db/event-export.ts` lets a column be REQUIRED only if the table was created with it.

The scratch file sits in `os.tmpdir()`, which on Cloud Run is in memory, so a run holds one page of rows plus one day's file, about 360 bytes an event. The busiest day so far holds 1,434 events, about 0.5 MB, against the Job's 512 MiB. The file is written in full before its load starts, so a day loads only once it has been read to its end.

A replace never shrinks a partition. Nothing deletes `event` rows, and they carry no foreign key to `user`, so deleting an account leaves them in place. A day that reads fewer rows than its partition holds is therefore a fault, such as a wrong database, an emptied table or a lagging replica. That day keeps its partition, the other days still load, and the run then fails naming each short day with both counts, as it does for a day that reads fewer rows than its source count from the start of the run, whatever its partition holds. Its counts still differ, so the day stays in every later run, however many later days load, and fails each one until it matches. The Job's failure alert therefore fires on every run until the export is complete. A day that reads no rows and holds none loads nothing.

A day whose read or load fails keeps its partition as it was, and the later days still load. The run then fails naming every such day with its error, and any short day. The Job logs each day as it finishes. A database query that runs past 5 minutes fails its day (`statement_timeout` on the Job's pool); a query that fails outside a day's read, such as the per-day count, fails the run. A BigQuery query that bills more than 1 GB or runs past 2 minutes fails the run (`maximumBytesBilled` and `jobTimeoutMs`). The stale-day query scans about 74 bytes an event row, so it reaches the 1 GB cap at about 13.5 million rows, and the run then fails with an error naming the cap. Days that each wait out a 5 minute timeout could outlast the Job's 1800 s task timeout, so a run starts no new day once 20 minutes have passed since it began (`EXPORT_BUDGET_MS` in `db/event-export.ts`). It finishes the day in hand, then fails naming every day it did not reach, with any failed or short day, and the next run picks those days up.

Every row carries in `export_rules` a digest of what shapes it (`exportRules` in `db/event-export.ts`): `PROP_RULES`, `PAGE_PATH`, `SHARE_PATH`, the token rule, the schema, `ROW_SHAPE_VERSION` and an HMAC of a fixed string under `EXPORT_ID_HMAC_KEY`. `ROW_SHAPE_VERSION` is bumped by hand with any change to the functions that build a row. Each run finds the days holding a row with another digest, or none, in one query over the `created_at` and `export_rules` columns, and replaces those days too. A change to the rules or the key thus reaches every partition. A day that fails keeps its old rows, so the next run retries it with the window days and the count-mismatch days, and reloads no day that is already current.

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
| `export_rules` | STRING    | the digest of the rules the row was exported under                              |

`page` keeps a path only when it is a slash followed by letters, digits and `_ - . : /`, up to 300 characters, the characters the site's routes use (`PAGE_PATH` in `db/event-export.ts`). Any other text the browser posts as its page exports as null. The id in `/s/<id>`, `/embed/<id>` and the pages under them exports as `:id`, since a share id opens its share.

`PROP_RULES` in `db/event-export.ts` lists the props each event keeps: enums, booleans, counts and ids, each checked against its rule, since the browser posts its own props. Search query text, refused terms, card units and every list or nested object stay in Postgres. `shareId` exports as its HMAC-SHA256 hex under `EXPORT_ID_HMAC_KEY`, so share, embed and search events still join on it. A new event name fails the typecheck until it has an entry there. Changing `EXPORT_ID_HMAC_KEY` changes every digest and the rules digest with them, so the next run reloads every day.

### Accounts

Each run first replaces the BigQuery table `account_daily` with every row of the Postgres view `account_daily` (`db/account-export.ts`), in one `WRITE_TRUNCATE` load job, so a failed run leaves the previous table. The event export still runs when it fails, and the run then fails too. The view runs with the migrator's rights, so the Job reads accounts per day and organisation and no email address or user id. It holds every UTC day from the first account's through yesterday's, so the latest day is the last complete one, and a day without new accounts is one row with a null `organisation` and 0 `accounts`. It counts only the accounts created before today, UTC, so a domain it names holds at least 3 of the accounts the export carries.

| Column         | Type   | Value                                                                                                                                                                                                                 |
| -------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `day`          | DATE   | the UTC date of `user.created_at`                                                                                                                                                                                     |
| `organisation` | STRING | `Personal email` for a webmail domain, else the lower-cased domain after the last `@` once it holds at least 3 accounts, else `Other organisations`; null on a day without new accounts, whose one row has 0 accounts |
| `accounts`     | INT64  | the accounts created that day, 0 on a day without new accounts                                                                                                                                                        |

A domain in `webmail_domain` is `Personal email` whatever its count. The table holds the `free-email-domains` package's list, which `db/migrate.ts` writes after the migrations on every deploy, so bumping the package updates it. pnpm skips the package's postinstall script, which would refetch the list.

A read with no rows fails the run and leaves the table as it was while `webmail_domain` is empty, since the view then holds no rows and webmail domains would show by name, and while the user table holds no account, which is a wrong database or an emptied table. When accounts exist and every one is from today, the run replaces the table with no rows, so a deleted account and the organisation it named leave the export. The view `account_daily_source` tells the cases apart, and the Job reads it in the same transaction as `account_daily`.

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
