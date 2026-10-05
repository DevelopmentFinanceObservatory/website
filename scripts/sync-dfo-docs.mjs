// Copies the published dfo-docs artefacts the site renders from — the docs
// manifest and its markdown, and the roadmap — at one pinned commit of the
// `corpus` branch, into src/content/dfo-docs. The copy
// is committed: the build reads plain files and needs no access to the
// (private) dfo-docs repo, and moving the pin is re-running this script with
// a new SHA in a bump PR.
//
//   node scripts/sync-dfo-docs.mjs            # latest corpus commit
//   node scripts/sync-dfo-docs.mjs <sha>      # a specific one
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = 'https://github.com/ONEcampaign/dfo-docs.git';
const OUT = path.resolve(import.meta.dirname, '../src/content/dfo-docs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const tmp = mkdtempSync(path.join(tmpdir(), 'dfo-docs-'));

try {
    git(tmp, 'init', '-q');
    git(tmp, 'remote', 'add', 'origin', REPO);
    git(tmp, 'fetch', '-q', '--depth', '1', 'origin', process.argv[2] ?? 'corpus');

    const sha = git(tmp, 'rev-parse', 'FETCH_HEAD');
    const read = (file) => git(tmp, 'show', `FETCH_HEAD:${file}`);
    const index = JSON.parse(read('roadmap.json'));

    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(path.join(OUT, 'roadmap'), { recursive: true });
    writeFileSync(path.join(OUT, 'roadmap.json'), `${JSON.stringify(index, null, 2)}\n`);

    for (const track of index.tracks) {
        writeFileSync(path.join(OUT, track.file), `${read(track.file)}\n`);
    }

    const manifest = JSON.parse(read('manifest.json'));

    writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    for (const page of manifest.pages.filter((entry) => entry.corpus_path)) {
        mkdirSync(path.dirname(path.join(OUT, page.corpus_path)), { recursive: true });
        writeFileSync(path.join(OUT, page.corpus_path), `${read(page.corpus_path)}\n`);
    }

    writeFileSync(path.join(OUT, 'pin.json'), `${JSON.stringify({ repo: REPO, sha }, null, 2)}\n`);
    console.log(
        `dfo-docs pinned at ${sha} (${manifest.pages.length} docs pages, ${index.tracks.length} roadmap tracks)`,
    );
} finally {
    rmSync(tmp, { recursive: true, force: true });
}
