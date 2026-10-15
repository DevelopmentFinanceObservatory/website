// Generates src/lib/graph/schema.d.ts from the committed Graph API schema
// snapshot, src/lib/graph/graph-api-schema.json, which is the body of
// dfo-apis' `GET /api/graph/schema`. src/lib/graph/test/wire.test.ts fails
// when the committed types differ from what the snapshot generates.
//
//   node scripts/graph-wire.mts types         rewrite schema.d.ts from the snapshot
//   node scripts/graph-wire.mts schema <url>  refresh the snapshot from a deployed
//                                             dfo-apis, then rewrite schema.d.ts
//
// The dev apis admits only invokers, so <url> for dev is a local
// `gcloud run services proxy dfo-dev-apis --region northamerica-northeast1
// --project dev-fin-observatory --port 8083`, http://localhost:8083
// (docs/development.md, "Reach the dev APIs").
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import openapiTS, { astToString } from 'openapi-typescript';
import { format, resolveConfig } from 'prettier';

const GRAPH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/graph');

export const SNAPSHOT = path.join(GRAPH_DIR, 'graph-api-schema.json');
export const TYPES = path.join(GRAPH_DIR, 'schema.d.ts');

const HEADER = `// Generated from src/lib/graph/graph-api-schema.json by \`pnpm graph:types\`.
// Do not edit by hand.

`;

type JsonSchema = { $defs?: Record<string, unknown>; [member: string]: unknown };

/** Each served schema, under its served name, and the definitions the served
 *  schemas name, as one set of named schemas. A definition two schemas share
 *  must be the same in both, since the types hold one declaration for it. */
function components(served: Record<string, JsonSchema>): Record<string, unknown> {
    const named: Record<string, unknown> = {};

    for (const [key, { $defs = {}, ...schema }] of Object.entries(served)) {
        for (const [name, definition] of Object.entries($defs)) {
            if (name in named && JSON.stringify(named[name]) !== JSON.stringify(definition)) {
                throw new Error(`${key} defines ${name} differently from another schema`);
            }

            named[name] = definition;
        }

        named[key] = schema;
    }

    return named;
}

const prettierFormat = async (text: string, filepath: string) =>
    format(text, { ...(await resolveConfig(filepath)), filepath });

/** The declarations the snapshot generates. The served schemas go in as an
 *  OpenAPI 3.1 document's components, so each becomes
 *  `components['schemas'][name]`, and their `$defs` references point at the
 *  components instead. */
export async function renderGraphWire(snapshot: string): Promise<string> {
    const { schemas } = JSON.parse(snapshot) as { schemas: Record<string, JsonSchema> };
    const document = JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'dfo-apis Graph API', version: 'snapshot' },
        paths: {},
        components: { schemas: components(schemas) },
    }).replaceAll('"#/$defs/', '"#/components/schemas/');
    const ast = await openapiTS(document, { silent: true });

    return prettierFormat(HEADER + astToString(ast), TYPES);
}

// Object keys sorted at every depth, so a refresh diffs by content alone.
const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
        Object.entries(value)
            .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, member]) => [key, sortKeys(member)]),
    );
};

async function writeTypes(): Promise<void> {
    await writeFile(TYPES, await renderGraphWire(await readFile(SNAPSHOT, 'utf8')));
    console.log(`wrote ${path.relative(process.cwd(), TYPES)}`);
}

async function refreshSnapshot(base: string): Promise<void> {
    const url = new URL('/api/graph/schema', base);
    const res = await fetch(url);

    if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);

    // One member per line, so a refresh diffs line by line.
    const text = JSON.stringify(sortKeys(await res.json()), null, 4);

    await writeFile(SNAPSHOT, await prettierFormat(text, SNAPSHOT));
    console.log(`wrote ${path.relative(process.cwd(), SNAPSHOT)} from ${url}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [command, base] = process.argv.slice(2);

    if (command === 'types') {
        await writeTypes();
    } else if (command === 'schema' && base) {
        await refreshSnapshot(base);
        await writeTypes();
    } else {
        console.error('usage: node scripts/graph-wire.mts types | schema <dfo-apis base URL>');
        process.exit(2);
    }
}
