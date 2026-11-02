/**
 * Tools repeat generic page names ("Changelog", "Getting started"), so a
 * page's title names its group.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { DocsNavNode, DocsPage } from '../corpus.ts';
import { docsTitler } from '../title.ts';

const page = (id: string, title: string): DocsPage => ({ id, path: id, title, kind: 'page' });

const nav: DocsNavNode[] = [
    { id: 'hub', title: 'Home', kind: 'page' },
    {
        id: 'group:tools',
        title: 'Tools',
        kind: 'group',
        children: [
            {
                id: 'group:tools/imf',
                title: 'IMF reader',
                kind: 'group',
                page_id: 'imf',
                children: [
                    { id: 'imf/changelog', title: 'Changelog', kind: 'page' },
                    { id: 'imf/weo', title: 'World Economic Outlook', kind: 'page' },
                    { id: 'imf/start', title: 'Getting started', kind: 'page' },
                ],
            },
            {
                id: 'group:tools/dcp',
                title: 'DCP tools',
                kind: 'group',
                page_id: 'dcp',
                children: [
                    { id: 'dcp/changelog', title: 'Changelog', kind: 'page' },
                    { id: 'dcp/start', title: 'Getting Started', kind: 'page' },
                ],
            },
        ],
    },
];

const pages = [
    page('hub', 'Home'),
    page('imf', 'IMF reader'),
    page('imf/changelog', 'Changelog'),
    page('imf/weo', 'World Economic Outlook'),
    page('dcp', 'DCP tools'),
    page('dcp/changelog', 'Changelog'),
    page('imf/start', 'Getting started'),
    page('dcp/start', 'Getting Started'),
];
const title = docsTitler(pages, nav);

test('a page whose title repeats names its group', () => {
    assert.equal(title(page('imf/changelog', 'Changelog')), 'Changelog — IMF reader — DFO Docs');
    assert.equal(title(page('dcp/changelog', 'Changelog')), 'Changelog — DCP tools — DFO Docs');
});

test('titles that differ only in case count as repeated', () => {
    assert.equal(
        title(page('imf/start', 'Getting started')),
        'Getting started — IMF reader — DFO Docs',
    );
    assert.equal(
        title(page('dcp/start', 'Getting Started')),
        'Getting Started — DCP tools — DFO Docs',
    );
});

test('a unique title, a group index page and a top-level page keep their own title', () => {
    assert.equal(
        title(page('imf/weo', 'World Economic Outlook')),
        'World Economic Outlook — DFO Docs',
    );
    assert.equal(title(page('imf', 'IMF reader')), 'IMF reader — DFO Docs');
    assert.equal(title(page('hub', 'Home')), 'Home — DFO Docs');
});

test('the pinned manifest gives every tool changelog its own title', () => {
    const manifest = JSON.parse(
        readFileSync(new URL('../../../content/dfo-docs/manifest.json', import.meta.url), 'utf8'),
    ) as { pages: DocsPage[]; nav: DocsNavNode[] };
    const manifestTitle = docsTitler(manifest.pages, manifest.nav);
    const titles = manifest.pages.filter((p) => p.title === 'Changelog').map(manifestTitle);

    assert.ok(titles.length > 1);
    assert.equal(new Set(titles).size, titles.length);
});
