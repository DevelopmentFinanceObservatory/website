/**
 * `signIn.ts`: which requests carry their path to the layout, and the
 * sign-in address that brings a signed-out visitor back.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { safeNext } from '../../auth/nextPath.ts';
import { graphExplorerSignIn, isGraphExplorerPath } from '../signIn.ts';

test('the Graph Explorer and every path under it carry the requested path', () => {
    for (const path of ['/graph-explorer', '/graph-explorer/', '/graph-explorer/check-sheet']) {
        assert.equal(isGraphExplorerPath(path), true, path);
    }
});

test('other paths, prefixes that are only substrings included, do not', () => {
    for (const path of ['/graph-explorer-old', '/data', '/', '/studio', '/x/graph-explorer']) {
        assert.equal(isGraphExplorerPath(path), false, path);
    }
});

test('sign-in returns to a requested Graph Explorer path, else to the Graph Explorer', () => {
    assert.equal(
        graphExplorerSignIn('/graph-explorer/check-sheet?id=1'),
        `/login?next=${encodeURIComponent('/graph-explorer/check-sheet?id=1')}`,
    );
    assert.equal(
        graphExplorerSignIn('/graph-explorer?x=1'),
        '/login?next=%2Fgraph-explorer%3Fx%3D1',
    );

    for (const requested of [
        null,
        undefined,
        '',
        '/studio',
        '/graph-explorer-old',
        '//evil.example',
        '/graph-explorer/..//evil.example',
        '/graph-explorer/%2e%2e//evil.example',
        '/graph-explorer/../studio',
    ]) {
        assert.equal(
            graphExplorerSignIn(requested),
            '/login?next=%2Fgraph-explorer',
            String(requested),
        );
    }
});

test('/login keeps a Graph Explorer `next` as it is', () => {
    for (const path of ['/graph-explorer', '/graph-explorer/check-sheet?id=1&x=a%20b']) {
        const next = new URL(graphExplorerSignIn(path), 'https://dfo.invalid').searchParams.get(
            'next',
        );
        assert.equal(safeNext(next ?? undefined), path);
    }
});
