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

`pnpm new` copies `template/` to `app/<slug>/`, writes the slug into its page and adds an entry dated today to the top of `registry.ts`. Write the entry's `summary` there: the index lists it and the page's metadata reads it, so a title lives in one place. A slug is lowercase letters, digits and dashes.

```text
app/debt-diagnostic/
  page.mdx                  the write-up; imports the data and the components
  _components/SeriesChart.tsx   a client component; replace it with your own
  _data/fetch.mts           the data step (fetch.py with --python)
  _data/types.ts            the shape of the data, shared by the step and the components
  _data/series.json         written by the data step, committed
```

Folders starting with `_` never become routes. `template/` sits outside `app/`, so it is type-checked and never built.

## Write the data step

The browser makes no API calls. A data step runs by hand, writes JSON, and the page imports that JSON at build time:

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
const data = (await dataset.toRows()).map((row) => ({ year: Number(row.time_period), value: Number(row.value) }));

writeDataFile(new URL('./series.json', import.meta.url), {
    query: QUERY,
    data,
    extra: { sentence: dataset.sentence, citation: dataset.citation.text },
});
```

`#lib/*` maps to `lib/*` (the `imports` field in `package.json`), so the same import works from `template/` and from `app/<slug>/`. Node files here end in `.mts` because the package has no `"type"` field; a `.ts` file run by Node would load with a warning.

In Python, the script carries its own dependencies as PEP 723 inline metadata, and uv installs them in a cached environment:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = ["development-finance==0.2.0"]
# ///
```

`uv run --script _data/fetch.py` runs it, and `pnpm data` does that for you. The template's `fetch.py` builds the same envelope by hand; the part that matters is six lines:

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
    "sdk": "@developmentfinance/client@0.2.0",
    "query": "ODA from Germany to Nigeria",
    "retrieved": "2026-11-16T09:30:00.000Z",
    "sentence": "Germany's net disbursements (bilateral flows) to Nigeria ...",
    "citation": "OECD DAC2A (2026), via the Development Finance Observatory"
  },
  "data": []
}
```

`sdk`, `query` and `retrieved` are required; `writeDataFile` stamps the SDK version from the installed client and the time in UTC. Anything else, such as Search's sentence, the citation or a share URL, goes in `extra`. The provenance sits in the same file as the data so the two cannot drift apart, and the page prints its source line from it. The file is committed so CI builds without DFO credentials and the page shows the same numbers until you refetch. `pnpm check:data` fails on a data file without the three required fields, and CI runs it.

## Write the page

`page.mdx` is Markdown with JSX. It takes its metadata from the registry and its numbers from the envelope:

```mdx
import { prototype } from '../../registry';
import series from './_data/series.json';

export const entry = prototype('debt-diagnostic');
export const metadata = { title: entry.title, description: entry.summary };

Source: {series.provenance.citation}, fetched on {series.provenance.retrieved.slice(0, 10)}.
```

Link to the main site with absolute URLs: `https://developmentfinance.org/data`, not `/data`. The app's `basePath` turns a root-relative link into `/prototypes/data`, which does not exist. `SourceLink` already writes absolute URLs here. `pnpm check:dist` fails on any link, image or CSS `url()` in the build that leaves `/prototypes/` or names a missing file.

Shared components import from `@/components/...` as in the site. Interactive ones need `'use client'` in your component file. Some shared components only work inside a client component: `StatTiles` calls `revealIndex` from a client module, and its tiles stay hidden until the site's `useReveal` hook marks them. Wrap such a component in a small client component of your own, as `components/RevealStatTiles` does, and use the wrapper from MDX.

## Dependencies

There is one copy of `next` and `react`, the root's. A second copy under `prototypes/node_modules` would load two Reacts and two Next routers, which breaks hooks and `<Link>`. So `package.json` here lists only what the site lacks, `.npmrc` turns off automatic peer installs, and `pnpm check:deps` fails when `next`, `react`, `react-dom` or their types appear here, or when `@next/mdx` no longer matches the root's `next`. Add a package with `pnpm add -D <name>@<version>` here; this folder has its own lockfile and is not a pnpm workspace.

## Build and preview

```sh
pnpm check:data && pnpm typecheck && pnpm build && pnpm check:dist
pnpm preview            # wrangler dev on dist/, http://localhost:8787/prototypes/
pnpm preview --port 8798   # when 8787 is taken
```

`pnpm build` runs `next build`, then moves the export to `dist/prototypes/` and copies `edge/_headers` and `edge/_redirects` to `dist/`. `pnpm preview` serves `dist/` as the Worker does in production, including trailing-slash redirects and the 404 page; rebuild before previewing a change.

## Deploys and previews

`.github/workflows/deploy-prototypes.yml` builds and deploys the app; the website's deploy workflows ignore `prototypes/`.

- A push to `dev` that touches `prototypes/` or the workflow deploys to `developmentfinance.org/prototypes` with `wrangler deploy`, then checks that `/prototypes/` serves this app and that the site root still serves the website. There is no approval step, and the build uses `dev`'s `src/`.
- A ready pull request that touches `prototypes/`, `src/`, the root manifest or the workflow builds the app and runs the checks above. When the secrets are set it uploads a preview version under the alias `pr-<number>` and writes its workers.dev URL to the job summary. Draft pull requests skip.

The workflow reads two repository secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts edit on the account, Workers Routes edit and Zone read on `developmentfinance.org`) and `CLOUDFLARE_ACCOUNT_ID`. Without them, previews are skipped and a deploy fails naming the missing secret. `wrangler.jsonc` holds the Worker's name, route and assets settings.

## Why SDK 0.2.0

Prototypes use `@developmentfinance/client@0.2.0` from npm and `development-finance==0.2.0` from PyPI. The website vendors client 0.1.0 as a tarball in `vendor/`, with `check:client-provenance` recording which sdk commit built it, because 0.1.0 was never published. 0.2.0 is published with npm provenance attestations, which record the same thing, and anyone reading a prototype can install the release it used. 0.2.0 breaks 0.1.0's API, but the two never meet: data steps run in Node, outside the website's bundle, and `prototypes/node_modules` holds 0.2.0 for everything under `prototypes/`.
