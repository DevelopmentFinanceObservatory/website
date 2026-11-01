import { createHash, randomBytes } from 'node:crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { apisFetch, type Fetch } from '../src/lib/apisAuth.ts';
import { holdShareToken, putShareToken, readShareToken } from '../src/lib/chat/shareTokens.ts';
import { placeShare, type ExportLine, type StoredShare } from './share-export.ts';

/**
 * The share migration (db/migrate-shares.ts): each row of `share` placed as
 * an export line (`placeShare`) and sent to dfo-apis' share import route,
 * with the SHA-256 of the owner's write token. The token itself stays in
 * `share_token`. docs/share-export.md describes the run.
 */

/** dfo-apis' share import route: its path, the header its principal goes
 *  in, and the statuses that mean the share is there. */
export const SHARE_IMPORT = {
    path: (shareId: string) => `/api/presentation/shares/${encodeURIComponent(shareId)}/import`,
    principalHeader: 'x-dfo-principal',
    imported: 201,
    unchanged: 200,
} as const;

/** What the route takes: the export line without `id`, plus the hex
 *  SHA-256 of the owner's write token, null for a guest's share. */
export type ImportBody = Omit<ExportLine, 'id'> & { write_token_sha256: string | null };

/** `imported`, `unchanged`, or the code of a refusal: dfo-apis' problem
 *  code, `http_<status>` for an answer without one, or one of the codes
 *  below for a share the run did not send. */
export type ShareOutcome = { id: string; code: string; detail?: string };

export type ImportShare = (shareId: string, body: ImportBody) => Promise<Omit<ShareOutcome, 'id'>>;

// How long one import call may take. The owner's user row stays locked for
// the call, so a slow answer holds back their account's deletion.
const IMPORT_TIMEOUT_MS = 30_000;

/** The import route on `base`, called with `principal` through `apisFetch`,
 *  which adds the runtime service account's ID token on Cloud Run. A call
 *  that gets no answer throws. */
export const importOverHttp =
    ({
        base,
        principal,
        fetchImpl = apisFetch,
    }: {
        base: string;
        principal: string;
        fetchImpl?: Fetch;
    }): ImportShare =>
    async (shareId, body) => {
        const response = await fetchImpl(
            `${base.replace(/\/$/, '')}${SHARE_IMPORT.path(shareId)}`,
            {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                    [SHARE_IMPORT.principalHeader]: principal,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
            },
        );
        const text = await response.text();

        if (response.status === SHARE_IMPORT.imported) {
            return { code: 'imported' };
        }

        if (response.status === SHARE_IMPORT.unchanged) {
            return { code: 'unchanged' };
        }

        let problem: { code?: unknown; detail?: unknown } = {};

        try {
            problem = JSON.parse(text) ?? {};
        } catch {
            // An answer that is not a problem document, such as a proxy's page.
        }

        return {
            code: typeof problem.code === 'string' ? problem.code : `http_${response.status}`,
            detail: typeof problem.detail === 'string' ? problem.detail : text.slice(0, 200),
        };
    };

/** A fresh write token: `shw_` and 16 random bytes as 22 base64url
 *  characters, the shape dfo-apis issues. */
const mintWriteToken = (): string => `shw_${randomBytes(16).toString('base64url')}`;

const sha256Hex = (text: string): string => createHash('sha256').update(text).digest('hex');

type MigrateDb = Pick<NodePgDatabase, 'transaction'>;

/**
 * Migrate one share. A guest's share goes with a null digest. A signed-in
 * owner's share takes two transactions. The first reads the owner's token,
 * or mints one and stores it with `putShareToken`, and commits, so a token
 * dfo-apis may hold the digest of is never lost and a re-run reuses it. The
 * second reads the token with the owner's user row `FOR SHARE` and holds
 * that lock across the import call, so an account deletion either waits and
 * then finds the token to take the imported share down, or fences the
 * account first and the share is skipped.
 */
export const migrateShare = async (
    db: MigrateDb,
    row: StoredShare,
    importShare: ImportShare,
): Promise<ShareOutcome> => {
    const placement = placeShare(row);

    if ('refusal' in placement) {
        return { id: row.id, code: 'placement_refused', detail: placement.refusal };
    }

    const { id, ...line } = placement.line;
    const send = async (digest: string | null): Promise<ShareOutcome> => {
        try {
            return { id, ...(await importShare(id, { ...line, write_token_sha256: digest })) };
        } catch (error) {
            return {
                id,
                code: 'unreachable',
                detail: error instanceof Error ? error.message : String(error),
            };
        }
    };

    if (line.owner === null) {
        return send(null);
    }

    const owner = { shareId: id, userId: line.owner };
    const stored = await db.transaction(async (tx) => {
        if (await readShareToken(tx, owner)) {
            return true;
        }

        return putShareToken(tx, { ...owner, writeToken: mintWriteToken() });
    });

    if (!stored) {
        return {
            id,
            code: 'token_not_stored',
            detail: "the owner's account is gone or being deleted, or another user holds the share's token",
        };
    }

    return db.transaction(async (tx) => {
        const token = await holdShareToken(tx, owner);

        if (token === null) {
            return {
                id,
                code: 'owner_deleted',
                detail: "the owner's account is gone or being deleted",
            };
        }

        return send(sha256Hex(token));
    });
};

/**
 * Migrate every share in `rows`, one at a time, logging `share <id>: <code>
 * <detail>` for each that is neither imported nor unchanged and then the
 * count of each code. 0 when every share is imported or unchanged, else 1.
 */
export const migrateShares = async ({
    db,
    rows,
    importShare,
    log,
}: {
    db: MigrateDb;
    rows: StoredShare[];
    importShare: ImportShare;
    log: (line: string) => void;
}): Promise<0 | 1> => {
    const counts = new Map<string, number>();

    for (const row of rows) {
        const { id, code, detail } = await migrateShare(db, row, importShare);

        counts.set(code, (counts.get(code) ?? 0) + 1);

        if (code !== 'imported' && code !== 'unchanged') {
            log(`share ${id}: ${code}${detail ? ` ${detail}` : ''}`);
        }
    }

    const tally = [...counts].map(([code, count]) => `${code} ${count}`).join(', ');

    log(`${rows.length} shares${tally ? `: ${tally}` : ''}`);

    const settled = (counts.get('imported') ?? 0) + (counts.get('unchanged') ?? 0);

    return settled === rows.length ? 0 : 1;
};
