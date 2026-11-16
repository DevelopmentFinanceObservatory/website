// `pnpm check:dist`, after `pnpm build`: every href, src and srcset in
// dist/**/*.html and every CSS url() in dist/**/*.css must stay inside
// /prototypes/ and point at a file dist/ holds. The Worker serves only
// /prototypes*, so a root-relative link elsewhere (a shared component's
// /data/... path without siteHref) reaches the main site or a 404, and a
// missing file under /prototypes/ (a font, the WorldMap mask) breaks the page.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const DIST = path.join(import.meta.dirname, '..', 'dist');
const BASE = '/prototypes/';

const HTML_TAG = /<[a-z][\w-]*\b[^>]*>/gi;
const HTML_ATTRIBUTE = /\s(href|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
// Next writes <link rel="preconnect" href="/">, a connection hint to the
// page's own origin that loads no file.
const CONNECTION_HINT = /\srel\s*=\s*["']?(?:preconnect|dns-prefetch)\b/i;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

const failures: string[] = [];

const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);

        return entry.isDirectory() ? files(full) : [full];
    });

const decodeEntities = (value: string): string =>
    value
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#x27;', "'")
        .replaceAll('&#39;', "'");

/** The file in dist/ a URL path names, or null when there is none. With
 *  trailingSlash a page is <path>/index.html. */
const servedFile = (urlPath: string): string | null => {
    const relative = decodeURIComponent(urlPath).replace(/^\/+/, '');
    const candidates = urlPath.endsWith('/')
        ? [path.join(DIST, relative, 'index.html')]
        : [path.join(DIST, relative), path.join(DIST, relative, 'index.html')];

    return candidates.find((file) => existsSync(file) && statSync(file).isFile()) ?? null;
};

/** Checks one reference made by `file`, whose URL path is `fileUrl`. */
const check = (file: string, fileUrl: string, raw: string) => {
    const value = decodeEntities(raw.trim());

    if (value === '' || EXTERNAL.test(value)) {
        return;
    }

    const resolved = new URL(value, `https://prototypes.invalid${fileUrl}`);
    const where = path.relative(DIST, file);

    if (resolved.pathname !== '/prototypes' && !resolved.pathname.startsWith(BASE)) {
        failures.push(
            `${where}: "${value}" leaves ${BASE}; link to the main site with an absolute https://developmentfinance.org/... URL.`,
        );

        return;
    }

    if (!servedFile(resolved.pathname)) {
        failures.push(`${where}: "${value}" names a file dist/ lacks.`);
    }
};

if (!existsSync(DIST)) {
    console.error('check:dist: no dist/; run pnpm build first.');
    process.exit(1);
}

for (const required of ['prototypes/index.html', 'prototypes/404.html']) {
    if (!existsSync(path.join(DIST, required))) {
        failures.push(`dist/${required} is missing.`);
    }
}

let checked = 0;

for (const file of files(DIST)) {
    const fileUrl = `/${path.relative(DIST, file).split(path.sep).join('/')}`;
    const text = readFileSync(file, 'utf8');

    if (file.endsWith('.html')) {
        for (const [tag] of text.matchAll(HTML_TAG)) {
            if (CONNECTION_HINT.test(tag)) {
                continue;
            }

            for (const match of tag.matchAll(HTML_ATTRIBUTE)) {
                const value = match[2] ?? match[3];
                const urls =
                    match[1].toLowerCase() === 'srcset'
                        ? value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0])
                        : [value];

                for (const url of urls) {
                    checked += 1;
                    check(file, fileUrl, url);
                }
            }
        }
    }

    if (file.endsWith('.html') || file.endsWith('.css')) {
        for (const match of text.matchAll(CSS_URL)) {
            checked += 1;
            check(file, fileUrl, match[1] ?? match[2] ?? match[3]);
        }
    }
}

if (checked === 0) {
    failures.push('no href, src or url() found in dist/; the build looks empty.');
}

if (failures.length > 0) {
    console.error(failures.map((failure) => `check:dist: ${failure}`).join('\n'));
    process.exit(1);
}

console.log(`check:dist: ${checked} references in dist/ stay under ${BASE} and resolve.`);
