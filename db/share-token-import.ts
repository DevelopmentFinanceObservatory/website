import { inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { putShareToken } from '../src/lib/chat/shareTokens.ts';
import { user } from './schema.ts';

/**
 * The token import (scripts/import-share-tokens.ts): the write tokens
 * dfo-apis' `import-shares` minted for signed-in owners' shares, one JSON
 * line `{id, owner, write_token}` each, into `share_token`. A line whose
 * token is already stored stores it again, so a second run of the same file
 * changes nothing.
 */

export type TokenLine = { id: string; owner: string; write_token: string };

const SHARE_ID = /^[A-Za-z0-9]{8}$/;
const WRITE_TOKEN = /^shw_\S+$/;

const isTokenLine = (value: unknown): value is TokenLine => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const { id, owner, write_token: token } = value as Record<string, unknown>;

    return (
        typeof id === 'string' &&
        SHARE_ID.test(id) &&
        typeof owner === 'string' &&
        owner !== '' &&
        typeof token === 'string' &&
        WRITE_TOKEN.test(token)
    );
};

/** The lines of a token file, or the 1-based numbers of the lines that are
 *  not `{id, owner, write_token}` with an 8-character id and a `shw_` token.
 *  Blank lines are skipped. */
export const readTokenLines = (text: string): { lines: TokenLine[]; invalid: number[] } => {
    const lines: TokenLine[] = [];
    const invalid: number[] = [];

    text.split('\n').forEach((raw, index) => {
        if (raw.trim() === '') {
            return;
        }

        let parsed: unknown;

        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = null;
        }

        if (isTokenLine(parsed)) {
            lines.push(parsed);
        } else {
            invalid.push(index + 1);
        }
    });

    return { lines, invalid };
};

/** What an import came to: how many tokens it stored, the shares whose
 *  owner is no longer a website user, and the shares whose token another
 *  user holds, which are left as they were. */
export type TokenImport = { stored: number; ownerGone: string[]; heldByOther: string[] };

export const importShareTokens = async (
    db: Pick<NodePgDatabase, 'select' | 'insert' | 'update' | 'delete'>,
    lines: TokenLine[],
): Promise<TokenImport> => {
    const owners = [...new Set(lines.map((line) => line.owner))];
    const present = owners.length
        ? new Set(
              (await db.select({ id: user.id }).from(user).where(inArray(user.id, owners))).map(
                  ({ id }) => id,
              ),
          )
        : new Set<string>();
    const result: TokenImport = { stored: 0, ownerGone: [], heldByOther: [] };

    for (const { id, owner, write_token: writeToken } of lines) {
        if (!present.has(owner)) {
            result.ownerGone.push(id);
        } else if (await putShareToken(db, { shareId: id, userId: owner, writeToken })) {
            result.stored += 1;
        } else {
            result.heldByOther.push(id);
        }
    }

    return result;
};
