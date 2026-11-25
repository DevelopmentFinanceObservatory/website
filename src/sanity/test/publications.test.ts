import assert from 'node:assert/strict';
import test from 'node:test';

import { toPublicationCards } from '../publications.ts';
import type { PUBLICATIONS_QUERY_RESULT } from '../sanity.types.ts';

type Row = PUBLICATIONS_QUERY_RESULT[number];

const row = (overrides: Partial<Row> = {}): Row => ({
    id: 'doc-1',
    title: 'Priced Out',
    byline: 'Data team',
    publishedAt: '2026-04-14',
    abstract: 'Borrowing costs rose.',
    reportUrl: 'https://data.one.org/report',
    coverSrc: 'https://cdn.sanity.io/images/p/d/cover-280x397.svg',
    ...overrides,
});

test('toPublicationCards keeps a complete document and sizes its cover', (t) => {
    t.mock.method(console, 'warn', () => {});
    const [card] = toPublicationCards([row()]);

    assert.equal(card.id, 'doc-1');
    assert.equal(card.reportUrl, 'https://data.one.org/report');
    assert.equal(new URL(card.coverSrc).searchParams.get('w'), '560');
});

test('toPublicationCards leaves out a document the page cannot render', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const rows = [
        row({ title: null }),
        row({ byline: null }),
        row({ coverSrc: null }),
        row({ publishedAt: null }),
        row({ publishedAt: '2026-04-14T00:00:00Z' }),
    ];

    assert.deepEqual(toPublicationCards(rows), []);
    assert.equal(warn.mock.callCount(), rows.length);
});

test('toPublicationCards drops a report URL that is not https', (t) => {
    t.mock.method(console, 'warn', () => {});

    for (const reportUrl of [null, 'http://example.org/r', 'javascript:alert(1)', 'not a url']) {
        assert.equal(
            toPublicationCards([row({ reportUrl })])[0].reportUrl,
            null,
            String(reportUrl),
        );
    }
});
