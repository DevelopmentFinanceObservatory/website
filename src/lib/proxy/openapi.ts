import { SEARCH_API_SURFACES } from './surfaces.ts';

/**
 * The site's /openapi.json (src/app/openapi.json): dfo-apis's own document,
 * cut to what a client can call on this host. Kept apart from the route so
 * `node --test` can load it.
 *
 * A path under one of SEARCH_API_SURFACES moves from /api/<surface>/* to the
 * site's public /api/v1/<surface>/*, and /codes/* (src/app/codes) keeps its
 * address. Every other path is dropped: the skills API and the rest of the
 * presentation API, which the site does not proxy. The component schemas
 * only those paths used go with them.
 * The document carries no `servers`, so a client generated from it calls the
 * host that served it, whichever environment that is.
 */

// dfo-apis deploys on its own schedule, so a cached copy goes stale in
// minutes. Private, since forward() adds the caller's own X-RateLimit-*
// headers to a counted call.
export const OPENAPI_CACHE_CONTROL = 'private, max-age=300';

// Paths the site serves at the same address as dfo-apis.
const ROOT_PATHS = ['/codes/'];

const SCHEMA_REF = '#/components/schemas/';
const JSON_TYPE = /^application\/json\s*(?:;|$)/i;

type JsonObject = Record<string, unknown>;

type OpenApiDocument = JsonObject & {
    paths: JsonObject;
    components?: JsonObject & { schemas?: JsonObject };
};

const isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isDocument = (value: unknown): value is OpenApiDocument =>
    isObject(value) &&
    isObject(value.paths) &&
    (value.components === undefined || isObject(value.components));

/** The site's address for a dfo-apis path, or undefined when the site does not serve it. */
export const publicPath = (path: string): string | undefined => {
    if (ROOT_PATHS.some((prefix) => path.startsWith(prefix))) {
        return path;
    }

    const surface = SEARCH_API_SURFACES.find(
        (name) => path === `/api/${name}` || path.startsWith(`/api/${name}/`),
    );

    return surface ? `/api/v1${path.slice('/api'.length)}` : undefined;
};

// A $ref's schema name: a URI fragment holding a JSON pointer (RFC 6901). A
// fragment that does not decode stays as it is, and so names no schema.
const schemaName = (ref: string): string => {
    const pointer = ref.slice(SCHEMA_REF.length);

    try {
        return decodeURIComponent(pointer).replaceAll('~1', '/').replaceAll('~0', '~');
    } catch {
        return pointer;
    }
};

// Add to `found` every schema `node` refers to, directly or through the
// schemas it reaches.
const collectSchemas = (node: unknown, schemas: JsonObject, found: Set<string>): void => {
    if (Array.isArray(node)) {
        for (const item of node) {
            collectSchemas(item, schemas, found);
        }
    } else if (isObject(node)) {
        for (const [key, value] of Object.entries(node)) {
            if (key === '$ref' && typeof value === 'string' && value.startsWith(SCHEMA_REF)) {
                const name = schemaName(value);

                if (!found.has(name)) {
                    found.add(name);
                    collectSchemas(schemas[name], schemas, found);
                }
            } else {
                collectSchemas(value, schemas, found);
            }
        }
    }
};

// The schemas `root` reaches. A $ref that names no schema means the walk
// misread the document, so all are kept.
const keptSchemas = (schemas: JsonObject, root: unknown): JsonObject => {
    const found = new Set<string>();

    collectSchemas(root, schemas, found);

    if ([...found].some((name) => !Object.hasOwn(schemas, name))) {
        return schemas;
    }

    return Object.fromEntries(Object.entries(schemas).filter(([name]) => found.has(name)));
};

/** dfo-apis's OpenAPI document as the site publishes it. */
export const publicOpenApi = (document: OpenApiDocument): OpenApiDocument => {
    const paths = Object.fromEntries(
        Object.entries(document.paths).flatMap(([path, item]) => {
            const kept = publicPath(path);

            return kept ? [[kept, item]] : [];
        }),
    );
    const out: OpenApiDocument = { ...document, paths };

    // An upstream `servers` names dfo-apis's host, and a relative "/" leads
    // some generators to `//api/v1/...`.
    delete out.servers;

    if (document.components?.schemas) {
        const { schemas, ...others } = document.components;

        out.components = {
            ...document.components,
            // Every member the document keeps counts as a root (the paths,
            // webhooks, the other components), whatever dfo-apis adds later.
            schemas: keptSchemas(schemas, { ...out, components: others }),
        };
    }

    return out;
};

/**
 * The response forward() relays for /openapi.json: a 200 JSON document
 * rewritten by publicOpenApi with OPENAPI_CACHE_CONTROL, and anything else
 * (an error, a body that is not an OpenAPI document) as the upstream sent it.
 */
export const rewriteOpenApi = async (upstream: Response): Promise<Response> => {
    if (upstream.status !== 200 || !JSON_TYPE.test(upstream.headers.get('content-type') ?? '')) {
        return upstream;
    }

    const body = await upstream.arrayBuffer();
    let document: unknown;

    try {
        document = JSON.parse(new TextDecoder().decode(body));
    } catch {
        document = undefined;
    }

    if (!isDocument(document)) {
        return new Response(body, { status: upstream.status, headers: upstream.headers });
    }

    const headers = new Headers(upstream.headers);

    headers.delete('content-length');
    headers.delete('content-encoding');

    headers.set('cache-control', OPENAPI_CACHE_CONTROL);

    return Response.json(publicOpenApi(document), { status: 200, headers });
};
