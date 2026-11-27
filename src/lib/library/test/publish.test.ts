import assert from 'node:assert/strict';
import test from 'node:test';

import type { PanelView } from '../../studio/descriptionBlocks.ts';
import {
    freeSlug,
    publishedFacts,
    publishedKind,
    readArtifactText,
    readPublish,
    slugDraft,
    slugOf,
} from '../publish.ts';

const KEY = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

const body = (patch: Record<string, unknown> = {}) => ({
    publishKey: KEY,
    share: { kind: 'card', cardId: 'w1', mode: 'live', conversation: { id: 'c', widgets: [] } },
    title: '  Health ODA   to Ethiopia ',
    description: 'Annual disbursements.',
    topics: ['Health', 'Health', ' ODA '],
    ...patch,
});

test('a publish body is narrowed to its text, its key and its share', () => {
    const read = readPublish(
        body({
            description: '  First line.\n\nSecond   line. ',
            contentTitle: 'Findings',
            content: ' One.\n\nTwo. ',
        }),
    );

    assert.ok(read.ok);
    assert.equal(read.value.text.title, 'Health ODA to Ethiopia');
    assert.equal(read.value.text.description, 'First line.\n\nSecond   line.');
    assert.deepEqual(read.value.text.topics, ['Health', 'ODA']);
    assert.equal(read.value.text.content, 'One.\n\nTwo.');
    assert.equal(read.value.text.contentTitle, 'Findings');
    assert.equal(read.value.publishKey, KEY);
    assert.equal(read.value.share.kind, 'card');
    assert.equal(read.value.share.cardId, 'w1');
    assert.equal(read.value.slug, null);
});

test('a content title with no content is dropped', () => {
    const read = readPublish(body({ contentTitle: 'Findings', content: '  ' }));

    assert.ok(read.ok);
    assert.equal(read.value.text.contentTitle, null);
    assert.equal(read.value.text.content, null);
});

test('a publish body is refused at the first field at fault', () => {
    const cases: [Record<string, unknown>, string][] = [
        [{ title: '   ' }, '/title'],
        [{ title: 'x'.repeat(141) }, '/title'],
        [{ description: 7 }, '/description'],
        [{ description: ' \n ' }, '/description'],
        [{ description: 'x'.repeat(601) }, '/description'],
        [{ content: 'x'.repeat(8001) }, '/content'],
        [{ topics: 'Health' }, '/topics'],
        [{ topics: [''] }, '/topics'],
        [{ topics: ['Aid | Debt'] }, '/topics'],
        [{ publishKey: undefined }, '/publishKey'],
        [{ publishKey: 'not-a-key' }, '/publishKey'],
        [{ slug: '' }, '/slug'],
        [{ slug: null }, '/slug'],
        [{ slug: 7 }, '/slug'],
        [{ slug: 'Health-ODA' }, '/slug'],
        [{ slug: 'health--oda' }, '/slug'],
        [{ slug: 'health-' }, '/slug'],
        [{ slug: 'x'.repeat(81) }, '/slug'],
        [{ share: undefined }, '/share/kind'],
        [
            { share: { kind: 'conversation', conversation: { id: 'c', widgets: [] } } },
            '/share/kind',
        ],
    ];

    for (const [patch, pointer] of cases) {
        const read = readPublish(body(patch));

        assert.equal(read.ok, false, JSON.stringify(patch));
        assert.equal(!read.ok && read.pointer, pointer, JSON.stringify(patch));
    }

    assert.equal(readPublish(null).ok, false);
    assert.equal(readPublish([]).ok, false);
});

test('the text alone is what an edit reads', () => {
    const read = readArtifactText(body());

    assert.ok(read.ok);
    assert.deepEqual(Object.keys(read.value).sort(), [
        'content',
        'contentTitle',
        'description',
        'title',
        'topics',
    ]);
});

test("a card artifact takes its card's kind, and a text card none", () => {
    assert.equal(publishedKind('canvas', [{ kind: 'text' }, { kind: 'chart' }]), 'canvas');
    assert.equal(publishedKind('card', [{ kind: 'chart' }]), 'chart');
    assert.equal(publishedKind('card', [{ kind: 'table' }]), 'table');
    assert.equal(publishedKind('card', [{ kind: 'key_number' }]), 'key_number');
    assert.equal(publishedKind('card', [{ kind: 'text' }]), null);
    assert.equal(publishedKind('card', []), null);
});

test('a slug is the title in ASCII words, and a taken one gets a number', () => {
    assert.equal(slugOf('Health ODA to Éthiopie, 2016–2024!'), 'health-oda-to-ethiopie-2016-2024');
    assert.equal(slugOf('———'), 'artifact');
    assert.equal(slugOf('x'.repeat(200)).length, 80);
    assert.equal(freeSlug('a', new Set()), 'a');
    assert.equal(freeSlug('a', new Set(['a', 'a-2', 'ab'])), 'a-3');
});

test('a chosen slug is sent as it is, and typing keeps to the slug rules', () => {
    const read = readPublish(body({ slug: 'x'.repeat(80) }));

    assert.ok(read.ok);
    assert.equal(read.value.slug, 'x'.repeat(80));
    assert.equal(slugDraft('-Aid to Éthiopie, '), 'aid-to-ethiopie-');
    assert.equal(slugDraft('  '), '');
    assert.equal(slugDraft('x'.repeat(90)).length, 80);
    assert.equal(slugOf(slugDraft('-Aid to Éthiopie, ')), 'aid-to-ethiopie');
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

    assert.deepEqual(publishedFacts('chart', [one]), {
        sources: [{ name: 'A', url: '/data/sources/oecd/crs' }],
        steps: [
            { title: 'Get thing 0', detail: null },
            { title: 'thing 1', detail: null },
        ],
    });
    assert.deepEqual(publishedFacts('canvas', [one]).steps, []);
    assert.deepEqual(publishedFacts('canvas', [one, two]), {
        sources: [
            { name: 'A', url: '/data/sources/oecd/crs' },
            { name: 'B', url: 'https://b.example' },
        ],
        steps: [],
    });
});

test("a card's facts are cut to the Library's limits", () => {
    const facts = publishedFacts('chart', [
        view(
            [
                { name: 'Plain | bar', url: 'http://plain.example', page: null },
                { name: 'n'.repeat(400), url: 'https://long.example', page: null },
                { name: 'Script', url: 'javascript:alert(1)', page: null },
                { name: 'Off site', url: null, page: '/evil.example' },
            ],
            1,
        ),
    ]);

    assert.deepEqual(facts.sources[0], { name: 'Plain / bar', url: null });
    assert.equal(facts.sources[1].name.length, 300);
    assert.deepEqual(facts.sources.slice(2), [
        { name: 'Script', url: null },
        { name: 'Off site', url: null },
    ]);
});
