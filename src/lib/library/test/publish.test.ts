import assert from 'node:assert/strict';
import test from 'node:test';

import type { PanelView } from '../../studio/descriptionBlocks.ts';
import { freeSlug, publishedFacts, readEdit, readPublish, slugOf } from '../publish.ts';

const body = (patch: Record<string, unknown> = {}) => ({
    shareId: 'Ab3dEf7h',
    kind: 'chart',
    mode: 'live',
    title: '  Health ODA   to Ethiopia ',
    description: 'Annual disbursements.',
    topics: ['Health', 'Health', ' ODA '],
    sources: [{ name: 'OECD CRS', url: 'https://example.org/crs' }],
    steps: [{ title: 'Get ODA', detail: null }],
    ...patch,
});

test('a publish body is narrowed to the artifact it makes', () => {
    const read = readPublish(body({ contentTitle: 'Findings', content: ' One.\n\nTwo. ' }));

    assert.ok(read.ok);
    assert.equal(read.value.title, 'Health ODA to Ethiopia');
    assert.deepEqual(read.value.topics, ['Health', 'ODA']);
    assert.equal(read.value.content, 'One.\n\nTwo.');
    assert.equal(read.value.contentTitle, 'Findings');
});

test('a content title with no content is dropped', () => {
    const read = readPublish(body({ contentTitle: 'Findings', content: '  ' }));

    assert.ok(read.ok);
    assert.equal(read.value.contentTitle, null);
    assert.equal(read.value.content, null);
});

test('a publish body is refused at the first field at fault', () => {
    const cases: [Record<string, unknown>, string][] = [
        [{ title: '   ' }, '/title'],
        [{ title: 'x'.repeat(141) }, '/title'],
        [{ description: 7 }, '/description'],
        [{ content: 'x'.repeat(8001) }, '/content'],
        [{ topics: 'Health' }, '/topics'],
        [{ topics: [''] }, '/topics'],
        [{ shareId: '../../etc' }, '/shareId'],
        [{ kind: 'data' }, '/kind'],
        [{ mode: 'frozen' }, '/mode'],
        [{ sources: [{ name: 'A', url: 'javascript:alert(1)' }] }, '/sources'],
        [{ sources: [{ name: 'A', url: 'http://example.org' }] }, '/sources'],
        [{ sources: [{ name: 'A', url: '/data/sources//evil.example' }] }, '/sources'],
        [{ steps: [{ detail: 'no title' }] }, '/steps'],
    ];

    for (const [patch, pointer] of cases) {
        const read = readPublish(body(patch));

        assert.equal(read.ok, false, JSON.stringify(patch));
        assert.equal(!read.ok && read.pointer, pointer, JSON.stringify(patch));
    }

    assert.equal(readPublish(null).ok, false);
    assert.equal(readPublish([]).ok, false);
});

test('a source may name its page on this site', () => {
    const read = readPublish(body({ sources: [{ name: 'A', url: '/data/sources/oecd/crs' }] }));

    assert.ok(read.ok);
    assert.equal(read.value.sources[0].url, '/data/sources/oecd/crs');
});

test('an edit reads the text alone', () => {
    const read = readEdit(body({ shareId: 'nope', kind: 'data' }));

    assert.ok(read.ok);
    assert.deepEqual(Object.keys(read.value).sort(), [
        'content',
        'contentTitle',
        'description',
        'title',
        'topics',
    ]);
});

test('a slug is the title in ASCII words, and a taken one gets a number', () => {
    assert.equal(slugOf('Health ODA to Éthiopie, 2016–2024!'), 'health-oda-to-ethiopie-2016-2024');
    assert.equal(slugOf('———'), 'artifact');
    assert.equal(slugOf('x'.repeat(200)).length, 80);
    assert.equal(freeSlug('a', new Set()), 'a');
    assert.equal(freeSlug('a', new Set(['a', 'a-2', 'ab'])), 'a-3');
});

const view = (sources: { name: string; url: string | null; page: string | null }[], steps = 0) =>
    ({
        kind: 'described',
        sources: sources.map((source) => ({
            key: source.name,
            meta: null,
            lookup: null,
            ...source,
        })),
        made: {
            steps: Array.from({ length: steps }, (_, index) => ({
                key: String(index),
                verb: index === 0 ? 'Get' : null,
                object: `thing ${index}`,
                detail: null,
                givesCard: false,
            })),
            notes: [],
            pages: [],
        },
    }) as unknown as PanelView;

test('a card gives its sources and steps, and a canvas each source once and no steps', () => {
    const one = view([{ name: 'A', url: null, page: 'oecd/crs' }], 2);
    const two = view([
        { name: 'A', url: 'https://a.example', page: null },
        { name: 'B', url: 'https://b.example', page: null },
    ]);

    assert.deepEqual(publishedFacts([one]), {
        sources: [{ name: 'A', url: '/data/sources/oecd/crs' }],
        steps: [
            { title: 'Get thing 0', detail: null },
            { title: 'thing 1', detail: null },
        ],
    });
    assert.deepEqual(publishedFacts([one, two]), {
        sources: [
            { name: 'A', url: '/data/sources/oecd/crs' },
            { name: 'B', url: 'https://b.example' },
        ],
        steps: [],
    });
});

test('what a card gives is what a publish takes', () => {
    const facts = publishedFacts([
        view(
            [
                { name: 'Plain', url: 'http://plain.example', page: null },
                { name: 'n'.repeat(400), url: 'https://long.example', page: null },
            ],
            1,
        ),
    ]);

    assert.equal(facts.sources[0].url, null);
    assert.equal(readPublish(body(facts)).ok, true);
});
