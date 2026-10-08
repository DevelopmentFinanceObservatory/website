// Copies the published dfo-docs artefacts the site renders from at one pinned
// commit of the `corpus` branch. The docs manifest, its markdown and the
// roadmap go to src/content/dfo-docs. The zip of each skill whose manifest
// page records a `bundle_path` goes to public/docs, where the site serves it
// at /docs/<page path>.zip. Each run empties both directories first, so they
// hold this script's output only. The copy is committed, so the build reads
// plain files and needs no access to the private dfo-docs repo. A bump PR
// moves the pin by re-running this script with a new SHA.
//
//   node scripts/sync-dfo-docs.mjs            # latest corpus commit
//   node scripts/sync-dfo-docs.mjs <sha>      # a specific one
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = 'https://github.com/ONEcampaign/dfo-docs.git';
const ROOT = path.resolve(import.meta.dirname, '..');

// execFileSync stops at 1 MiB of output unless told otherwise, and a skill's
// zip is stored uncompressed.
const MAX_BLOB_BYTES = 64 * 1024 * 1024;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// A file's bytes as committed. `git` above decodes UTF-8 and trims, either of
// which corrupts a zip.
const blob = (cwd, file) =>
    execFileSync('git', ['show', `FETCH_HEAD:${file}`], { cwd, maxBuffer: MAX_BLOB_BYTES });

export const syncDocs = ({
    repo = REPO,
    ref = 'corpus',
    out = path.join(ROOT, 'src/content/dfo-docs'),
    bundles = path.join(ROOT, 'public/docs'),
} = {}) => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'dfo-docs-'));

    try {
        git(tmp, 'init', '-q');
        git(tmp, 'remote', 'add', 'origin', repo);
        git(tmp, 'fetch', '-q', '--depth', '1', 'origin', ref);

        const sha = git(tmp, 'rev-parse', 'FETCH_HEAD');
        const read = (file) => git(tmp, 'show', `FETCH_HEAD:${file}`);
        const index = JSON.parse(read('roadmap.json'));

        rmSync(out, { recursive: true, force: true });
        mkdirSync(path.join(out, 'roadmap'), { recursive: true });
        writeFileSync(path.join(out, 'roadmap.json'), `${JSON.stringify(index, null, 2)}\n`);

        for (const track of index.tracks) {
            writeFileSync(path.join(out, track.file), `${read(track.file)}\n`);
        }

        const manifest = JSON.parse(read('manifest.json'));

        writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

        for (const page of manifest.pages.filter((entry) => entry.corpus_path)) {
            mkdirSync(path.dirname(path.join(out, page.corpus_path)), { recursive: true });
            writeFileSync(path.join(out, page.corpus_path), `${read(page.corpus_path)}\n`);
        }

        rmSync(bundles, { recursive: true, force: true });

        for (const page of manifest.pages.filter((entry) => entry.bundle_path)) {
            const file = path.join(bundles, `${page.path}.zip`);
            const inside = path.relative(bundles, file);

            if (!page.path || inside.startsWith('..') || path.isAbsolute(inside)) {
                throw new Error(`manifest page "${page.path}" has no path inside ${bundles}`);
            }

            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(file, blob(tmp, page.bundle_path));
        }

        writeFileSync(path.join(out, 'pin.json'), `${JSON.stringify({ repo, sha }, null, 2)}\n`);

        return { sha, pages: manifest.pages.length, tracks: index.tracks.length };
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
};

if (import.meta.main) {
    const { sha, pages, tracks } = syncDocs({ ref: process.argv[2] });

    console.log(`dfo-docs pinned at ${sha} (${pages} docs pages, ${tracks} roadmap tracks)`);
}
