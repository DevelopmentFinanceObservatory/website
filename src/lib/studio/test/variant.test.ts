/**
 * `variant.ts`: the variant a value names, and the redirect that takes the
 * `studio` parameter off a Studio page and into the session cookie.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { variantOf, variantRedirect } from '../variant.ts';

test('only `prompt` names the prompt variant', () => {
    assert.deepEqual(
        [undefined, '', 'classic', 'PROMPT', 'prompt ', 'other', 'prompt'].map(variantOf),
        ['classic', 'classic', 'classic', 'classic', 'classic', 'classic', 'prompt'],
    );
});

const cookie = (value: 'prompt' | 'classic', secure = true) => ({
    name: 'studio_variant',
    value,
    path: '/studio',
    sameSite: 'lax',
    secure,
});

test('a Studio page sheds the parameter, keeps the others in order, and sets the cookie', () => {
    for (const [path, search, location, set] of [
        ['/studio', '?studio=prompt&q=x', '/studio?q=x', cookie('prompt')],
        ['/studio', '?studio=classic', '/studio', cookie('classic')],
        [
            '/studio/abc',
            '?seed=s1&studio=prompt&via=example',
            '/studio/abc?seed=s1&via=example',
            cookie('prompt'),
        ],
        // The last value wins, and every copy goes.
        ['/studio', '?studio=classic&q=y&studio=prompt', '/studio?q=y', cookie('prompt')],
        // Any other value goes too and leaves the cookie as it is.
        ['/studio', '?studio=bogus&q=y', '/studio?q=y', null],
        ['/studio', '?studio=', '/studio', null],
    ] as const) {
        assert.deepEqual(
            variantRedirect(path, search, { secure: true }),
            { location, cookie: set },
            `${path}${search}`,
        );
    }
});

test('the cookie is Secure only when asked', () => {
    assert.deepEqual(
        variantRedirect('/studio', '?studio=prompt', { secure: false })?.cookie,
        cookie('prompt', false),
    );
});

test('no redirect without the parameter or off the Studio pages', () => {
    for (const [path, search] of [
        ['/studio', ''],
        ['/studio', '?q=x'],
        ['/studio/abc', '?seed=s1'],
        ['/s/abc', '?studio=prompt'],
        ['/insights/gallery/x', '?studio=prompt'],
        ['/studio/abc/more', '?studio=prompt'],
        ['/studios', '?studio=prompt'],
        ['/', '?studio=prompt'],
    ] as const) {
        assert.equal(variantRedirect(path, search, { secure: true }), null, `${path}${search}`);
    }
});
