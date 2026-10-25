/**
 * The codes the website proxy raises itself, as `GET /codes/{code}` answers
 * them. A problem document's `type` for such a code is `/codes/<code>`, and
 * the API's registry does not hold it, so src/app/codes/[code]/route.ts
 * answers here before it forwards. The body has the shape of the API's
 * `CodeRegistryEntry` (the served OpenAPI document's `/codes/{code}`).
 *
 * `proxy-codes.json` is the client contract's file of the same name,
 * vendored from the spec-kit repository's
 * `python/client-contract/src/dfo_client_contract/proxy-codes.json` at
 * 0d19172, formatted by Prettier. The vendored `@developmentfinance/client`
 * carries its statuses and not its descriptions, so the file is copied here.
 * Kept apart from the route so `node --test` can load it.
 */
import { TITLES } from './problem.ts';
import contract from './proxy-codes.json' with { type: 'json' };

type CodeRegistryEntry = {
    code: string;
    classification: 'refusal';
    definition: string;
    lifecycle: 'active';
    mappings: [];
    title: string;
    detail: null;
};

const isProblemStatus = (status: number): status is keyof typeof TITLES => status in TITLES;

const entry = ({ code, status, condition }: (typeof contract.codes)[number]): CodeRegistryEntry => {
    if (!isProblemStatus(status)) {
        throw new Error(`proxy-codes.json gives ${code} the status ${status}, which has no title`);
    }

    return {
        code,
        classification: 'refusal',
        definition: condition,
        lifecycle: 'active',
        mappings: [],
        title: TITLES[status],
        detail: null,
    };
};

const ENTRIES: ReadonlyMap<string, CodeRegistryEntry> = new Map(
    contract.codes.map((proxyCode) => [proxyCode.code, entry(proxyCode)]),
);

/** The registry entry for a code the proxy raises, or undefined for any other code. */
export const proxyCodeEntry = (code: string): CodeRegistryEntry | undefined => ENTRIES.get(code);
