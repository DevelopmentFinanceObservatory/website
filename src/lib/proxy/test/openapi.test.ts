/**
 * `openapi.ts`: the site's /openapi.json keeps the search, datasets, graph
 * and presentation card and share paths under /api/v1 and /codes/* where it is, drops every other path
 * and the schemas only those used, and drops `servers`, so a client calls
 * the host that served it. Anything but a 200 JSON document passes through
 * untouched.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { OPENAPI_CACHE_CONTROL, publicOpenApi, rewriteOpenApi } from '../openapi.ts';

const op = (schema: string) => ({
    get: {
        operationId: `get_${schema}`,
        parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
        responses: {
            200: {
                description: 'OK',
                content: {
                    'application/json': { schema: { $ref: `#/components/schemas/${schema}` } },
                },
            },
        },
    },
});

const DOCUMENT = {
    openapi: '3.1.0',
    info: { title: 'DFO APIs', version: '1' },
    servers: [{ url: 'https://dfo-apis.example' }],
    paths: {
        '/api/search/resolve': op('Resolution'),
        '/api/datasets': op('Manifest'),
        '/api/datasets/{id}/versions': op('Versions'),
        '/api/graph/node/{dcid}': op('Node'),
        '/api/skills/{skill_id}': op('Skill'),
        '/api/presentation/components': op('Manifest'),
        '/api/presentation/shares/{share_id}/slots/{n}/data': op('Manifest'),
        '/api/presentation/frames/{frame_id}': op('Component'),
        '/api/searchlight': op('Skill'),
        '/codes/{code}': op('CodeRegistryEntry'),
    },
    webhooks: { releasePublished: op('ReleaseEvent') },
    components: {
        schemas: {
            Resolution: { properties: { node: { $ref: '#/components/schemas/Node' } } },
            Manifest: { type: 'object' },
            Versions: { type: 'array', items: { $ref: '#/components/schemas/Manifest' } },
            Node: { type: 'object' },
            CodeRegistryEntry: { type: 'object' },
            Skill: { type: 'object' },
            Component: { properties: { skill: { $ref: '#/components/schemas/Skill' } } },
            ReleaseEvent: { properties: { release: { $ref: '#/components/schemas/Release' } } },
            Release: { type: 'object' },
        },
    },
};

test('publicOpenApi: keeps the surfaces under /api/v1 and /codes, and drops the upstream servers', () => {
    const out = publicOpenApi(structuredClone(DOCUMENT));

    assert.equal(Object.hasOwn(out, 'servers'), false);
    assert.deepEqual(out.paths, {
        '/api/v1/search/resolve': DOCUMENT.paths['/api/search/resolve'],
        '/api/v1/datasets': DOCUMENT.paths['/api/datasets'],
        '/api/v1/datasets/{id}/versions': DOCUMENT.paths['/api/datasets/{id}/versions'],
        '/api/v1/graph/node/{dcid}': DOCUMENT.paths['/api/graph/node/{dcid}'],
        '/api/v1/presentation/components': DOCUMENT.paths['/api/presentation/components'],
        '/api/v1/presentation/shares/{share_id}/slots/{n}/data':
            DOCUMENT.paths['/api/presentation/shares/{share_id}/slots/{n}/data'],
        '/codes/{code}': DOCUMENT.paths['/codes/{code}'],
    });
    assert.deepEqual(out.info, DOCUMENT.info);
});

test('publicOpenApi: keeps the schemas the kept paths and webhooks reach, through other schemas too', () => {
    const out = publicOpenApi(structuredClone(DOCUMENT));

    assert.deepEqual(out.webhooks, DOCUMENT.webhooks);
    assert.deepEqual(Object.keys(out.components?.schemas ?? {}).sort(), [
        'CodeRegistryEntry',
        'Manifest',
        'Node',
        'Release',
        'ReleaseEvent',
        'Resolution',
        'Versions',
    ]);
});

test('publicOpenApi: keeps every schema when a $ref names one the document lacks', () => {
    const document = structuredClone(DOCUMENT);

    document.paths['/api/graph/node/{dcid}'] = op('Missing');

    assert.deepEqual(
        Object.keys(publicOpenApi(document).components?.schemas ?? {}),
        Object.keys(DOCUMENT.components.schemas),
    );
});

const upstreamOf = (body: string, init: ResponseInit) => new Response(body, init);

test('rewriteOpenApi: rewrites a 200 JSON document with a short public cache life', async () => {
    const body = JSON.stringify(DOCUMENT);
    const out = await rewriteOpenApi(
        upstreamOf(body, {
            headers: {
                'content-type': 'application/json',
                'content-length': String(body.length),
                'x-dfo-commit': 'abc',
                'x-dfo-trace-id': 't1',
            },
        }),
    );

    assert.equal(out.status, 200);
    assert.equal(out.headers.get('cache-control'), OPENAPI_CACHE_CONTROL);
    assert.equal(out.headers.get('content-length'), null);
    assert.equal(out.headers.get('x-dfo-trace-id'), 't1');
    assert.equal(out.headers.get('x-dfo-commit'), 'abc');
    assert.deepEqual(await out.json(), publicOpenApi(structuredClone(DOCUMENT)));
});

test('rewriteOpenApi: passes an error, a non-JSON body and a JSON body without paths through', async () => {
    const cases: [string, ResponseInit][] = [
        [
            '{"type":"/codes/upstream_failed"}',
            { status: 503, headers: { 'content-type': 'application/problem+json' } },
        ],
        ['<html>busy</html>', { status: 200, headers: { 'content-type': 'text/html' } }],
        ['{"paths": oops', { status: 200, headers: { 'content-type': 'application/json' } }],
        ['{"detail":"no"}', { status: 200, headers: { 'content-type': 'application/json' } }],
    ];

    for (const [body, init] of cases) {
        const out = await rewriteOpenApi(upstreamOf(body, init));

        assert.equal(out.status, init.status, body);
        assert.equal(out.headers.get('cache-control'), null, body);
        assert.equal(await out.text(), body);
    }
});
