import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// The prototypes Worker owns developmentfinance.org/prototypes*, and its route
// runs before the website's origin. A website route, public file, redirect or
// rewrite at that path would be unreachable, so each one fails here.

const root = path.resolve(import.meta.dirname, '../../..');
const isGroup = (name: string) => /^\(.+\)$/.test(name);

/** Directories named `prototypes` that become the /prototypes URL segment: the
 * top of `appDir`, or reached through route groups only, which add no segment. */
function prototypesRoutes(appDir: string): string[] {
    if (!existsSync(appDir)) return [];
    const found: string[] = [];
    for (const entry of readdirSync(appDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'prototypes') found.push(path.join(appDir, entry.name));
        else if (isGroup(entry.name))
            found.push(...prototypesRoutes(path.join(appDir, entry.name)));
    }
    return found;
}

/** Redirect, rewrite and header sources in a Next config that start at /prototypes. */
function prototypesSources(configText: string): string[] {
    return [...configText.matchAll(/\bsource:\s*['"`](\/prototypes[^'"`]*)['"`]/g)].map(
        (match) => match[1],
    );
}

test('src/app has no route segment named prototypes outside route groups', () => {
    assert.deepEqual(prototypesRoutes(path.join(root, 'src/app')), []);
});

test('public/ has no prototypes entry', () => {
    assert.equal(existsSync(path.join(root, 'public/prototypes')), false);
});

test('next.config.ts has no /prototypes redirect, rewrite or header source', () => {
    assert.deepEqual(
        prototypesSources(readFileSync(path.join(root, 'next.config.ts'), 'utf8')),
        [],
    );
});

test('the checks flag a prototypes route and a /prototypes source', () => {
    const fake = path.join(root, '.prototypes-path-test');
    assert.deepEqual(prototypesRoutes(fake), []);
    assert.deepEqual(
        prototypesSources(
            `{ source: '/prototypes', destination: '/x' }, { source: "/prototypes/:p*" }`,
        ),
        ['/prototypes', '/prototypes/:p*'],
    );
    assert.deepEqual(
        prototypesSources(`{ source: '/privacy' }, { source: '/docs/prototypes' }`),
        [],
    );
});
