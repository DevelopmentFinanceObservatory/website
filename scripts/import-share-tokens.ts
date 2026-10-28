// Stores the write tokens dfo-apis' `import-shares` minted for signed-in
// owners' shares in share_token, so each owner can still switch and delete
// their shares once dfo-apis holds them. db/share-token-import.ts holds the
// reading and the writes.
//
//   node scripts/import-share-tokens.ts --in share-tokens.jsonl
//
// The file is the 0600 JSON lines `import-shares` writes, one
// {"id", "owner", "write_token"} per line. It reads the database from
// DATABASE_URL, or from the WEBSITE_DB_* Cloud SQL variables the runtime
// uses. A run of the same file again changes nothing. A file with a line it
// cannot read is refused whole, with each such line named on stderr, and
// nothing is stored. A share whose owner is no longer a user is skipped, and
// one whose token another user holds is left as it was and fails the run.
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { drizzle } from 'drizzle-orm/node-postgres';

import { importShareTokens, readTokenLines } from '../db/share-token-import.ts';
import { openPool } from './open-pool.ts';

const USAGE = `usage: node scripts/import-share-tokens.ts --in <file>

  --in  the token file dfo-apis' import-shares wrote`;

const main = async (): Promise<void> => {
    const { values } = parseArgs({
        options: { in: { type: 'string' }, help: { type: 'boolean', default: false } },
    });

    if (values.help || !values.in) {
        console.error(USAGE);
        process.exitCode = values.help ? 0 : 2;

        return;
    }

    const { lines, invalid } = readTokenLines(await fs.readFile(values.in, 'utf8'));

    if (invalid.length) {
        for (const line of invalid) {
            console.error(`line ${line}: not {"id", "owner", "write_token"} with a shw_ token`);
        }

        console.error(`${invalid.length} lines cannot be read; nothing stored.`);
        process.exitCode = 1;

        return;
    }

    const { pool, close } = await openPool();

    try {
        const { stored, ownerGone, heldByOther } = await importShareTokens(drizzle(pool), lines);

        for (const id of ownerGone) {
            console.error(`share ${id}: its owner is no longer a user; skipped`);
        }

        for (const id of heldByOther) {
            console.error(`share ${id}: another user holds its token; left as it was`);
        }

        console.error(
            `${stored} tokens stored, ${ownerGone.length} skipped, ${heldByOther.length} held by another user`,
        );

        if (heldByOther.length) {
            process.exitCode = 1;
        }
    } finally {
        await close();
    }
};

main().catch((error: unknown) => {
    console.error('ERROR:', error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});
