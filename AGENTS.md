# dfo-website

The public site of the Development Finance Observatory. `README.md` maps the repository, and `docs/development.md` covers running it locally, the database, branches and releases.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Pull requests

- Branch from `dev` and open the pull request into `dev`. `main` is production and moves only through a release pull request from `dev`.
- `just check` runs what CI runs, in CI's order: the client provenance check, lint (ESLint and Stylelint), typecheck, test and build.
- CI skips draft pull requests. Marking one ready starts the run.
- The repository is public, so commits, pull requests and comments carry no credentials, private repository names or internal links.

## Traps

- `pnpm test` and `db/migrate-local.ts` default to Postgres on port 5433. When another project's database holds that port, the tests run against the wrong server. Start `just db-up` on a free port with `PGPORT` and pass the same `PGPORT` to the tests.
- `CI=true pnpm install` implies `--frozen-lockfile` and refuses after a `package.json` edit, so re-lock with `--no-frozen-lockfile`. Update one package per `pnpm update` call: a call with several names bumps only some of them and rewrites unrelated specifiers.
- `next` is pinned to an exact version, so Dependabot opens no security pull request for it. Check its advisories by hand.
- A `<Link>` with default prefetch to a `force-dynamic` page renders that page, data reads included, when the link scrolls into view, whatever the prefetching guide says. Links to per-item dynamic pages set `prefetch={false}`, as `SourceLink` does. Check prefetch behaviour on a production build (`just build`, then `just start`).
- `notFound()` thrown from a dynamic page returns Next's error shell, which drops the root layout's `beforeInteractive` consent scripts. URLs that match no route keep them. Before adding a catch-all route or a second root layout, check the consent scripts in the server HTML of a 404, not in the hydrated DOM.
- A change that reads new search catalogue fields merges only after the `dfo-apis` change that serves them is live. After a catalogue format bump, `GET /api/search/catalogue` answers 503 until the catalogue job republishes, and `catalogueLoader.ts` caches the catalogue for 300 s.
- The standalone server (`node .next/standalone/server.js`) needs `.next/static` and `public/` copied beside it, as `deploy/Dockerfile` does. In production mode `src/instrumentation.ts` refuses to start without `SEARCH_API_BASE` and a database connection.
- The search client gives up on a resolve stream after 45 s of silence (`DEFAULT_STALL_TIMEOUT_MS` in `searchClient.ts`), and the engine's `: ping` heartbeats reset the timer. When changing a resolve timeout here or in `dfo-apis`, keep each hop's cap a few seconds under its caller's timeout.
- Headless Chromium under Playwright runs with `--hide-scrollbars`, so a scrollbar check sees none. Launch with `ignoreDefaultArgs: ['--hide-scrollbars']`.
