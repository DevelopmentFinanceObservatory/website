# Prototypes

A static Next.js app served at `developmentfinance.org/prototypes`. Each prototype is one MDX page with its own React components and a JSON file of data fetched once with the DFO SDKs. The app imports the site's fonts, styles and components from `../src`, builds to static files, and deploys to a Cloudflare Worker on its own workflow, so a prototype ships without a website release.

## Set up

Install at the repository root first, then here. The app runs on the root install's `next`, `react` and `typescript`.

```sh
pnpm install            # at the repository root
cd prototypes
pnpm install
pnpm dev                # http://localhost:3000/prototypes/
```

## Start a prototype

```sh
pnpm new debt-diagnostic "Debt diagnostic"            # TypeScript data step
pnpm new debt-diagnostic "Debt diagnostic" --python   # Python data step
```

Run `pnpm data <slug>` before `pnpm dev` or `pnpm build`, because the page imports `_data/series.json`, which only the data step writes. `pnpm new` copies `template/` to `app/<slug>/`, writes the slug into its page and adds an entry dated today to the top of `registry.ts`. Write the entry's `summary` there. The index lists the registry entry and the page's metadata reads it, so each title and summary lives in one place. A slug is lowercase letters, digits and dashes.

```text
app/debt-diagnostic/
  page.mdx                  the write-up; imports the data and the components
  _components/SeriesChart.tsx   a client component; replace it with your own
  _data/fetch.mts           the data step (fetch.py with --python)
  _data/types.ts            the shape of the data, shared by the step and the components
  _data/series.json         written by the data step, committed
```

Folders starting with `_` become no route. `template/` sits outside `app/`, so it is type-checked and skipped by the build.

## Write the data step

A data step runs by hand, writes JSON, and the page imports that JSON at build time, so a page opens on committed data. A page may also call the site's API from the browser on the same origin, as `oda-counts` does to convert figures to a currency the reader picks. `pnpm dev` rewrites `/api/v1` to developmentfinance.org for that. Run a step with:

```sh
pnpm data debt-diagnostic
```

This runs `_data/fetch.mts` with Node, or `_data/fetch.py` with `uv run`. Without a key both SDKs call the API anonymously, under a per-IP quota, which is enough for one fetch a prototype.

In TypeScript, ask a question, fetch, keep the columns the page needs, and write them with `writeDataFile`:

```ts
import { Client } from '@developmentfinance/client';

import { writeDataFile } from '#lib/dataFile.mts';

const answer = await new Client().search(QUERY);
const dataset = await answer.fetch();
const data = (await dataset.toRows()).map((row) => ({
    year: Number(row.time_period),
    value: Number(row.value),
}));

writeDataFile(new URL('./series.json', import.meta.url), {
    query: QUERY,
    data,
    extra: { sentence: dataset.sentence, citation: dataset.citation.text },
});
```

`#lib/*` maps to `lib/*` (the `imports` field in `package.json`), so the same import works from `template/` and from `app/<slug>/`. Node files here end in `.mts` because the package has no `"type"` field, and a `.ts` file run by Node would load with a warning.

In Python, the script carries its own dependencies as PEP 723 inline metadata, and uv installs them in a cached environment:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = ["development-finance==0.4.2"]
# ///
```

`uv run --script _data/fetch.py` runs it, and `pnpm data` does that for you. The template's `fetch.py` builds the same envelope by hand. The core is:

```python
envelope = {
    "provenance": {"sdk": f"development-finance=={dfo.__version__}", "query": QUERY,
                   "retrieved": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")},
    "data": data,
}
Path(__file__).with_name("series.json").write_text(json.dumps(envelope, indent=2) + "\n")
```

### The envelope

Every JSON file under `app/*/_data/` has this shape:

```json
{
    "provenance": {
        "sdk": "@developmentfinance/client@0.5.0",
        "query": "ODA from Germany to Nigeria",
        "retrieved": "2026-11-16T09:30:00.000Z",
        "sentence": "Germany's net disbursements (bilateral flows) to Nigeria ...",
        "citation": "OECD DAC2A (2026), via the Development Finance Observatory"
    },
    "data": []
}
```

`sdk`, `query` and `retrieved` are required. `writeDataFile` stamps the SDK version from the installed client and the time in UTC. Anything else, such as Search's sentence, the citation or a share URL, goes in `extra`. The provenance sits in the same file as the data so the two cannot drift apart, and the page prints its source line from it. The file is committed so CI builds without DFO credentials and the page shows the same numbers until you refetch. `pnpm check:data` fails on a data file without the three required fields, and CI runs it.

### Pinned reads and refs

A data step that wants its numbers to reproduce reads through refs. A ref names the exact dataset versions a read returned, so a later run fetches the same bytes and the output does not drift when DFO revises its data. `data.ref.to_json()` (Python) and `data.ref.toJSON()` (TypeScript) write one, and `DatasetRef.from_json` and `DatasetRef.fromJSON` read it back. Pin a dataset's versions before committing its ref, because an unpinned version expires.

`app/<slug>/_data/refs.json` is an envelope whose `provenance` is `{ "sdk": "development-finance==0.4.2", "query": "<prototype> pinned reads", "retrieved": <time of the refresh run> }`. Its `data` maps each read key to the ref and the dataset's provenance:

```json
{
    "provenance": {
        "sdk": "development-finance==0.4.2",
        "query": "oda-counts pinned reads",
        "retrieved": "2026-11-19T09:30:00.000Z"
    },
    "data": {
        "germany-kenya": {
            "ref": { "format_version": 1, "members": [] },
            "provenance": { "...": "data.provenance.to_json()" }
        }
    }
}
```

A step runs in one of three modes:

- Plain, the default: fetch each committed ref, write the outputs, and copy `provenance` and `retrieved` from `refs.json`. The outputs reproduce byte for byte.
- `--refresh`: fetch the latest version of each ref (`latest=True`), pin it, and rewrite `refs.json`.
- `--search`: with no refs yet, search or build the specs the step defines, pin them, and write `refs.json`. A ref keeps its window and spec, so a step uses this mode once and `--refresh` after.

To check that a step reproduces, run it plain with an empty `DFO_CACHE_DIR`, confirm every member of every ref is pinned, then run `git diff --exit-code -- app/<slug>/_data`.

`pnpm check:data` requires each entry of `refs.json` to have a `ref` object (with `format_version`) that lists at least one member, and a `provenance` object whose members are listed and all pinned. It requires each entry of `live-refs.json` to be a ref object with members, each of whose content versions is pinned in the same directory's `refs.json`. Each problem prints with a code such as `live_member_unpinned`.

### Reads in the browser

A figure a page derives on the client reads its rows in the browser. The step writes the refs for those reads to `_data/live-refs.json`, the same envelope with `data` mapping each key to a ref object. A field the browser reads is left out of the committed JSON, and no server-rendered text derives from it, so the page has one source for each number.

`lib/liveRef.ts` reads a page's refs with an anonymous client on the production API and runs the page's derivation on their rows. It reads the version DFO stores as the newest of each member's spec, so the page shows a release DFO took in after the step ran. When any stored read fails, takes longer than 10 seconds, or gives rows the derivation refuses, it reads every ref's pinned version instead, the numbers the step committed, and warns in the console. `asCommitted` says whether every dataset is the version its ref pins, so the page knows whether a label the step committed, such as a release name, describes the figures. Each dataset's `freshness` says whether DFO has confirmed a stored version against its sources (`current`), is checking (`pending`) or could not check (`stale`), and is null after the fallback.

```tsx
'use client';

import { useEffect, useState } from 'react';

import { readLiveRefs, type LiveRead } from '#lib/liveRef.ts';

import liveRefs from '../_data/live-refs.json';

export function useTotals() {
    const [read, setRead] = useState<LiveRead<'gross', number>>();
    const [error, setError] = useState<unknown>();

    useEffect(() => {
        const abort = new AbortController();
        const total = (rows: { gross: { value?: unknown }[] }) =>
            rows.gross.reduce((sum, row) => sum + Number(row.value ?? 0), 0);

        readLiveRefs({ gross: liveRefs.data.gross }, total, { signal: abort.signal }).then(
            setRead,
            (reason) => {
                if (!abort.signal.aborted) setError(reason);
            },
        );

        return () => abort.abort();
    }, []);

    return { read, error };
}
```

`readLiveRefs` raises before any request for a ref it cannot read, raises the pinned read's error or the derivation's error on the pinned rows when the fallback fails too, and raises on an aborted signal without falling back. The component shows its loading and error states, and the page owns its hook.

## Write the page

`page.mdx` is Markdown with JSX. It takes its metadata from the registry and its numbers from the envelope:

```mdx
import { prototype } from '../../registry';
import series from './_data/series.json';

export const entry = prototype('debt-diagnostic');
export const metadata = { title: entry.title, description: entry.summary };

Source: {series.provenance.citation}, fetched on {series.provenance.retrieved.slice(0, 10)}.
```

Link to the main site with absolute URLs such as `https://developmentfinance.org/data`. The app's `basePath` turns a root-relative link into `/prototypes/data`, which does not exist. `SourceLink` already writes absolute URLs here. `pnpm check:dist` fails on any link, image or CSS `url()` in the build that leaves `/prototypes/` or names a missing file.

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

`pnpm build` runs `next build`, then moves the export to `dist/prototypes/` and copies `edge/_headers` and `edge/_redirects` to `dist/`. `pnpm preview` serves `dist/` as the Worker does in production, including trailing-slash redirects and the 404 page. Rebuild before previewing a change.

## Deploys and previews

`.github/workflows/deploy-prototypes.yml` builds and deploys the app, and the website's deploy workflows ignore `prototypes/`.

- A push to `dev` that touches `prototypes/` or the workflow deploys to `developmentfinance.org/prototypes` with `wrangler deploy`, then checks that `/prototypes/` serves this app and that the site root still serves the website. There is no approval step, and the build uses `dev`'s `src/`.
- A ready pull request that touches `prototypes/`, `src/`, the root manifest or the workflow builds the app and runs the checks above. When the secrets are set it uploads a preview version under the alias `pr-<number>` and writes its workers.dev URL to the job summary. Draft pull requests skip.

The workflow reads two repository secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts edit on the account, Workers Routes edit and Zone read on `developmentfinance.org`) and `CLOUDFLARE_ACCOUNT_ID`. Without them, previews are skipped and a deploy fails naming the missing secret. `wrangler.jsonc` holds the Worker's name, route and assets settings.

## SDK versions

Prototypes use `@developmentfinance/client@0.5.0` from npm and `development-finance==0.4.2` from PyPI, pinned exactly in `package.json` and in each step's PEP 723 header. The pin gives a reader the release a prototype used. Client 0.5.0 is the first npm release with `latest: "stored"`, which the pages' browser reads use, and 0.4.2 is the first PyPI release with `data.provenance`, pinned refs through `client.fetch(ref)` and `dfo.analysis`. The website vendors client 0.1.0 as a tarball in `vendor/`, with `check:client-provenance` recording which sdk commit built it. The two do not meet, because data steps run in Node outside the website's bundle and `prototypes/node_modules` holds 0.5.0 for everything under `prototypes/`. A step moves to a newer release by raising its header and rerunning with `--refresh`.
