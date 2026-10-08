/**
 * A skill page links to its zip relative to its own corpus file. The site
 * serves the zip beside the page, so the link resolves through the
 * `bundle_path` the manifest records, and only through that.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { DocsPage } from '../corpus.ts';
import { bundleLinks } from '../links.ts';

const skill: DocsPage = {
    id: 'skills/oda-crs',
    title: 'ODA CRS',
    path: 'skills/oda-crs',
    kind: 'skill',
    corpus_path: 'corpus/dfo-skills/oda-crs/SKILL.md',
    bundle_path: 'corpus/dfo-skills/oda-crs.zip',
};

const guide: DocsPage = {
    id: 'guides/install',
    title: 'Install',
    path: 'guides/install',
    kind: 'page',
    corpus_path: 'corpus/guides/install.md',
};

test('a relative link to a recorded bundle resolves to the zip beside the page', () => {
    const resolve = bundleLinks([guide, skill]);

    assert.equal(resolve(skill, '../oda-crs.zip'), '/docs/skills/oda-crs.zip');
    assert.equal(resolve(guide, '../dfo-skills/oda-crs.zip'), '/docs/skills/oda-crs.zip');
});

test('a link no page records as its bundle is left to the caller', () => {
    const resolve = bundleLinks([guide, skill]);

    for (const href of [
        '../other.zip',
        'oda-crs.zip',
        'https://example.org/oda-crs.zip',
        '/corpus/dfo-skills/oda-crs.zip',
        '../oda-crs.zip#top',
    ]) {
        assert.equal(resolve(skill, href), undefined, href);
    }
});

test('pages that record no bundle resolve nothing', () => {
    const unbundled: DocsPage = { ...skill, bundle_path: undefined };
    const resolve = bundleLinks([guide, unbundled]);

    for (const href of [
        '../oda-crs.zip',
        'references/codes.md',
        '../../guides/install.md#claude',
    ]) {
        assert.equal(resolve(unbundled, href), undefined, href);
    }
});
