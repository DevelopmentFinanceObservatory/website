import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import ts from 'typescript';

import * as queries from '../queries.ts';

// The query strings that key the SanityQueries interface in the generated
// file. sanityClient.fetch types its result only when the query text matches
// a key exactly, and types it as `any` otherwise.
const generatedQueryKeys = (): string[] => {
    const path = new URL('../sanity.types.ts', import.meta.url);
    const source = ts.createSourceFile(
        path.pathname,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
    );
    const keys: string[] = [];

    const visit = (node: ts.Node) => {
        if (ts.isInterfaceDeclaration(node) && node.name.text === 'SanityQueries') {
            for (const member of node.members) {
                if (
                    ts.isPropertySignature(member) &&
                    member.name &&
                    ts.isStringLiteral(member.name)
                ) {
                    keys.push(member.name.text);
                }
            }
        }

        ts.forEachChild(node, visit);
    };

    visit(source);

    return keys;
};

test('sanity.types.ts holds a result type for each query in queries.ts and no others', () => {
    const exported = Object.values(queries).filter((value) => typeof value === 'string');

    assert.ok(exported.length > 0);
    assert.deepEqual(
        generatedQueryKeys().sort(),
        exported.sort(),
        'run `pnpm typegen` in cms-dfo/ after changing a query',
    );
});
