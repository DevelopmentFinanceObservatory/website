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

The Job reads the database as its own IAM user, a member of the NOLOGIN role `website_export_reader`, which migration `0019_event_export_grant` grants `SELECT` on `event`, migration `0020_account_daily` on the view `account_daily`, migration `0021_account_daily_before_today` on the view `account_daily_source`, migration `0025_account_organisation` on the view `account_organisation`, and migration `0026_conversation_export` on the view `conversation_export`, and on nothing else. infra creates the role in every tier, so its apply must land before the deploy that first carries the migration.

| Env var                                                  | What it is                                                                                                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WEBSITE_DB_INSTANCE_CONNECTION_NAME`, `WEBSITE_DB_NAME` | The database the Job reads, `DATABASE_URL` locally                                                                                                                          |
| `WEBSITE_DB_USER`                                        | The exporter's own IAM database user, a member of `website_export_reader`                                                                                                   |
| `EXPORT_BQ_PROJECT`                                      | The BigQuery project                                                                                                                                                        |
| `EXPORT_BQ_DATASET`                                      | The BigQuery dataset                                                                                                                                                        |
| `EXPORT_BQ_LOCATION`                                     | The dataset's location (`EU`). Infra sets it. When it is unset, the Job reads the location from the dataset at start, one bounded call that fails both exports if it fails. |
| `EXPORT_ID_HMAC_KEY`                                     | Key for the visitor and user id digests, `account_organisation`'s and `conversation`'s too                                                                                  |

Each run replaces every UTC day from the latest day in the table minus one through today, so a missed run is made up by the next one. When the table is empty or missing, the Job creates it and loads every day from the first event. The run also replaces every earlier day whose count of `event` rows differs from its partition's row count. It takes both counts per day up front: one `GROUP BY` over the whole `event` table in Postgres, and one query over the BigQuery table that counts each day's rows and finds its stale days (below). The window days load first, oldest first, then the earlier days, oldest first, so yesterday and today load before any backlog. Each day is read in pages, in `created_at` and id order with each page starting after the last row of the one before, and only with the prop keys `PROP_RULES` keeps. A page shorter than the page size ends the day's read. The pages go to a scratch file, then load into the day's partition (`event$YYYYMMDD`, `WRITE_TRUNCATE`, `ALLOW_FIELD_ADDITION`). A load adds a new NULLABLE column to the table, and fails on a new REQUIRED one, so `ExportField` in `db/event-export.ts` lets a column be REQUIRED only if the table was created with it.

The scratch files sit in `os.tmpdir()`, which on Cloud Run is in memory. The event export and the account export run at once, so a run holds both together: the event export's one page of rows and one day's file, about 360 bytes an event, and the account export's read rows and one table's file. The busiest day so far holds 1,434 events, about 0.5 MB, against the Job's 512 MiB. The file is written in full before its load starts, so a day loads only once it has been read to its end.

A replace never shrinks a partition. Nothing deletes `event` rows, and they carry no foreign key to `user`, so deleting an account leaves them in place. A day that reads fewer rows than its partition holds is therefore a fault, such as a wrong database, an emptied table or a lagging replica. That day keeps its partition, the other days still load, and the run then fails naming each short day with both counts, as it does for a day that reads fewer rows than its source count from the start of the run, whatever its partition holds. Its counts still differ, so the day stays in every later run, however many later days load, and fails each one until it matches. The Job's failure alert therefore fires on every run until the export is complete. A day that reads no rows and holds none loads nothing.

A day whose read fails keeps its partition as it was. A day whose load fails is logged with what BigQuery confirms its partition holds, `kept` or `unknown` (below). Either way the later days still load. The run then fails naming every such day with its error, and any short day. The Job logs each day as it finishes, and a failure outside a day's read or load, such as the per-day count, fails the run. Either way the Job logs one error naming each phase's step, and exits 1 (`runAndExit` in `db/event-export.ts`). A BigQuery query that bills more than 1 GB fails the run (`maximumBytesBilled`). The BigQuery query that counts each day and finds its stale days scans about 74 bytes an event row, so it reaches the 1 GB cap at about 13.5 million rows, and the run then fails with an error naming the cap.

Every call the Job makes has its own time bound, and a call past it fails its day or its phase:

- a database connection, 30 seconds (`connectionTimeoutMillis`, `CONNECTION_TIMEOUT_MS` in `db/bounded.ts`);
- each database statement, a BEGIN or COMMIT included, on the Job's two pools (`exportPool` in `db/bounded.ts`): 5 minutes on the server for the event export's statements (`statement_timeout`, `EVENT_STATEMENT_MS` in `db/event-export.ts`) and 2 minutes for the account export's (`ACCOUNT_STATEMENT_MS` in `db/account-export.ts`), and 5 seconds more on the Job's side (`query_timeout`) for a connection that stalls where the server's timeout cannot reach it. Both bounds are set wide, with no measurement behind them, and each run logs how long the per-day count and each account read took;
- a day's page queries, 90 seconds from the day's start, after which no page starts and the day fails;
- a BigQuery query, 2 minutes on the server (`jobTimeoutMs`) and 5 seconds more on the Job's side, as for each table read or create (`exportBigQuery` in `db/bounded.ts`);
- a load, the account export's three included, 2 minutes. Each load runs under a job id the Job chooses, in the dataset's location (`EXPORT_BQ_LOCATION`, or the dataset's own when that is unset, read once in one call bounded like a table read, `exportBigQuery` in `db/bounded.ts`). A run whose dataset location cannot be found fails before either export starts. The job's insert and its file go in one request, which BigQuery acts on only once it holds the whole body, and the body ends only once the Job has read the file to its end. The client shows nothing of what it has sent before BigQuery answers, and it and the kernel take in a file of up to about 512 KiB (about 1,400 events) whole before the server reads any of it, the size set by the socket buffers, so such a file's read ends at once and says nothing of the send. A load created no job, and leaves its table `kept` at once with no cancel, when its scratch file cannot be read, when the Job cannot get credentials for it within those 2 minutes (the client gets them before it sends any byte), when its upload fails before the Job read its file to the end, when its host is not found or refuses the connection, when BigQuery answers the job insert with a 401 or 403, and when it answers with a 400 or 404 and the job id then reads as unknown to BigQuery. A load whose request failed in any other way after its body ended, such as a connection reset, may have reached BigQuery whole, so its job's state is read until those 2 minutes end. A load whose job BigQuery has not confirmed finished by then, whether its client is still waiting or failed earlier, is cancelled, the cancel waited for at most 10 seconds, and its job's state then read for at most 20 seconds, 150 seconds in all (`LOAD_SLOT_MS`). An upload BigQuery has not answered by the end of those 2 minutes is first aborted. One aborted before the Job read its file to the end created no job and leaves the table `kept` at once, with no cancel. One aborted later may have reached BigQuery whole and create its job after BigQuery refused the cancel with a 404, so while the last cancel was refused that way, each read in those 20 seconds that finds the job running sends another, waited for at most half the time left, and the job's state is read again once it is answered or that half passes. A job with no confirmed final state by then leaves its table `unknown`, including one BigQuery creates after the last read. A job that BigQuery confirms DONE without an error replaced its table, and the load counts as loaded. Any other load fails, logged with what its table holds: `kept` for a job DONE with an error, and `unknown` for anything else, such as a job still running, a job id BigQuery does not know after a request that got no answer, or a state that cannot be read (`loadWithin` in `db/bounded.ts`). A load that throws instead of returning its outcome also leaves its table `unknown`, and the next day or table still loads (`settleLoad`).

A statement past its bound on the Job's side leaves its connection mid-query, and a failed transaction leaves it open, so the Job destroys that connection and the next call opens a new one (`exportDb` in `db/bounded.ts`). The event export and the account export run at once, each on its own pool of one connection and its own scratch file, so a call that stalls in one phase costs that phase alone. The account export's reads and loads take at most 21 minutes: a connection and five statements for the first read, a connection and one statement for the second, and three loads. The Job stops a run still going 28 minutes after its start (`JOB_DEADLINE_MS`), two minutes before the task timeout, whatever call is in flight. It logs one error naming each phase's step (the day counts, a named day's read or load, an account read or load, `done`, or `failed` with the phase's error), the loads it stopped, whose outcome is unknown, the days not started, and the failed and short days and failed tables so far, after the lines each finished day already logged, and exits 1. The event export starts a day only while that day's worst case, 575 seconds (`DAY_WORST_MS`: 90 seconds of pages, 335 seconds for a last page and its connection, and 150 seconds for the load), still ends 5 seconds before that deadline (`REPORT_MARGIN_MS`), so no day's load is in flight when it fires. The window days run first, so a run stopped this way reaches yesterday and today before the backlog. The days it did not start are logged, fail the run, and wait for the next hourly run. The Job also exits as soon as the run ends, which closes the pools, the connector and any socket still open.

Every row carries in `export_rules` a digest of what shapes it (`exportRules` in `db/event-export.ts`): `PROP_RULES`, `PAGE_PATH`, `SHARE_PATH`, the token rule, the schema, the SQL that reads a day's page, `ROW_SHAPE_VERSION` and an HMAC of a fixed string under `EXPORT_ID_HMAC_KEY`. `ROW_SHAPE_VERSION` is bumped by hand with any change to the functions that build a row, and a test pins each version's rows for a fixed sample of events, so a change to the rows without a bump fails CI. Each run finds the days holding a row with another digest, or none, in the same query over the `created_at` and `export_rules` columns that counts each day's rows, and replaces those days too. A change to the rules or the key thus reaches every partition. A day that fails keeps its old rows, so the next run retries it with the window days and the count-mismatch days, and reloads no day that is already current.

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

Beside the event export, each run replaces the BigQuery table `account_daily` with every row of the Postgres view `account_daily` (`db/account-export.ts`), in one `WRITE_TRUNCATE` load job, and logs a failed load with what BigQuery confirms the table holds, `kept` or `unknown`. The account export runs even when the event export failed, and the run then fails too. The view runs with the migrator's rights, so from it the Job reads accounts per day and organisation and no email address or user id. It holds every UTC day from the first account's through yesterday's, so the latest day is the last complete one, and a day without new accounts is one row with a null `organisation` and 0 `accounts`. It counts only the accounts created before today, UTC, so a domain it names holds at least 3 of the accounts the export carries.

| Column         | Type   | Value                                                                                                                                                                                                                 |
| -------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `day`          | DATE   | the UTC date of `user.created_at`                                                                                                                                                                                     |
| `organisation` | STRING | `Personal email` for a webmail domain, else the lower-cased domain after the last `@` once it holds at least 3 accounts, else `Other organisations`; null on a day without new accounts, whose one row has 0 accounts |
| `accounts`     | INT64  | the accounts created that day, 0 on a day without new accounts                                                                                                                                                        |

A domain in `webmail_domain` is `Personal email` whatever its count. The table holds the `free-email-domains` package's list, which `db/migrate.ts` writes after the migrations on every deploy, so bumping the package updates it. pnpm skips the package's postinstall script, which would refetch the list.

A read with no rows replaces `account_daily` and `account_organisation` with no rows, so a deleted account and the organisation it named leave the export, except while `webmail_domain` is empty, when the run fails and leaves both tables as they were, since the view would hold no rows and webmail domains would show by name. `conversation` loads in that case too. Each table loads on its own, so a failed load does not stop the next, and the run fails at the end with an error that lists every failed table with what it holds (`failedTables`). The Job reads `account_daily`, `account_daily_source` and `account_organisation` in one REPEATABLE READ transaction, so they share one snapshot, and `conversation_export` in one statement of its own. A read that fails or times out fails its own tables, which keep what they held, and the other read's tables still load. The two reads are separate snapshots, so for one run `conversation` can name a `user_hash` that `account_organisation` lacks, or the reverse, as when an account is created or starts its deletion between them, and a join on `user_hash` can disagree until the next run. That is the cost of letting either group load when the other's read fails. The view `account_daily_source` reports whether `webmail_domain` holds any domain.

The run then replaces the BigQuery table `account_organisation` with every row of the Postgres view `account_organisation`, one row per account, in one `WRITE_TRUNCATE` load job. `account_daily` counts the same accounts by the same rule, so both tables label them alike once both loads land (a run can load one and fail the other, and the next run reconciles them), and a domain named in either holds at least 3 accounts created before today. The view hands the Job each account's user id and its label, and no email address. Both views leave out accounts with `user.deleting_at` set. The Job replaces the user id with its HMAC-SHA256 hex under `EXPORT_ID_HMAC_KEY` (`exportDigest` in `src/lib/proxy/account.ts`), the function that writes `user_hash` on the `event` table, so the table joins the account's events on `user_hash`. The user id stays in the Job's memory and never reaches BigQuery. A failed `account_organisation` load is logged with what that table holds, `kept` or `unknown`, beside a new `account_daily`, and fails the run.

| Column         | Type   | Value                                                                                                                          |
| -------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `user_hash`    | STRING | HMAC-SHA256 hex of `user.id` under `EXPORT_ID_HMAC_KEY`, equal to `user_hash` on the account's events                          |
| `organisation` | STRING | the account's `organisation` in `account_daily`: `Personal email`, a domain with at least 3 accounts, or `Other organisations` |

The table carries no engineering flag. Engineering use drops out through the `internal_eng` prop on the account's events, the same flag every other export query filters on. An engineering account still counts towards its domain's 3 accounts, as in `account_daily`.

The run then replaces the BigQuery table `conversation` with every row of the Postgres view `conversation_export`, in one `WRITE_TRUNCATE` load job, from a read of its own. The view holds each saved conversation of an account without `user.deleting_at` set, with four columns and no title, transcript or widgets. The Job replaces the user id with its HMAC-SHA256 hex under `EXPORT_ID_HMAC_KEY`, as for `account_organisation`, so the table joins the owner's events on `user_hash`. The conversation id and the agent session id leave as digests because the session id is a bearer credential for the agent, and the conversation id can equal it, so neither is exported raw. Both digests are the lower-case hex SHA-256, unkeyed, of the raw string, so a query joins a Langfuse session with `to_hex(sha256(session_id)) = agent_session_sha256`. A failed `conversation` load is logged with what that table holds, `kept` or `unknown`, and fails the run.

| Column                 | Type      | Value                                                                                                                                                 |
| ---------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id_sha256`            | STRING    | SHA-256 hex of the conversation's id                                                                                                                  |
| `agent_session_sha256` | STRING    | SHA-256 hex of the agent's session id for the conversation, null before its first turn; joins a Langfuse session through `to_hex(sha256(session_id))` |
| `user_hash`            | STRING    | HMAC-SHA256 hex of `user.id` under `EXPORT_ID_HMAC_KEY`, equal to `user_hash` on the owner's events                                                   |
| `created_at`           | TIMESTAMP | when the conversation was first saved, UTC                                                                                                            |

## Share migration

A Cloud Run Job named by `SHARE_MIGRATE_JOB_WEBSITE` (`dfo-dev-website-staging-share-migrate` on dev) copies the website's `share` rows into dfo-apis once per environment. It runs the website image with the command `node dist/migrate-shares.cjs` (`db/migrate-shares.ts`, bundled by `pnpm build:migrate-shares`). `build-migrate-deploy.yml` points it at each new image after the service update, as it points the migration Job, and never executes it. An operator runs it once the image that carries it is deployed:

```bash
gcloud run jobs execute "$SHARE_MIGRATE_JOB_WEBSITE" --region <region> --wait
```

It exits 0 when every share is imported or unchanged. On exit 1, read the `share <id>: <code>` lines in its log, fix what they name, and run it again; a run again is safe. `docs/share-export.md` lists the codes. infra defines the Job. It runs as the runtime service account with the `WEBSITE_DB_*` settings, since it writes `share_token`, and has `SEARCH_API_BASE` and the secret `PRESENTATION_SHARE_IMPORT_PRINCIPAL`, which dfo-apis' share import route checks.

## Shares left for cleanup

Each signed-in owner's share in dfo-apis has its write token in `share_token`. When the website cannot take such a share down, it writes the share id, the owner, the token and dfo-apis' refusal code to `share_cleanup` and logs `share_cleanup_recorded` with the share id at error level. Two paths write a row: an account deletion whose take-down dfo-apis refuses with a `write_token_*` code (`takeDownUserShares` in `src/lib/chat/apisShares.ts`), and a new share whose token could not be stored and whose take-down failed too (`createOwnedShare`). The share stays public until an operator takes it down. The rows outlive the user. `share_cleanup_recorded` is the alert hook, so alert on that text and keep it unchanged in the code. A row the website could not write is logged as `share_cleanup_not_recorded`, with the share id, and needs the same take-down.

To drain the table, list its rows against the website database:

```sql
select share_id, user_id, reason, recorded_at from share_cleanup order by recorded_at;
```

For each row, take the share down in dfo-apis with its maintenance command:

```bash
datasets-maintenance take-down-share <share_id>
```

Then delete the row:

```sql
delete from share_cleanup where share_id = '<share_id>';
```

## GitHub vars and secrets

`build-migrate-deploy.yml` reads these from a GitHub Environment matching the
deploy
target (`dev`, `production`). Configure the same variable and secret
_names_ in each environment with per-environment values. The workflow YAML
doesn't change between environments, only the environment it targets does.
These are the same names `ai` uses, except the service and migration Job
vars, so the `infra` foundation outputs slot into both repos the same way.

| Name                        | Kind   | Example value                                                                               | Who provides it                                 |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `WIF_PROVIDER`              | secret | `projects/123456789/locations/global/workloadIdentityPools/github/providers/github-actions` | infra (WIF pool/provider)                       |
| `WIF_SA`                    | secret | `dfo-website-staging-deployer@dev-fin-observatory.iam.gserviceaccount.com`                  | infra (deployer service account)                |
| `REGION`                    | var    | `northamerica-northeast1` (dev), `europe-west1` (production)                                | infra                                           |
| `PROJECT_ID`                | var    | `dev-fin-observatory` (dev)                                                                 | infra                                           |
| `AR_REPO`                   | var    | `dfo-website-staging` (dev)                                                                 | infra (Artifact Registry repo, per environment) |
| `SERVICE_WEBSITE`           | var    | `dfo-dev-website-staging` (dev)                                                             | infra                                           |
| `MIGRATE_JOB_WEBSITE`       | var    | `dfo-dev-website-staging-migrate` (dev)                                                     | infra (migration Cloud Run Job)                 |
| `EXPORT_JOB_WEBSITE`        | var    | `dfo-prod-website-export` (production only)                                                 | infra (event export Cloud Run Job)              |
| `SHARE_MIGRATE_JOB_WEBSITE` | var    | `dfo-dev-website-staging-share-migrate` (dev)                                               | infra (share migration Cloud Run Job)           |

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

| Name (provisional)                    | What it is                                                                                                                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STUDIO_API_BASE`                     | The `dfo-ai` harness the `/api/studio/*` proxy forwards to; plain env var set by infra                                                                                                                                                    |
| `STUDIO_TOKEN`                        | Bearer token the studio proxy sends to the harness; secret reference set by infra                                                                                                                                                         |
| `SEARCH_API_BASE`                     | The `dfo-apis` Search, Datasets and graph APIs; required, a production server without it refuses to start; plain env var set by infra                                                                                                     |
| `MCP_API_TOKEN`                       | Bearer token the `/mcp` proxy sends to the harness; infra mounts it from Secret Manager (`dfo-dev-mcp-api-token`, the harness's own secret)                                                                                               |
| `CALLER_HMAC_KEY`                     | HMAC key for the client digest sent as `x-dfo-caller` (`/mcp`, and dfo-apis beside the principal); unset, none is sent; secret set by infra                                                                                               |
| `DFO_CALLER_PRINCIPAL`                | Secret shared with dfo-apis (its `DFO_CALLER_PRINCIPAL`), sent as `x-dfo-caller-principal` on every dfo-apis call so dfo-apis trusts `x-dfo-caller`; unset, neither is sent                                                               |
| `EXPORT_ID_HMAC_KEY`                  | HMAC key for the account digest the Studio proxy sends as `x-dfo-account` on turn and interrupt calls (`src/lib/proxy/account.ts`); the export job's key, so a turn joins the account's exported events; unset, none is sent              |
| `RATE_LIMIT_WINDOW_S`                 | Rate-limit window in seconds; default 60                                                                                                                                                                                                  |
| `RATE_LIMIT_API`                      | Calls per window per address on `/api`; default 120                                                                                                                                                                                       |
| `RATE_LIMIT_DATASETS`                 | Calls per window per address on the Datasets API's routes below `/api/v1/datasets/`, counted apart from `/api`; default 300                                                                                                               |
| `RATE_LIMIT_PIN`                      | Calls per window per address on `/api/download-pin`; default 10                                                                                                                                                                           |
| `RATE_LIMIT_MCP`                      | Requests per window per address on `/mcp`; default 300, above `/api` because a vendor's address can carry many users                                                                                                                      |
| `OPENAI_APPS_CHALLENGE`               | OpenAI's domain-verification token; `/.well-known/openai-apps-challenge` serves it as plain text, 404 while unset                                                                                                                         |
| `TRUSTED_PROXY_HOPS`                  | Which `X-Forwarded-For` entry is the client, counted from the right; keys the `/api` and `/mcp` limits, the guest Studio allowance and the caller digest; default 0 (Cloud Run's); +1 per load balancer                                   |
| `WEBSITE_DB_INSTANCE_CONNECTION_NAME` | Cloud SQL instance the connector dials over PSC; set by infra                                                                                                                                                                             |
| `WEBSITE_DB_USER`                     | Runtime IAM database user; set by infra                                                                                                                                                                                                   |
| `WEBSITE_DB_NAME`                     | Database name; set by infra                                                                                                                                                                                                               |
| `BETTER_AUTH_SECRET`                  | Signs auth sessions; generated and stored in Secret Manager by infra                                                                                                                                                                      |
| `BETTER_AUTH_URL`                     | This app's own public origin; plain env var set by infra                                                                                                                                                                                  |
| `GOOGLE_CLIENT_ID`                    | Google sign-in OAuth client ID; optional, from Secret Manager                                                                                                                                                                             |
| `GOOGLE_CLIENT_SECRET`                | Google sign-in OAuth client secret; optional, from Secret Manager                                                                                                                                                                         |
| `GRAPH_EXPLORER_EMAIL_DOMAINS`        | Comma-separated email domains the Graph Explorer admits (`src/lib/auth/reader.ts`), matched exactly against a signed-in user's verified email; unset or empty admits nobody; plain env var                                                |
| `INTERNAL_ENG_EMAILS`                 | Comma-separated emails or bare domains whose signed-in users' events (verified email only) carry `internal_eng: true` (`src/lib/events/internalEng.ts`, `docs/analytics.md`); matched exactly; unset or empty marks nobody; plain env var |

The public MCP URL is `/mcp`. Next redirects `/mcp/` to `/mcp` with a 308,
which keeps the method and body. The proxy forwards either form to the
harness's `/mcp/`.

The proxy forwards `content-type`, `accept` and every `mcp-*` request header
(`mcp-method` and `mcp-name` among them, which the harness checks against the
request body), and returns `content-type`, `content-disposition`,
`content-length`, `www-authenticate` and every `mcp-*` response header.
`x-dfo-caller` is set by the proxy, whatever the client sent. A call to
dfo-apis carries `x-dfo-caller` beside `x-dfo-caller-principal` when
`DFO_CALLER_PRINCIPAL` is set, and neither when it is unset. Beside the
principal goes `x-dfo-surface`, `website` for a fetch from one of the site's
own pages and `api` otherwise (`requestSurface()` in `src/lib/proxy/caller.ts`).
It comes from the client's `Sec-Fetch-Site` header. When the request sends no
`Sec-Fetch-Site`, it compares the `Referer` host, else the `Origin` host, with
the `Host` header, ports and case ignored. It serves counting only. The site's
own share calls always send `website`.
The client's `x-dfo-client` passes through. The Studio's
turn and interrupt calls carry `x-dfo-caller` and, for a signed-in user,
`x-dfo-account` (the export's `user_hash` under `EXPORT_ID_HMAC_KEY`, none for
a guest or when the key is unset). Its other routes carry neither. The proxy
drops a client-sent value of `x-dfo-caller`, `x-dfo-caller-principal`,
`x-dfo-surface` and `x-dfo-account`. The digest's
input is the client address folded as the rate limiter folds it (an IPv6
address as its /64), so dfo-apis, which computes the same digest for a direct
caller, keys both on one allowance. `authorization`
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
