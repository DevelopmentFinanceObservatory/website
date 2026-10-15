# Development

Next.js 16 (App Router, Turbopack) + TypeScript + SCSS modules.

## Run locally

Needs Node 22.18 or newer (CI and the container use Node 24). The database
scripts and `pnpm test` run `.ts` files directly, which older Node
versions refuse. `just doctor` checks the version.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local`. The static pages run without it. The
data search and graph pages need `SEARCH_API_BASE`, which the sample points
at the proxy in [Reach the dev APIs](#reach-the-dev-apis); the Studio needs a harness at
`STUDIO_API_BASE` and a `STUDIO_TOKEN`; accounts need `DATABASE_URL` and
`BETTER_AUTH_SECRET`. To open the dev server from a
phone/tablet on the same network, put the machine's LAN IP in
`DEV_ORIGINS`.

Live Studio shares need `LIVE_REFRESH_PRINCIPAL`, the credential dfo-apis
and dfo-ai ask of a card refresh, set to the same value on all three. With
it empty the Share dialog offers Snapshot only. A live card's refreshed
answer stands for `LIVE_SHARE_WINDOW_S` seconds (default 300, at most 900)
before the next viewer asks the back ends again.

### Reach the dev APIs

The dev apis service (`dfo-dev-apis`) admits only callers that hold
`roles/run.invoker` on it. The deployed site proves its identity with an ID
token from the Cloud Run metadata server (`src/lib/apisAuth.ts`); off Cloud
Run the site sends no token. Local work goes through `gcloud run services
proxy`, which signs each call with your gcloud login:

```bash
gcloud auth login
gcloud run services proxy dfo-dev-apis --region northamerica-northeast1 \
  --project dev-fin-observatory --port 8083
```

Leave it running and set `SEARCH_API_BASE=http://localhost:8083`, as
`.env.example` does. Your account needs `roles/run.invoker` on the service,
directly or through a group; without it the proxy answers 403. Google does
not document whether the proxy renews its token after an hour, so if calls
start answering 401 or 403 later in a session, restart it.
The scripts below reach the APIs the same way.

## just

The [justfile](../justfile) is the entry point for the commands below. It
wraps the pnpm scripts (listed under Scripts) plus the container and deploy
workflows. `just` with no arguments lists everything. Install it with
`brew install just` if you don't have it.

| Section               | Recipes                                                 |
| --------------------- | ------------------------------------------------------- |
| Setup & Configuration | `setup`, `env`                                          |
| Development           | `dev`, `start`, `optimize-svg`                          |
| Database              | `db-up`, `db-migrate`, `db-reset`, `db-generate`        |
| Quality               | `lint`, `format`, `typecheck`, `test`, `build`, `check` |
| Container             | `docker-build`, `run-local`, `clean`                    |
| Diagnostics           | `status`, `doctor`, `logs`, `deployed`                  |
| Deploy config         | `set-dev-deploy-vars`                                   |

Run `just <recipe>` to see what each one does, or `just --list` for the
one-line descriptions.

## Database

Accounts and saved conversations live in Postgres, migrated by
`db/apply-migrations.ts`. `db/migrate.ts` runs it against Cloud SQL in
deployed environments, and `db/migrate-local.ts` runs it locally.

First-time setup:

```bash
just db-up       # start a local Postgres container (postgres:18.4, port 5433)
just db-migrate  # create the migrator/runtime roles and apply migrations
```

`.env.local`'s default `DATABASE_URL` (copied from `.env.example`) already
points at the `website_runtime` role `db-migrate` creates, so nothing else
to configure. Until `just db-up` and `just db-migrate` have run,
database-backed requests (sign-in, saved conversations) fail with a
connection error. The `pnpm dev` fallback that logs a warning and keeps
serving applies only when neither `DATABASE_URL` nor `WEBSITE_DB_*` is set.
A production start with no database fails outright.

The container uses port 5433 so it can run next to a Postgres installed on
the machine. If 5433 is taken too, set `PGPORT` to another port for
`just db-reset`, `just db-migrate` and `pnpm test`, and change the port in
`.env.local`'s `DATABASE_URL` to match. `db-up` keeps the port a container
was created with, so switching ports, including moving an older container
off 5432, needs `just db-reset`.

Schema change workflow:

1. Edit `db/schema.ts`.
2. `just db-generate` generates a migration under `db/migrations` from
   the diff.
3. Review the generated SQL.
4. `just db-migrate` applies it to the local database.
5. Commit the migration alongside the schema change.

Never run `drizzle-kit push`, `drizzle-kit migrate`, or `better-auth
migrate` directly. Migrations apply only through
`db/apply-migrations.ts` (via `db-migrate`), which renders the
migrator/runtime role placeholders in migration `0000` and takes the
advisory lock that keeps concurrent runs from double-applying. The other
tools do neither. Never edit a migration that has already applied, even
locally. Write a follow-up migration.

In the dev environment, every deploy runs a migration Job against the same
image before the service rolls out.

### Card reference backfill

`scripts/backfill-card-refs.ts` gives Studio cards stored without a
component reference their `ref` and `frame`, in `conversation.data` and
`share.data`. A card needs both to be shared live. Cards saved before
3 October 2026 have neither and hold their values as `csv`.

```bash
node scripts/backfill-card-refs.ts              # dry run: report only
node scripts/backfill-card-refs.ts --validate   # counts and validation only
node scripts/backfill-card-refs.ts --write      # write matched cards
```

It reads the database from `DATABASE_URL`, or from the `WEBSITE_DB_*`
variables the runtime uses for Cloud SQL, and component revisions from
`SEARCH_API_BASE`. Node does not load `.env.local`, so set them on the
command line. Against dev, start the proxy from
[Reach the dev APIs](#reach-the-dev-apis) and pass
`SEARCH_API_BASE=http://localhost:8083`.

A card's `id` is its component id. The script reads every revision of that
component and takes the one revision that gives the card its title and its
values exactly (`src/lib/studio/cardRefMatch.ts`). A card that no revision
reproduces, or that more than one does, is left without `ref` and listed
with the reason. Text cards, cards that have `ref`, and search shares are
left as they are.

Every run prints the shares by kind and mode, the data cards with no
component reference, and the cards on a derived frame by week, for shares
and for conversations. It then validates the match on the cards saved with
their revision: it takes `ref` and `frame` off each, matches it, and reports
how many it recovered correctly, wrongly, and not at all. `--write` is
refused unless that run finds no wrong match over at least 300 cards, which
puts the wrong-match rate below 1% at 95% confidence.
`--override-validation` writes anyway.

A write changes one row per transaction and only the matched cards in it.
Running it again writes nothing.

## Conventions the pipeline relies on

Changing any of these is fine if the workflows and `deploy/Dockerfile` change in the same pull request.

- pnpm is the package manager, with a committed `pnpm-lock.yaml` and a `packageManager` field in `package.json`. The pnpm setup in `ci.yml` reads its version from that field and fails without it.
- TypeScript runs in strict mode on the Next.js App Router.
- `package.json` defines `lint`, `typecheck`, `test` and `build` scripts, which `ci.yml` runs.
- `next.config.ts` sets `output: 'standalone'`, so `deploy/Dockerfile` can copy the standalone server into the runtime image.

## Branches and releases

`dev` is the default branch. Contributors branch from it and open a pull request into it. The `ci` check has to pass before merge, and force-pushes are blocked. Each merge deploys to the dev service.

`main` is production. To release:

1. Confirm the `dev` commit you want is deployed and validated on the dev service.
2. Open a pull request from `dev` into `main`. `main` requires one approval and the `ci` check, and blocks force-pushes and deletion.
3. Merge it. `deploy-prod.yml` builds and deploys that commit once the release reviewers approve the `production` GitHub Environment.
4. Tag it: `git tag prod-YYYY-MM-DD <sha> && git push origin prod-YYYY-MM-DD`.

## Deployed services

The services run in the `dev-fin-observatory` GCP project, region `northamerica-northeast1`. GitHub Actions builds the `dfo-website` image and updates the Cloud Run dev service on every push to `dev` that touches the image's inputs. `infra` owns the Cloud Run service definition (service account, scaling, secrets, environment variables); this repository's CI only swaps images onto the service `infra` defined. `just deployed` prints the live service's URL, revision and image, and `just logs` tails its logs.

The `apis`, `ai` and `dcp` repositories run their own dev services. `apis` and `ai` return 404 at the root and serve Swagger UI at `/docs`. `deploy/README.md` lists the GitHub variables, secrets and GCP prerequisites.

## Scripts

| Script                  | What it does                                     |
| ----------------------- | ------------------------------------------------ |
| `pnpm dev`              | Dev server (Turbopack)                           |
| `pnpm build`            | Production build (standalone output)             |
| `pnpm start`            | Serve the production build                       |
| `pnpm lint`             | ESLint                                           |
| `pnpm typecheck`        | `tsc --noEmit`                                   |
| `pnpm test`             | Migration integration tests (`just db-up` first) |
| `pnpm lint:css`         | Stylelint (SCSS, BEM pattern)                    |
| `pnpm lint:css:fix`     | Stylelint with autofix                           |
| `pnpm format`           | Prettier over `src/`                             |
| `pnpm optimize:svg`     | SVGO over `src/assets` (run after adding)        |
| `pnpm db:generate`      | Generate a migration from `db/schema.ts`         |
| `pnpm db:migrate:local` | Apply migrations to the local database           |
| `pnpm graph:types`      | Regenerate the graph types from the snapshot     |
| `pnpm graph:schema`     | Refresh the graph schema snapshot from an apis   |

`pnpm graph:schema http://localhost:8083` reads the snapshot from dev apis
through the proxy in [Reach the dev APIs](#reach-the-dev-apis).

## Conventions

- Styles: global partials live in `src/styles` (`_variables`, `_mixins`, `_breakpoints`, …). They are on the Sass load path, so import them from anywhere as `@use "variables" as *;` with no relative paths. Fluid rem sizing, `html { font-size: vw(16px) }`, scales the whole layout with the viewport (separate bases for desktop, tablet and phone, see `$widths`). Size things with `rem()` and `@include font-size()`, and write every design px value as `rem(x)`. Breakpoints are `@include breakpoint(phone)` (< 660px) and `@include breakpoint(tablet)` (660–1023px).
- Colors and fonts: components use `var(--color-*)` and `var(--font-*)`, and do not use `$color-*` or `$font-*` directly. The custom properties are emitted once in `src/styles/_root.scss` from the SCSS palette in `_variables.scss`, so add new colors in both places. CSS vars let sections re-theme parts of the UI by overriding them locally (for example, the header changes theme depending on what is underneath it). SCSS variables are for what CSS vars cannot do: breakpoints, sizes, and `rem()` math.
- Fonts: Outfit (300–800) and DM Mono (300–500), self-hosted via `@fontsource` and imported in `src/app/layout.tsx`.
- Icons: put the SVG in `src/assets/svg/`, register it in the `icons` map in `src/components/atoms/Icon/Icon.tsx`, and use it as `<Icon name="arrow" />`. SVGR compiles SVGs to React components (Turbopack rule in `next.config.ts`), so use `stroke="currentColor"` for icons to inherit text color. Static image imports are disabled (`images.disableStaticImages`), so reference bitmaps from `public/` by URL.
- Components: atomic design, `src/components/atoms|molecules|organisms/Name/Name.tsx` + `Name.module.scss`.
- Buttons: use the `Button` atom (`src/components/atoms/Button`) for every button, and add new variants there. When a button has an icon, the icon renders in its own wrapper segment 1px next to the label (icon itself 20×20). Pass `icon="name"`, and give icon-only buttons an `aria-label`. Hover plays a one-shot swap (the arrow flies out in its own direction, a copy rides in, and the label words roll up with a stagger) driven by the `.swapping` class from JS. Timings live only in `Button.tsx` (`SWAP_MS`, `WORD_STAGGER_MS`, `HOVER_INTENT_MS`) and reach the SCSS via `--swap-duration` and `--word-stagger`. To make a whole card trigger its button's hover, put `data-button-zone` on the card, and the button listens there. Hover styles are gated behind `@media (hover: hover)` so touch screens do not get stuck hover states.
- Animations use one system:
    - _Reveals_ (`src/styles/_reveal.scss` + `useReveal` hook): attach `useReveal()` once per section (it returns the section ref), and mark elements with `data-reveal` (rise, fade and subtle scale), `data-reveal="text"` (no scale, for all text), `data-reveal-group` (card-style unit: container + inner cascade) or `data-reveal-group="trigger"` (shared trigger, container static). Stagger via `style={revealIndex(n)}`, with the global pace in `$reveal-stagger`. Elements trigger individually, reset when leaving the viewport, and animate out quickly. The observer toggles the `data-revealed` attribute, because React rewrites `className` wholesale on re-render and would wipe a class.
    - _Text fill on scroll_: `SectionHeading` (label + h2, one continuous progression, per-section colors via `--section-label-color` and `--section-heading-color`) or the `TextFill` atom for any other text (`--text-fill-color`). Both are driven by `useFillProgress`, which lerps the displayed progress toward the scroll target so the fill trails the scroll smoothly. The scrub window lives in `utils/scroll.ts#travelProgress`.
    - _Parallax and scroll work_: `useScrollFrame(callback)` (rAF-throttled scroll and resize, disabled by passing `null`), progress formulas in `utils/scroll.ts` (`centeredProgress`, `travelProgress`, `enterProgress`), `usePrefersReducedMotion()` for gating, and `useInView(ref)` for visibility flags. The header hides on scroll down and returns on scroll up (direction tracking in `Header.tsx`, same scroll frame as its theme probe).
- Safe areas: the viewport is `viewport-fit: cover`. The page paints under the notch and home-indicator bands, and the fixed pieces (header, footer, Studio, drawers) pad by `env(safe-area-inset-*)` themselves.
