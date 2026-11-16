// `pnpm new <slug> [title] [--python]`: starts a prototype. Copies template/
// to app/<slug>/, names the slug in its page.mdx, keeps the TypeScript data
// step (or the Python one with --python), and adds an entry to the top of
// registry.ts dated today. Refuses a slug that exists or does not fit a URL.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const APP = path.join(import.meta.dirname, '..');
const TEMPLATE = path.join(APP, 'template');
const REGISTRY = path.join(APP, 'registry.ts');
const LIST_START = 'export const prototypes: Prototype[] = [';
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function fail(message: string): never {
    console.error(`new: ${message}`);
    process.exit(1);
}

const args = process.argv.slice(2);
const python = args.includes('--python');
const [slug, title] = args.filter((arg) => arg !== '--python');

if (!slug) {
    fail('usage: pnpm new <slug> [title] [--python]');
}

if (!SLUG.test(slug)) {
    fail(
        `"${slug}" is not a slug: use lowercase letters, digits and single dashes, starting with a letter.`,
    );
}

const target = path.join(APP, 'app', slug);
const registry = readFileSync(REGISTRY, 'utf8');

if (existsSync(target)) {
    fail(`app/${slug}/ already exists.`);
}

if (registry.includes(`slug: '${slug}'`)) {
    fail(`registry.ts already has an entry for "${slug}".`);
}

if (!registry.includes(LIST_START)) {
    fail(`registry.ts no longer contains "${LIST_START}"; add the entry by hand.`);
}

/** A single-quoted TypeScript string literal, as the repository's Prettier writes them. */
const quote = (text: string): string => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

const entryTitle = title ?? slug.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const date = new Date().toISOString().slice(0, 10);
const entry = [
    '    {',
    `        slug: '${slug}',`,
    `        title: ${quote(entryTitle)},`,
    "        summary: 'One or two sentences for the index and the link preview.',",
    `        date: '${date}',`,
    '    },',
].join('\n');

// An empty list reads `= [];` and a filled one has its entries on the next lines.
const updated = registry.includes(`${LIST_START}];`)
    ? registry.replace(`${LIST_START}];`, `${LIST_START}\n${entry}\n];`)
    : registry.replace(`${LIST_START}\n`, `${LIST_START}\n${entry}\n`);

cpSync(TEMPLATE, target, { recursive: true });
rmSync(path.join(target, '_data', python ? 'fetch.mts' : 'fetch.py'));

const page = path.join(target, 'page.mdx');
writeFileSync(page, readFileSync(page, 'utf8').replaceAll('__SLUG__', slug));
writeFileSync(REGISTRY, updated);

console.log(`Created app/${slug}/ and its entry in registry.ts.
Next:
  1. Write the summary in registry.ts and the question in app/${slug}/_data/fetch.${python ? 'py' : 'mts'}.
  2. pnpm data ${slug}     writes app/${slug}/_data/series.json; commit it.
  3. pnpm dev              then open http://localhost:3000/prototypes/${slug}/`);
