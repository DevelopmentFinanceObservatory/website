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

Copy `.env.example` to `.env.local`. The homepage and the data search run
without anything set; the Studio needs `STUDIO_TOKEN`, and accounts need
`DATABASE_URL` and `BETTER_AUTH_SECRET`. To open the dev server from a
phone/tablet on the same network, put the machine's LAN IP in
`DEV_ORIGINS`.

Live Studio shares need `LIVE_REFRESH_PRINCIPAL`, the credential dfo-apis
and dfo-ai ask of a card refresh, set to the same value on all three. With
it empty the Share dialog offers Snapshot only. A live card's refreshed
answer stands for `LIVE_SHARE_WINDOW_S` seconds (default 300, at most 900)
before the next viewer asks the back ends again.

## just

The [justfile](../justfile) is the entry point for the commands below — it
wraps the pnpm scripts (see the table) plus the container and deploy
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
| Deploy config         | `set-staging-deploy-vars`, `deploy-prod`                |

Run `just <recipe>` to see what each one does, or `just --list` for the
one-line descriptions.

## Database

Accounts and saved conversations live in Postgres, migrated by
`db/apply-migrations.ts` — `db/migrate.ts` runs it against Cloud SQL in
deployed environments, `db/migrate-local.ts` runs it locally.

First-time setup:

```bash
just db-up       # start a local Postgres container (postgres:18.4, port 5433)
just db-migrate  # create the migrator/runtime roles and apply migrations
```

`.env.local`'s default `DATABASE_URL` (copied from `.env.example`) already
points at the `website_runtime` role `db-migrate` creates, so nothing else
to configure. Until `just db-up` and `just db-migrate` have run,
database-backed requests (sign-in, saved conversations) fail with a
connection error; `pnpm dev`'s "logs a warning and keeps serving" fallback
only applies when neither `DATABASE_URL` nor `WEBSITE_DB_*` is set at all.
A production start fails outright instead of serving with no database.

The container uses port 5433 so it can run next to a Postgres installed on
the machine. If 5433 is taken too, set `PGPORT` to another port for
`just db-reset`, `just db-migrate` and `pnpm test`, and change the port in
`.env.local`'s `DATABASE_URL` to match. `db-up` keeps the port a container
was created with, so switching ports, including moving an older container
off 5432, needs `just db-reset`.

Schema change workflow:

1. Edit `db/schema.ts`.
2. `just db-generate` — generates a migration under `db/migrations` from
   the diff.
3. Review the generated SQL.
4. `just db-migrate` — applies it to the local database.
5. Commit the migration alongside the schema change.

Never run `drizzle-kit push`, `drizzle-kit migrate`, or `better-auth
migrate` directly — migrations only ever apply through
`db/apply-migrations.ts` (via `db-migrate`), which renders the
migrator/runtime role placeholders in migration `0000` and takes the
advisory lock that keeps concurrent runs from double-applying; the other
tools know about neither. A new migration is always a new file —
never edit one that has already applied, even locally, and write a
follow-up migration instead.

This reaches staging the same way. Every staging deploy runs a migration
Job against the same image before the service rolls out to it.

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
command line.

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

## Conventions

- **Styles** — global partials live in `src/styles` (`_variables`, `_mixins`, `_breakpoints`, …). They are on the Sass load path, so import them from anywhere as `@use "variables" as *;` (no relative paths). Fluid rem: `html { font-size: vw(16px) }` scales the whole layout with the viewport (separate bases for desktop / tablet / phone, see `$widths`); size things with `rem()` / `@include font-size()` — **always `rem(x)` for design px values, never raw px**. Breakpoints: `@include breakpoint(phone)` (< 660px) and `@include breakpoint(tablet)` (660–1023px).
- **Colors & fonts — always `var(--color-*)` / `var(--font-*)`**, never `$color-*`/`$font-*` directly in components. The custom properties are emitted once in `src/styles/_root.scss` (from the SCSS palette in `_variables.scss` — add new colors in both places). CSS vars are used so sections can re-theme parts of the UI (e.g. the header changes theme depending on what's underneath it) by overriding them locally. SCSS variables remain only for things CSS vars can't do: breakpoints, sizes, `rem()` math.
- **Fonts** — Outfit (300–800) and DM Mono (300–500), self-hosted via `@fontsource`, imported in `src/app/layout.tsx`.
- **Icons** — put the SVG in `src/assets/svg/`, register it in `src/components/atoms/Icon/Icon.tsx` (`icons` map), use as `<Icon name="arrow" />`. SVGs are compiled to React components by SVGR (Turbopack rule in `next.config.ts`); use `stroke="currentColor"` so icons inherit text color. Static image imports are disabled (`images.disableStaticImages`) — reference bitmaps from `public/` by URL instead.
- **Components** — atomic design: `src/components/atoms|molecules|organisms/Name/Name.tsx` + `Name.module.scss`.
- **Buttons** — always use the `Button` atom (`src/components/atoms/Button`); add new variants there instead of styling buttons ad hoc. When a button has an icon, the icon renders in its own wrapper segment 1px next to the label (icon itself 20×20) — pass `icon="name"`; icon-only buttons get `aria-label`. Hover plays a one-shot swap (arrow flies out in its own direction, a copy rides in; label words roll up with a stagger) driven by the `.swapping` class from JS — timings live only in `Button.tsx` (`SWAP_MS`, `WORD_STAGGER_MS`, `HOVER_INTENT_MS`) and reach the SCSS via `--swap-duration`/`--word-stagger`. To make a whole card trigger its button's hover, put `data-button-zone` on the card — the button listens there instead of on itself. Hover styles are gated behind `@media (hover: hover)` so touch screens don't get stuck hover states.
- **Animations** — one system, don't hand-roll:
    - _Reveals_ (`src/styles/_reveal.scss` + `useReveal` hook): attach `useReveal()` once per section (returns the section ref), mark elements with `data-reveal` (rise+fade+subtle scale), `data-reveal="text"` (no scale — always use for text), `data-reveal-group` (card-style unit: container + inner cascade) or `data-reveal-group="trigger"` (shared trigger, container static). Stagger via `style={revealIndex(n)}`; global pace in `$reveal-stagger`. Elements trigger individually, reset when leaving the viewport, and animate out quickly. The observer toggles the `data-revealed` **attribute** (never a class — React rewrites `className` wholesale on re-render and would wipe it).
    - _Text fill on scroll_: `SectionHeading` (label + h2, one continuous progression, per-section colors via `--section-label-color`/`--section-heading-color`) or the `TextFill` atom for any other text (`--text-fill-color`). Both are driven by `useFillProgress`, which lerps the displayed progress toward the scroll target so the fill trails the scroll smoothly; the scrub window lives in `utils/scroll.ts#travelProgress`.
    - _Parallax / scroll work_: `useScrollFrame(callback)` (rAF-throttled scroll+resize; pass `null` to disable), progress formulas in `utils/scroll.ts` (`centeredProgress`, `travelProgress`, `enterProgress`), `usePrefersReducedMotion()` for gating, `useInView(ref)` for visibility flags. The header hides on scroll down and returns on scroll up (direction tracking in `Header.tsx`, same scroll frame as its theme probe).
- **Safe areas** — the viewport is `viewport-fit: cover`; the page paints under the notch / home-indicator bands and the fixed pieces (header, footer, Studio, drawers) pad by `env(safe-area-inset-*)` themselves.
