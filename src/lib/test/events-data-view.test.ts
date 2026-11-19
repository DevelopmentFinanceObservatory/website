import assert from 'node:assert/strict';
import test from 'node:test';

import {
    corsHeaders,
    MAX_ID_LENGTH,
    MAX_PAGE,
    MAX_PAGE_INPUT,
    pagePath,
    parseCorsOrigins,
    parseDataView,
} from '../events/dataView.ts';

const VALID = {
    specIds: ['spec_a1', 'spec_b2'],
    contentVersions: ['cv_1', 'cv_2'],
    via: 'pinned_ref',
};

const NO_ORIGIN: { origin: string | null; allowed: readonly string[] } = {
    origin: null,
    allowed: [],
};

const parse = (body: unknown, request = NO_ORIGIN) => parseDataView(JSON.stringify(body), request);

test('a valid body gives the props, with surface set and shareId only on a share', () => {
    assert.deepEqual(parse({ ...VALID, page: '/report' }), {
        ok: true,
        props: { ...VALID, surface: 'page', listed: false },
        page: '/report',
    });
    assert.deepEqual(parse({ ...VALID, via: 'share', shareId: 'aB3dE5fG7h', page: null }), {
        ok: true,
        props: { ...VALID, via: 'share', shareId: 'aB3dE5fG7h', surface: 'page', listed: false },
        page: null,
    });
});

test('host is the Origin hostname, else the page URL host, and listed follows the allow-list', async (t) => {
    const allowed = ['https://partner.example'];
    const cases: [string, string | null, string | undefined, string | undefined, boolean][] = [
        ['a listed origin', 'https://partner.example', '/a', 'partner.example', true],
        [
            'an unlisted origin',
            'https://blog.example',
            'https://other.example/a',
            'blog.example',
            false,
        ],
        ['no origin, a full page URL', null, 'https://Blog.Example/a', 'blog.example', false],
        ['the null origin, a page path', 'null', '/a', undefined, false],
        ['no origin and no page', null, undefined, undefined, false],
    ];

    for (const [label, origin, page, host, listed] of cases) {
        await t.test(label, () => {
            const parsed = parse({ ...VALID, page }, { origin, allowed });

            assert.ok(parsed.ok);
            assert.equal(parsed.props.host, host);
            assert.equal(parsed.props.listed, listed);
        });
    }
});

test('an entry the export would refuse becomes `-`, keeping the lists aligned', () => {
    const parsed = parse({
        ...VALID,
        specIds: ['spec_a1', 'has space'],
        contentVersions: ['ana@example.org', 'cv_2'],
    });

    assert.ok(parsed.ok);
    assert.deepEqual(parsed.props.specIds, ['spec_a1', '-']);
    assert.deepEqual(parsed.props.contentVersions, ['-', 'cv_2']);
});

test('a bad body is refused with a pointer to the field at fault', async (t) => {
    const eleven = Array.from({ length: 11 }, (_, at) => `spec_${at}`);
    const cases: [string, unknown, string][] = [
        ['no spec ids', { ...VALID, specIds: [], contentVersions: [] }, '/specIds'],
        [
            'more spec ids than the list cap',
            { ...VALID, specIds: eleven, contentVersions: eleven },
            '/specIds',
        ],
        ['lists of different lengths', { ...VALID, contentVersions: ['cv_1'] }, '/contentVersions'],
        ['a number for an id', { ...VALID, specIds: [1, 2] }, '/specIds/0'],
        [
            'an id over the length cap',
            { ...VALID, specIds: ['a'.repeat(MAX_ID_LENGTH + 1), 'b'] },
            '/specIds/0',
        ],
        ['an unknown via', { ...VALID, via: 'embedded' }, '/via'],
        ['no via', { specIds: VALID.specIds, contentVersions: VALID.contentVersions }, '/via'],
        ['a share without its id', { ...VALID, via: 'share' }, '/shareId'],
        ['a share id that is not a token', { ...VALID, via: 'share', shareId: 'a b' }, '/shareId'],
        ['a share id without a share', { ...VALID, shareId: 'aB3dE5fG7h' }, ''],
        ['an unknown key', { ...VALID, email: 'ana@example.org' }, ''],
        ['a page that is not a string', { ...VALID, page: 3 }, '/page'],
        ['an array', [VALID], ''],
    ];

    for (const [label, body, pointer] of cases) {
        await t.test(label, () => {
            const parsed = parse(body);

            assert.equal(parsed.ok, false);
            assert.equal(!parsed.ok && parsed.pointer, pointer);
        });
    }

    await t.test('text that is not JSON', () => {
        assert.equal(parseDataView('{', NO_ORIGIN).ok, false);
    });
});

test('the page keeps its path alone, without host, query string or fragment', async (t) => {
    const cases: [string, string | null | undefined, string | null][] = [
        ['a path', '/insights/aid', '/insights/aid'],
        ['a path with a query and fragment', '/report?email=ana@example.org#top', '/report'],
        ['a full URL', 'https://example.org/2026/report?x=1#y', '/2026/report'],
        ['a full URL with a user', 'https://ana:pw@example.org/a', '/a'],
        ['dot segments', '/a/../b', '/b'],
        ['a path over the cap', `/${'a'.repeat(MAX_PAGE + 100)}`, `/${'a'.repeat(MAX_PAGE - 1)}`],
        ['a page over the input cap', `/${'a'.repeat(MAX_PAGE_INPUT)}`, null],
        ['a path holding an email', '/profile/ana@example.org', null],
        ['a path with an escaped space', '/Ana%20Silva', null],
        ['a path with a space, escaped by parsing', '/Ana Silva', null],
        ['a protocol-relative URL', '//example.org/a', null],
        ['another scheme', 'file:///etc/passwd', null],
        ['text', 'Ana Silva', null],
        ['no page', undefined, null],
        ['a null page', null, null],
    ];

    for (const [label, page, path] of cases) {
        await t.test(label, () => {
            assert.equal(pagePath(page), path);
        });
    }

    await t.test('through the body', () => {
        const parsed = parse({ ...VALID, page: 'https://example.org/a?b#c' });

        assert.equal(parsed.ok && parsed.page, '/a');
    });

    await t.test('a page over the input cap is recorded without its page', () => {
        const parsed = parse({ ...VALID, page: `/${'a'.repeat(MAX_PAGE_INPUT)}` });

        assert.ok(parsed.ok);
        assert.equal(parsed.page, null);
    });
});

test('CORS allows a listed origin and no other', async (t) => {
    const allowed = parseCorsOrigins(
        ' https://developmentfinance.org, *, not a url,https://Example.org/x ',
    );

    assert.deepEqual(allowed, ['https://developmentfinance.org', 'https://example.org']);
    assert.deepEqual(parseCorsOrigins(undefined), []);

    await t.test('a listed origin gets the allow set, without credentials', () => {
        const headers = corsHeaders('https://developmentfinance.org', allowed);

        assert.equal(headers['Access-Control-Allow-Origin'], 'https://developmentfinance.org');
        assert.equal(headers['Access-Control-Allow-Credentials'], undefined);
        assert.deepEqual(
            headers['Access-Control-Expose-Headers']?.split(', ').toSorted(),
            [
                'Retry-After',
                'X-RateLimit-Limit',
                'X-RateLimit-Remaining',
                'X-RateLimit-Reset',
                'x-dfo-trace-id',
            ].toSorted(),
        );
        assert.equal(headers.Vary, 'Origin');
    });

    const denied: [string, string | null][] = [
        ['an unlisted origin', 'https://evil.example'],
        ['a listed host on another scheme', 'http://developmentfinance.org'],
        ['a subdomain of a listed host', 'https://www.developmentfinance.org'],
        ['the null origin', 'null'],
        ['no origin', null],
    ];

    for (const [label, origin] of denied) {
        await t.test(label, () => {
            assert.deepEqual(corsHeaders(origin, allowed), { Vary: 'Origin' });
        });
    }
});
