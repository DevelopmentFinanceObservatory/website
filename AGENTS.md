# dfo-website

The public site of the Development Finance Observatory. `README.md` maps the repository, `CONTRIBUTING.md` lists what a pull request needs, and `docs/development.md` covers running the site locally, the database, branches, releases and the component and styling conventions.

The site runs Next.js 16, whose APIs changed after most training data. Read the guide in `node_modules/next/dist/docs/` before writing Next.js code, and heed its deprecation notices.

## Commands

- `just check` runs what CI runs, in CI's order: the client provenance check, lint (ESLint and Stylelint), typecheck, test and build. CI also builds the `db/` bundles and smoke-tests them, so a change under `db/` also runs `pnpm build:migrate`, `pnpm build:export-events`, `pnpm build:migrate-shares` and `pnpm build:check-library-shares`.
- `just format` applies Prettier and the Stylelint fixes. Neither CI nor `just check` runs Prettier, so run it before committing.
- `node --test path/to/file.test.ts` runs one test file. Tests that touch the database need Postgres (see the port trap below).
- Report which checks ran and passed, and name any that did not run.

## Code

- Components follow `src/components/{atoms,molecules,organisms}/Name/Name.tsx` with a `Name.module.scss` beside them. Styling uses SCSS modules, with no Tailwind. `docs/development.md` ("Conventions") has the colour, sizing, button, icon and motion rules.
- Pages and layouts are Server Components unless they need state or browser APIs. Put `"use client"` on the smallest interactive leaf. A module that must stay on the server imports `server-only`. No lint rule checks the split, and the build fails when client code imports a server-only module.
- Use `type` for object shapes and `interface` only where declaration merging is needed. Narrow `unknown` and parsed JSON at the boundary. Cast with `as` only at a parsing or DOM boundary. When the compiler rejects a value, fix its type.
- Give every `eslint-disable` and `@ts-expect-error` a one-line reason beside it.
- Write a comment only for a constraint, invariant or workaround the code cannot show, and give the reason. A comment states a present-tense fact about the code as it stands.
- Match the surrounding code where these rules say nothing. Stay within the task, and report other problems you find instead of fixing them.

## Generated and vendored files

- `src/content/dfo-docs/` and `public/docs/*.zip` are the output of `scripts/sync-dfo-docs.mjs`, which empties both directories on each run. Fix docs content in the `DevelopmentFinanceObservatory/docs` repository, then run `node scripts/sync-dfo-docs.mjs <sha>` at the new commit of its `corpus` branch, in a `chore(docs): sync the dfo-docs corpus at <sha7>` pull request.
- `vendor/developmentfinance-client-*.tgz` changes only through the steps in `docs/development.md` ("API client package"). The commit that changes it names `sdk <hash>` in its subject, and `scripts/check-client-provenance.mjs` fails CI otherwise.
- Never edit an applied migration in `db/migrations/`. After changing `db/schema.ts`, run `just db-generate`, read the SQL, and commit both together.

## Tests

- The site's tests are `node --test` files named `*.test.ts` in a `test/` directory beside the code. The root `test` script in `package.json` lists each test directory by glob, so a test in an unlisted directory never runs. Add the directory's glob when you create one. `prototypes/` runs its own tests from `prototypes/package.json`.
- A test that imports a module using `@/` paths or `server-only` first imports `src/lib/test/serverModules.ts`, then loads the module under test with a dynamic `import()`. `src/lib/proxy/test/forward.test.ts` shows the pattern.
- Keep a test only when it fails for a fault no other test catches. Extend an existing test, for example with a table row, before adding a new one, and confirm that a new test fails without the change it guards.
- Assert on what the code produces and on machine-readable codes, not on message prose or on constants copied from the source.
- Run the full suite when a change touches test files or module-level imports. A narrow selection hides order-dependent state.

## Branches, commits and pull requests

- Branch from `dev` as `feat/<slug>`, `fix/<slug>`, `chore/<slug>` or `docs/<slug>`, and open the pull request into `dev`. `main` is production and changes only through a release pull request titled `release: website <sha7> to production`. `docs/development.md` ("Branches and releases") has the steps.
- Pull requests are squash-merged, so the title becomes the commit subject on `dev`. Write both as Conventional Commits: `type(scope): lower-case imperative summary`, no full stop, about 72 characters. Types are `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `ci` and `chore`. The scope names a feature area, such as `studio`, `proxy`, `search`, `share`, `docs`, `prototypes` or `deps`.
- A commit body is optional. Add two or three sentences when the reason for the change is not obvious from the subject and the diff.
- A pull request body opens with a short paragraph on what changes and why, with real figures where they exist. Then `Closes #N` on its own line when it resolves an issue. Add `## Changes` (one bullet per logical change, naming the file or function) and `## Notes for reviewers` (risks, scope cuts, anything left unverified) only when they carry information. End with `Testing:` and the exact commands that ran, with their results.
- A pull request that changes a rendered page carries before and after screenshots taken with the same steps on both builds, in a `## Screenshots` table. Headless Chromium under Playwright hides scrollbars, so launch it with `ignoreDefaultArgs: ['--hide-scrollbars']` when the scrollbar is part of the change. On macOS it also draws overlay bars 0 px wide unless launched with `args: ['--disable-features=OverlayScrollbar']`.
- An issue title starts with an imperative verb and names the behaviour the fix produces ("Stop the share dialog closing on submit"). The body opens with prose saying what is wrong, its effect, and the function, file or route responsible, and ends with `### Done when` and two to four checkboxes stating facts that will be true.
- CI skips draft pull requests. Marking one ready starts the run.
- The repository is public. Commits, pull requests, issues and comments carry no credentials, internal hostnames, private repository names or internal links. They also carry no links to AI coding sessions, such as `claude.ai/code/session_…` URLs, so drop any `Claude-Session:` trailer from a squash-merge message.

## Writing

These rules cover commit messages, pull request and issue bodies, Markdown docs, and comments. Code, identifiers, logs and quoted output keep their own conventions.

- Write each text as a finished document: current facts, named files and functions, real numbers. Leave out how the work was done (plans, phases, review rounds, agent runs), decision history, dates, people, and references to documents the reader cannot open.
- Lead with the point, and stop when it is made.
- Say what a thing is. Cut "not X but Y" and "X, never Y" constructions and openers that start with a negation. Keep real prohibitions.
- Avoid edit-relative words ("now", "no longer", "previously", "still") outside a changelog. Describe the current state.
- Use no em dashes. Use a colon only before a list or a quotation, and a semicolon only between list items that contain commas.
- Use plain verbs and literal phrases. Cut marketing adjectives (powerful, robust, seamless) and empty intensifiers (really, truly, actually).
- Use British spelling in prose, sentence-case headings, the Oxford comma, and no emoji. Identifiers, CSS properties and quoted UI text keep their own spelling.
- In GitHub bodies and comments, write each paragraph as one unwrapped line, since GitHub renders a newline inside a paragraph as a line break.

## Traps

- `pnpm test` and `db/migrate-local.ts` default to Postgres on port 5433. When another project's database holds that port, the tests run against the wrong server. Start `just db-up` on a free port with `PGPORT` and pass the same `PGPORT` to the tests.
- `CI=true pnpm install` implies `--frozen-lockfile` and refuses after a `package.json` edit, so re-lock with `--no-frozen-lockfile`. Update one package per `pnpm update` call, because a call with several names bumps only some of them and rewrites unrelated specifiers.
- `next` is pinned to an exact version, so Dependabot opens no security pull request for it. Check its advisories by hand.
- A `<Link>` with default prefetch to a `force-dynamic` page renders that page, data reads included, when the link scrolls into view, whatever the prefetching guide says. Links to per-item dynamic pages set `prefetch={false}`, as `SourceLink` does. Check prefetch behaviour on a production build (`just build`, then `just start`).
- `notFound()` or an error thrown from a dynamic page returns Next's error shell (`<html id="__next_error__">`), whose server HTML lacks the root layout. React then renders the layout on the client, and the inline `<script>` tags it inserts do not run. `ConsentRecovery` (`src/components/atoms/Analytics/`) runs the consent scripts again after the layout commits, each guarded by a window flag so it runs once per page load, and mounts GA4 only after that. Any other inline script in the root layout that must run on every page needs the same recovery. Check consent on a 404 in the live DOM of a production build: the `consent` `default` entry in `dataLayer` before GA4's `config`, and one `script#usercentrics-cmp`.
- A change that reads new search catalogue fields merges only after the `dfo-apis` change that serves them is live. After a catalogue format bump, `GET /api/search/catalogue` answers 503 until the catalogue job republishes, and `catalogueLoader.ts` caches the catalogue for 300 s.
- The standalone server (`node .next/standalone/server.js`) needs `.next/static` and `public/` copied beside it, as `deploy/Dockerfile` does. In production mode `src/instrumentation.ts` refuses to start without `SEARCH_API_BASE` and a database connection, without `API_KEY_TAG_SECRETS` while API keys are on, and without `CALLER_HMAC_KEY` while visitor limits are on. Without `TYPESAFE_API_KEY` it starts, and only a Library publish or text edit answers 503.
- The search client gives up on a resolve stream after 45 s of silence (`DEFAULT_STALL_TIMEOUT_MS` in `searchClient.ts`), and the engine's `: ping` heartbeats reset the timer. When changing a resolve timeout here or in `dfo-apis`, keep each hop's cap a few seconds under its caller's timeout.
- `prototypes/` is a second, static app on the `prototypes` branch (dev merges into it on every push) that deploys on its own to `developmentfinance.org/prototypes*` as a Cloudflare Worker (`.github/workflows/deploy-prototypes.yml`), and the Worker route runs before the website. Add no `src/app` route, `public/` file or redirect at `/prototypes` (`src/lib/test/prototypesPath.test.ts` fails on one). It builds from the root install, so run `pnpm install` at the root before `prototypes/`, and keep `next` and `react` out of `prototypes/package.json`.
- `.env.local` and any `.env.local.bak*` copies hold real secrets. Do not read them. `.env.example` and `docs/development.md` list every variable.
