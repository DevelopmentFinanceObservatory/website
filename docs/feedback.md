# Feedback backend

`POST /api/feedback` takes a feedback submission and fans it out to up to three sinks, each active only when configured: the website tenant database (permanent record), a Slack channel via incoming webhook (how the team sees submissions day to day), and email over SMTP (unused until an email decision exists). Any subset is a valid deployment phase; with none configured the endpoint answers 503 so a form wired up too early fails loudly instead of dropping submissions.

## Request

```
POST /api/feedback
Content-Type: application/json

{
  "message": "required, 1 to 5000 characters",
  "email":   "optional, contact address of the submitter",
  "page":    "optional, path or name of the page the form was on",
  "website": "honeypot: include the field in the form, keep it empty and hidden"
}
```

## Response

Same shape as the brochure site's newsletter endpoint, so form code can treat them alike:

```
{ "ok": true,  "message": "Thanks for your feedback!" }
{ "ok": false, "message": "human-readable reason" }        // 400, 500 or 503
```

A submission with a filled honeypot gets a fake 200 so bots learn nothing. A sink that fails is logged and the submission survives through any other; only all sinks failing is a 500.

## Configuration

| Variable                                  | Sink    | Meaning                                                                                                                                                      |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL` / `WEBSITE_DB_*`           | storage | The shared pool from `src/lib/db`; nothing feedback-specific, storage is on wherever the app has a database                                                  |
| `FEEDBACK_SLACK_WEBHOOK_URL`              | slack   | Slack incoming webhook; deployed it is mounted from Secret Manager by dfo-infra, whose placeholder value `disabled` (or anything that isn't a URL) means off |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | email   | SMTP endpoint, shared with email sign-in (`src/lib/mail/smtp.ts`). The connection must use TLS 1.2 or later. `SMTP_HOST` unset turns email off               |
| `SMTP_USER` / `SMTP_PASS`                 | email   | optional SMTP auth                                                                                                                                           |
| `FEEDBACK_FROM` / `FEEDBACK_TO`           | email   | sender identity and destination inbox                                                                                                                        |

Rotating the Slack webhook (leak, channel change) is a Secret Manager version plus a redeploy, no code change; see the dfo-infra website stack README.

## Schema

The `feedback` table is defined in `db/schema.ts` with a generated migration under `db/migrations`, applied like every other migration: `just db-migrate` locally, the migration Job on deploy (see `docs/development.md`, Database). Migration 0000's default privileges give the runtime role its DML, so the migration carries no grants of its own.

## Local development

```bash
just db-up && just db-migrate   # storage sink on via .env.local's DATABASE_URL
pnpm dev
curl -s -X POST localhost:3000/api/feedback \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello from local","page":"/data"}'
```

To exercise the Slack sink without posting to the real channel, point `FEEDBACK_SLACK_WEBHOOK_URL` at a request bin or any local HTTP server; any URL counts as configured.
