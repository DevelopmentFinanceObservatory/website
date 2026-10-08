/**
 * scripts/sync-dfo-docs.mjs against a corpus in a temporary git repository:
 * a skill's zip has to reach public/ with the bytes it was committed with.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';

import { syncDocs } from '../../../../scripts/sync-dfo-docs.mjs';

const skill = {
    path: 'skills/oda-crs',
    kind: 'skill',
    corpus_path: 'corpus/dfo-skills/oda-crs/SKILL.md',
    bundle_path: 'corpus/dfo-skills/oda-crs.zip',
};

// Every byte value, so the buffer holds invalid UTF-8, wrapped in whitespace
// that a trim would eat.
const ZIP = Buffer.concat([
    Buffer.from('\n PK\u0003\u0004'),
    Buffer.from(Array.from({ length: 256 }, (_, byte) => byte)),
    Buffer.from(' \n\n'),
]);

/** A scratch directory holding a `corpus` repository with `files` committed,
 *  and the two directories a sync writes to. */
const scratch = (t: TestContext, files: Record<string, string | Buffer>) => {
    const root = mkdtempSync(path.join(tmpdir(), 'dfo-docs-sync-test-'));
    const repo = path.join(root, 'repo');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });

    t.after(() => rmSync(root, { recursive: true, force: true }));

    for (const [file, content] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
        writeFileSync(path.join(repo, file), content);
    }

    git('init', '-q', '-b', 'corpus');
    git('add', '.');
    git(
        ...['-c', 'user.name=test', '-c', 'user.email=test@example.org'],
        ...['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'corpus'],
    );

    return {
        repo: pathToFileURL(repo).href,
        out: path.join(root, 'content'),
        bundles: path.join(root, 'public/docs'),
    };
};

const corpus = (pages: object[]) => ({
    'roadmap.json': JSON.stringify({ tracks: [] }),
    'manifest.json': JSON.stringify({ pages, nav: [] }),
    'corpus/dfo-skills/oda-crs/SKILL.md': '# ODA CRS\n',
    'corpus/dfo-skills/dfo-faq/SKILL.md': '# FAQ\n',
});

test('a bundle is copied byte for byte, and only for a page that records one', (t) => {
    const unshipped = { path: 'skills/dfo-faq', corpus_path: 'corpus/dfo-skills/dfo-faq/SKILL.md' };
    const dirs = scratch(t, { ...corpus([skill, unshipped]), [skill.bundle_path]: ZIP });
    const stale = path.join(dirs.bundles, 'skills/removed.zip');

    mkdirSync(path.dirname(stale), { recursive: true });
    writeFileSync(stale, 'left by an earlier pin');

    syncDocs(dirs);

    assert.deepEqual(readFileSync(path.join(dirs.bundles, 'skills/oda-crs.zip')), ZIP);
    assert.equal(existsSync(path.join(dirs.bundles, 'skills/dfo-faq.zip')), false);
    assert.equal(existsSync(stale), false);
});

test('a manifest naming a bundle the corpus lacks fails the sync', (t) => {
    const dirs = scratch(t, corpus([skill]));

    // Status 128 is git refusing the path. The pin is written last, so its
    // absence shows the run stopped short.
    assert.throws(() => syncDocs(dirs), { status: 128 });
    assert.equal(existsSync(path.join(dirs.out, 'pin.json')), false);
});

test('a page path that leaves the bundles directory fails the sync and writes nothing', (t) => {
    const escaping = { ...skill, path: 'skills/../../escape' };
    const dirs = scratch(t, { ...corpus([escaping]), [skill.bundle_path]: ZIP });

    assert.throws(() => syncDocs(dirs), /skills\/\.\.\/\.\.\/escape/);
    assert.equal(existsSync(path.join(dirs.bundles, '../escape.zip')), false);
    assert.equal(existsSync(path.join(dirs.out, 'pin.json')), false);
});
