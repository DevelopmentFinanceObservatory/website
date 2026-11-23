# Prototypes

A static Next.js app served at `developmentfinance.org/prototypes`. Each prototype is one MDX page with its own React components. A page reads its figures from DFO when the app builds, through the DFO SDK, and the repository keeps only the queries it asks and the inputs that come from outside DFO. The app imports the site's fonts, styles and components from `../src`, builds to static files, and deploys to a Cloudflare Worker from the `prototypes` branch, rebuilt every day, so a prototype ships without a website release.

## Set up

Install at the repository root first, then here. The app runs on the root install's `next`, `react` and `typescript`.

```sh
pnpm install            # at the repository root
cd prototypes
pnpm install
pnpm dev                # http://localhost:3000/prototypes/
```

Work on prototypes from the `prototypes` branch, which is dev plus `prototypes/`. Branch from it and open the pull request into it. `prototypes/` lives on `prototypes` alone: dev holds none of it, and the sync workflow refuses a dev change that adds or edits a file there.

## Start a prototype

```sh
pnpm new debt-diagnostic "Debt diagnostic"            # TypeScript refs step
pnpm new debt-diagnostic "Debt diagnostic" --python   # Python refs step
pnpm read                                             # reads DFO into .build-data/
pnpm dev
```

`pnpm new` copies `template/` to `app/<slug>/`, writes the slug wherever the template says `__SLUG__` (the page, its build read's name and `refs.json`), and adds an entry dated today to the top of `registry.ts`. Write the entry's `summary` there. The index lists the registry entry and the page's metadata reads it, so each title and summary lives in one place. A slug is lowercase letters, digits and dashes. The new page builds as it stands: it reads the committed ref in `refs.json` and charts one provider's ODA. `pnpm read` finds its `_lib/build.ts` by its path, so nothing else needs registering. To have `pnpm check:live` check it after a deploy, add its slug to `PAGES` in `scripts/check-live.mts`.

```text
app/debt-diagnostic/
  page.mdx                      the write-up; renders the server components
  _components/Built.tsx         server components that read the build's data with readBuilt
  _components/SeriesChart.tsx   a client component; replace it with your own
  _lib/build.ts                 the page's BuildPage: its DFO reads and what it derives from them
  _data/refs.json               the reads the build makes, committed
  _data/fetch.mts               the refs step that rewrites refs.json (fetch.py with --python)
```

Folders starting with `_` become no route. `template/` sits outside `app/`, so it is type-checked and skipped by the build.

## Read DFO at build

A page's figures come from the build. Its `_lib/build.ts` default-exports a `BuildPage` (`lib/buildRead.ts`) named after the page's directory, whose `build` does all the page's DFO work, mostly through `readSettled(page, sources, derive)`. That runs each source at DFO's newest stored version through `readStored` (`lib/liveRead.ts`), with no fallback, and hands the rows and datasets to `derive`. A source is `{ ref }`, a ref from the page's `_data/`, or `{ recipe }`, an analysis recipe. `pnpm read` (`scripts/read.mts`) imports every `app/*/_lib/build.ts`, runs each page's `build` in one Node process through one set of lanes, and writes each result to `.build-data/<page>.json` (`lib/buildData.ts`), which git ignores. `pnpm build` runs it before `next build`, so a failed read or a derivation that refuses its rows stops the build, naming the page, and production keeps the last good deploy.

The page's server components read the file through `readBuilt(page)`, and client components take what they need as props:

```tsx
import page from '../_lib/build.ts';
import SeriesChart from './SeriesChart';

import { readBuilt } from '#lib/buildData.ts';

export const BuiltSeries = async () => {
    const { value } = await readBuilt(page);

    return <SeriesChart series={value} />;
};
```

Under `next build` a missing file is an error naming `pnpm read`. Under `next dev` a missing file runs the page's `build` once and writes it, so delete `.build-data/` or run `pnpm read` for newer figures. The result carries `value`, `retrieved` (UTC, for the page to print) and, per source, the spec ids and content versions read (a recipe's resolved roots) with their `freshness`. The part of the page the build's figures fill carries `data-read-tier="built"` and `data-read-live="built"`, which `pnpm check:live` reads.

Each read may take 5 minutes, since the build is often the first reader after DFO takes in new data and meets cold computes. While any dataset's `freshness` is `pending`, DFO is checking its sources for newer data; the build reads again every 30 seconds, for at most `BUILD_PENDING_BOUND_S` seconds, then takes what it has. Unset, the bound is 0, so a local build, a push and a pull request take what DFO serves at once, and the daily build waits up to 600 seconds. Build reads use their own anonymous client on the production API and one set of lanes across every page, at most four reads and two recipes at once (`READ_CONCURRENCY`, `ANALYSIS_CONCURRENCY`), so a build from a shared runner address stays inside the gateway's allowances.

`fragility-finance`, `hiv-financing` and `oda-counts` read this way. A build-read page commits no DFO figures. Its `_data/` holds the refs it reads and the inputs from outside DFO, such as `fragility-finance`'s `fragility-2026.tsv`. Quotes and figures from outside DFO, such as `hiv-financing`'s KFF and UNAIDS quotes, stay in the page's code.

## Write the refs step

`_data/refs.json` is the page's query config, the reads its build makes. A ref names a dataset's spec, its window and the version a step read, so a page reads the same question on every build. The build reads each ref's newest stored version, so the version in the file marks when the step last ran; the step pins it so the ref stays fetchable. `data.ref.toJSON()` (TypeScript) and `data.ref.to_json()` (Python) write a ref, and `DatasetRef.fromJSON` and `DatasetRef.from_json` read it back. Run a page's step with:

```sh
pnpm data debt-diagnostic              # fetch each committed ref's newest version, pin it, rewrite refs.json
pnpm data debt-diagnostic --search     # ask the step's QUERY instead, pin the answer and write it
```

This runs `_data/fetch.mts` with Node, or `_data/fetch.py` with `uv run`. Without a key both SDKs call the API anonymously, under a per-IP quota, which is enough for one step. Each new pin counts against a daily allowance. `#lib/*` maps to `lib/*` (the `imports` field in `package.json`), so the same import works from `template/` and from `app/<slug>/`. Node files here end in `.mts` because the package has no `"type"` field, and a `.ts` file run by Node would load with a warning.

In Python, the script carries its own dependencies as PEP 723 inline metadata, and uv installs them in a cached environment:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = ["development-finance==0.6.0"]
# ///
```

### The envelope

Every JSON file under `app/*/_data/` has this shape:

```json
{
    "provenance": {
        "sdk": "development-finance==0.6.0",
        "query": "debt-diagnostic reads",
        "retrieved": "2026-11-19T09:30:00.000Z"
    },
    "data": {}
}
```

`sdk`, `query` and `retrieved` are required. `writeDataFile` (`lib/dataFile.mts`) stamps the SDK version from the installed client and the time in UTC, and a Python step writes the same fields by hand. `pnpm check:data` fails on a data file without the three required fields, and CI runs it.

`refs.json`'s `data` maps each read key to the ref and the dataset's provenance:

```json
{
    "germany-kenya": {
        "ref": { "format_version": 1, "members": [] },
        "provenance": { "...": "data.provenance.to_json()" }
    }
}
```

`live-refs.json` maps each key to a ref object alone; `hiv-financing` and `oda-counts` build from it, and `debt-thresholds` reads it in the browser. `pnpm check:data` requires each entry of `refs.json` to have a `ref` object (with `format_version`) that lists at least one member, and a `provenance` object whose members are listed and all pinned. It requires each entry of `live-refs.json` to be a ref object with members, each of whose content versions is pinned in the same directory's `refs.json`. Each problem prints with a code such as `live_member_unpinned`.

## Read in the browser

`debt-thresholds` commits its figures: its Python step writes `thresholds.json` and `transfers.json` to `_data/`, and its page imports them. Its net-transfers section also reads in the browser through `readLive` (`lib/liveRead.ts`), which reads the sources at DFO's newest stored versions with an anonymous client on the production API, four at a time (`READ_CONCURRENCY`) and at most two recipes at a time (`ANALYSIS_CONCURRENCY`). When any stored read fails, takes longer than 10 seconds, or gives rows the derivation refuses, it warns in the console and falls back to one of two tiers, which the page names:

- `committed`: figures the page committed, with no request. The page renders them first and swaps in the stored figures when they arrive. A page with a recipe falls back here, because a pinned analysis posts to the same server and fails the same way.
- `pinned`: every ref's pinned version, the rows the step read. A page whose committed JSON leaves the figures out falls back here and shows a loading state until they arrive, as `debt-thresholds`' net transfers do.

`tier` on `readLive`'s result says which tier the figures came from: `stored`, `pinned` or `committed`. The page puts it on the root of the part it derives as `data-read-tier`, with `loading` before it has figures and `failed` when every tier failed (`tierAttribute`), and puts its read switch on the same root as `data-read-live`, so `pnpm check:live` can assert that the section reads `stored`. Each dataset's `freshness` says whether DFO has confirmed a stored version against its sources (`current`), is checking (`pending`) or could not check (`stale`), and is null after a pinned fallback.

Each stored read is two GETs: the spec's newest stored version, then its file. Each stored recipe is two requests: the analysis POST, then its file. The website's gateway counts each request that reaches it against an allowance per address (`src/lib/proxy/rateLimit.ts`): `datasets`, 300 a minute, for every path below `/api/v1/datasets/`, and `api`, 120 a minute, for every other `/api` route, Search resolve among them. The pacer in `lib/pacing.ts` keeps one reading per allowance. A file the edge cache serves does not reach the gateway. `oda-counts` posts to the site's same-origin Search API from the browser when a reader picks another currency or base year, on the `api` allowance; `pnpm dev` rewrites `/api/v1` to developmentfinance.org for that.

`readLive` raises before any request for a ref it cannot read or a recipe with a `pinned` fallback, raises the pinned read's error or the derivation's error on the pinned rows when that fallback fails too, and raises on an aborted signal without falling back. The page owns its hook and its loading and error states.

## Write the page

`page.mdx` is Markdown with JSX. It takes its metadata from the registry and its figures from the server components:

```mdx
import { prototype, prototypeMetadata } from '../../registry';

import { BuiltSeries, Citation, Retrieved } from './_components/Built';

export const entry = prototype('debt-diagnostic');
export const metadata = prototypeMetadata(entry);

<BuiltSeries />

Source: <Citation />. Read from the [Development Finance Observatory](https://developmentfinance.org/data) on <Retrieved />.
```

Link to the main site with absolute URLs such as `https://developmentfinance.org/data`. The app's `basePath` turns a root-relative link into `/prototypes/data`, which does not exist. `SourceLink` writes absolute URLs here. `pnpm check:dist` fails on any link, image or CSS `url()` in the build that leaves `/prototypes/` or names a missing file.

Every page carries the site's own header and footer (`src/components/organisms/Header` and `Footer`), as `src/app/(site)/layout.tsx` does. They build their links with `siteHref` from `src/lib/site.ts`, which returns the path unchanged on the website and an absolute `https://developmentfinance.org/...` URL here, because `next.config.ts` sets `NEXT_PUBLIC_SITE_LINK_ORIGIN`. Their buttons load the site page in full, and no menu entry is marked current. The header is fixed, so a page's first block starts below it: the index opens with the site's dark `PageHero`, which also turns the header light, and MDX pages pad their top through `components/Prose`. The account button asks the site's `/api/auth` for the session, which answers in production because the Worker shares the site's origin. Locally the request fails with a 404 and the button stays in its signed-out state. Every page also loads the site's consent manager and GA4 tag through `src/components/atoms/Analytics`, and `pnpm check:dist` fails on a page without the consent scripts. The consent manager shows and stores the visitor's site-wide choices. GA4 records page views under `/prototypes/` on developmentfinance.org only, with cookies once the visitor consents and as cookieless pings until then, as on the site. GA4 also counts every URL change made through the history API as a page view, so a prototype keeps its state out of the address bar and puts it in the links it offers, as the debt-thresholds page's copy-link button does.

Shared components import from `@/components/...` as in the site. Interactive ones need `'use client'` in your component file. Some shared components work only inside a client component. `StatTiles` calls `revealIndex` from a client module, and its tiles stay hidden until the site's `useReveal` hook marks them. Wrap such a component in a small client component of your own that calls `useReveal`, and use the wrapper from MDX.

## Dependencies

There is one copy of `next` and `react`, the root's. A second copy under `prototypes/node_modules` would load two Reacts and two Next routers, which breaks hooks and `<Link>`. So `package.json` here lists only what the site lacks, `.npmrc` turns off automatic peer installs, and `pnpm check:deps` fails when `next`, `react`, `react-dom` or their types appear here, or when `@next/mdx` differs from the root's `next` version. Add a package with `pnpm add -D <name>@<version>` here. This folder has its own lockfile and is not a pnpm workspace.

## Build and preview

```sh
pnpm test && pnpm check:data && pnpm typecheck && pnpm build && pnpm check:dist
pnpm preview            # wrangler dev on dist/, http://localhost:8787/prototypes/
pnpm preview --port 8798   # when 8787 is taken
```

`pnpm build` runs `pnpm read`, then `next build`, then moves the export to `dist/prototypes/` and copies `edge/_headers` and `edge/_redirects` to `dist/`. `pnpm preview` serves `dist/` as the Worker does in production, including trailing-slash redirects and the 404 page. Rebuild before previewing a change.

## Deploys and previews

`.github/workflows/deploy-prototypes.yml` builds and deploys the app from the `prototypes` branch, and the website's deploy workflows ignore `prototypes/`. Nothing on dev or main builds prototypes.

- A push to `prototypes` that touches `prototypes/`, `src/`, the root manifest or the workflow deploys to `developmentfinance.org/prototypes` with `wrangler deploy`, then checks that `/prototypes/` serves this app, that the site root still serves the website, and that each page in `scripts/check-live.mts` serves this run's build on its expected tier. There is no approval step.
- A ready pull request into `prototypes` that touches the same paths builds the app and runs the checks. When the secrets are set it uploads a preview version under the alias `pr-<number>` and writes its workers.dev URL to the job summary. Draft pull requests skip.
- `.github/workflows/prototypes-daily.yml` dispatches the deploy on `prototypes` at 05:17 UTC every day with a 600-second pending bound, so the pages carry DFO's newest stored data. A failed read fails the build without deploying, and the last deploy stays live. GitHub mails a failed scheduled run to whoever last edited its schedule.
- `.github/workflows/prototypes-sync.yml` merges every push to dev into `prototypes`, keeping `prototypes/` as `prototypes` has it, and dispatches the deploy, so the build uses dev's `src/`. A rerun dispatches the deploy again unless one of the head is queued, running or succeeded. When the merge conflicts outside `prototypes/`, or changes a workflow file, which the workflow's token may not push, it opens a pull request from `sync/dev-into-prototypes` into `prototypes` for a person to finish. Merge that pull request with "Create a merge commit": it makes dev's commits ancestors of `prototypes`, so later syncs merge from a current base and meet fewer of the same conflicts.

The daily and sync workflows run from dev, since GitHub runs schedules and dispatches only from workflow files on the default branch, and dev holds `deploy-prototypes.yml` identical to the copy on `prototypes`. The deploy workflow reads two repository secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts edit on the account, Workers Routes edit and Zone read on `developmentfinance.org`) and `CLOUDFLARE_ACCOUNT_ID`. Without them, previews are skipped and a deploy fails naming the missing secret. `wrangler.jsonc` holds the Worker's name, route and assets settings.

## SDK versions

Prototypes use `@developmentfinance/client@0.7.0` from npm, pinned exactly in `package.json`, for the build's reads, the browser reads and the TypeScript steps, and `development-finance` from PyPI, pinned exactly in each Python step's PEP 723 header: 0.6.0 for `fragility-finance`, `hiv-financing` and the template, 0.4.2 for `oda-counts` and `debt-thresholds`. The pin gives a reader the release a prototype used. Client 0.5.0 is the first npm release with `latest: "stored"`, which the build's reads and the browser reads use, 0.6.0 the first that reads a recipe at `latest: "stored"`, and 0.7.0 the first that reads one in two requests. PyPI 0.4.2 is the first release with `data.provenance`, pinned refs through `client.fetch(ref)` and `dfo.analysis`. The website vendors client 0.1.0 as a tarball in `vendor/`, with `check:client-provenance` recording which sdk commit built it. The two do not meet, because the prototypes build and steps run in Node outside the website's bundle and `prototypes/node_modules` holds 0.7.0 for everything under `prototypes/`. A step moves to a newer release by raising its header and running again.
