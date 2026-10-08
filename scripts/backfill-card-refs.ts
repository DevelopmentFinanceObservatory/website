// Gives Studio cards stored without a component reference their `ref` and
// `frame`, in `conversation.data` and `share.data`, so they can be shared
// live. src/lib/studio/cardRefMatch.ts holds the matching rule and
// db/card-ref-backfill.ts the queries. docs/development.md says how to run
// it.
//
//   node scripts/backfill-card-refs.ts                # dry run: report only
//   node scripts/backfill-card-refs.ts --validate     # validation only
//   node scripts/backfill-card-refs.ts --write        # write matched cards
//
// It reads the database from DATABASE_URL, or from the WEBSITE_DB_* Cloud
// SQL variables the runtime uses, and component revisions from
// SEARCH_API_BASE.
import { parseArgs } from 'node:util';

import type { Pool } from 'pg';

import {
    type CardCounts,
    type CardPatch,
    type CardTable,
    readCardCounts,
    readCardRowIds,
    readWidgets,
    writeCardRefs,
} from '../db/card-ref-backfill.ts';
import {
    buildRuntimePool,
    connectCloudSqlRuntime,
    resolveRuntimeConnection,
    setCloudSqlRuntimeStream,
} from '../db/connection.ts';
import {
    asComponentRead,
    cardsWithoutRef,
    cardsWithRef,
    type ComponentRead,
    matchCardRef,
    MIN_VALIDATED,
    type ReadComponent,
    summarise,
    type UnmatchedReason,
    validateCard,
    type Validated,
    validationAllowsWrite,
} from '../src/lib/studio/cardRefMatch.ts';
import { searchApiBase } from '../src/lib/searchApi.ts';

const TABLES: CardTable[] = ['share', 'conversation'];

const USAGE = `usage: node scripts/backfill-card-refs.ts [--validate | --write [--override-validation]]

  (no flag)              dry run: counts, validation, and what a write would do
  --validate             counts and validation only
  --write                write ref and frame to matched cards; refused unless
                         validation finds no wrong match over ${MIN_VALIDATED} or more cards
  --override-validation  with --write, write even when validation refuses`;

/** Reads component revisions from the Presentation API, each one once. */
const componentReader = (base: string): ReadComponent => {
    const reads = new Map<string, Promise<ComponentRead | null>>();

    const fetchRead = async (url: URL): Promise<ComponentRead | null> => {
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });

        if (res.status === 404) {
            return null;
        }

        const read = res.ok ? asComponentRead(await res.json()) : undefined;

        if (!read) {
            throw new Error(
                `component read failed with status ${res.status}: ${url.pathname}${url.search}`,
            );
        }

        return read;
    };

    return (componentId, revision) => {
        const url = new URL(
            `/api/presentation/components/${encodeURIComponent(componentId)}`,
            base,
        );

        if (revision !== undefined) {
            url.searchParams.set('revision', String(revision));
        }

        const cached = reads.get(url.href);

        if (cached) {
            return cached;
        }

        const read = fetchRead(url).catch((error: unknown) => {
            console.warn(error instanceof Error ? error.message : String(error));

            throw error;
        });

        reads.set(url.href, read);

        return read;
    };
};

const openPool = async (): Promise<{ pool: Pool; close: () => Promise<void> }> => {
    const connection = resolveRuntimeConnection();

    if (connection.kind === 'url') {
        const pool = buildRuntimePool();

        return { pool, close: () => pool.end() };
    }

    const { connector, stream } = await connectCloudSqlRuntime(connection);

    setCloudSqlRuntimeStream(stream);

    const pool = buildRuntimePool();

    return {
        pool,
        close: async () => {
            await pool.end();
            connector.close();
        },
    };
};

const printCounts = (counts: CardCounts): void => {
    console.log('Shares by kind and mode');

    for (const { kind, mode, count } of counts.shares) {
        console.log(`  ${kind} / ${mode ?? 'no mode'}: ${count}`);
    }

    for (const table of TABLES) {
        const { rows, withoutRef, derivedByWeek } = counts.tables[table];

        console.log(`${table}.data, ${rows} rows that hold cards`);
        console.log(`  data cards with no component reference: ${withoutRef}`);
        console.log(
            `  cards on a derived frame, by week created: ${derivedByWeek.length ? '' : 'none'}`,
        );

        for (const { week, count } of derivedByWeek) {
            console.log(`    ${week}: ${count}`);
        }
    }
};

const tally = <Key extends string>(keys: Key[]): string =>
    Object.entries(Object.groupBy(keys, (key) => key))
        .map(([key, group]) => `${key} ${(group as Key[]).length}`)
        .join(', ');

const share = (part: number, whole: number): string =>
    whole ? `${part} (${((100 * part) / whole).toFixed(1)}%)` : String(part);

// Runs the match over every distinct component revision a stored card
// names, and reports how often it recovers that revision.
const validate = async (pool: Pool, read: ReadComponent): Promise<boolean> => {
    const known = new Map<string, Parameters<typeof validateCard>[0]>();

    for (const table of TABLES) {
        for (const id of await readCardRowIds(pool, table)) {
            for (const card of cardsWithRef(await readWidgets(pool, table, id))) {
                known.set(`${card.ref.component_id}@${card.ref.revision}`, card);
            }
        }
    }

    const results: Validated[] = [];

    for (const card of known.values()) {
        results.push(await validateCard(card, read));
    }

    const summary = summarise(results);
    const allowed = validationAllowsWrite(summary);
    const reasons = results.flatMap(({ outcome }) =>
        outcome.status === 'unmatched' ? [outcome.reason] : [],
    );

    console.log(`Validation over ${summary.validated} cards whose revision is known`);
    console.log(`  recovered correctly: ${share(summary.correct, summary.validated)}`);
    console.log(`  wrong: ${share(summary.wrong, summary.validated)}`);
    console.log(
        `  unmatched: ${share(summary.unmatched, summary.validated)}${reasons.length ? ` (${tally(reasons)})` : ''}`,
    );

    for (const { card, outcome, verdict } of results) {
        if (verdict === 'wrong' && outcome.status === 'matched') {
            console.log(
                `  WRONG ${card.id}: saved at revision ${card.ref.revision} on ${card.frame?.spec_id ?? 'no frame'}, ` +
                    `matched revision ${outcome.ref.revision} on ${outcome.frame.spec_id}`,
            );
        }
    }

    console.log(
        allowed
            ? '  A write is allowed.'
            : `  A write is refused: it needs no wrong match over at least ${MIN_VALIDATED} cards.`,
    );

    return allowed;
};

// Matches every card without `ref`, row by row, and writes the matches
// when `write` is set.
const backfill = async (pool: Pool, read: ReadComponent, write: boolean): Promise<void> => {
    for (const table of TABLES) {
        const unmatched: UnmatchedReason[] = [];
        let matched = 0;
        let written = 0;
        let rows = 0;

        for (const id of await readCardRowIds(pool, table)) {
            const patches: CardPatch[] = [];

            for (const { index, card } of cardsWithoutRef(await readWidgets(pool, table, id))) {
                const outcome = await matchCardRef(card, read);

                if (outcome.status === 'matched') {
                    patches.push({ index, card, ref: outcome.ref, frame: outcome.frame });
                } else {
                    unmatched.push(outcome.reason);
                    console.log(
                        `${table} ${id} card ${card.id}: left without ref, ${outcome.reason}`,
                    );
                }
            }

            if (patches.length === 0) {
                continue;
            }

            rows += 1;
            matched += patches.length;

            if (write) {
                written += await writeCardRefs(pool, table, id, patches);
            }
        }

        console.log(
            `${table}.data: ${matched} cards matched in ${rows} rows, ${unmatched.length} left without ref`,
        );

        if (unmatched.length) {
            console.log(`  left without ref: ${tally(unmatched)}`);
        }

        console.log(
            write
                ? `  written: ${written} of ${matched} (a card changed since it was read is skipped)`
                : '  dry run, nothing written',
        );
    }
};

const main = async (): Promise<void> => {
    const { values } = parseArgs({
        options: {
            validate: { type: 'boolean', default: false },
            write: { type: 'boolean', default: false },
            'override-validation': { type: 'boolean', default: false },
            help: { type: 'boolean', default: false },
        },
    });

    if (values.help || (values.validate && values.write)) {
        console.log(USAGE);
        process.exitCode = values.help ? 0 : 2;

        return;
    }

    if (values['override-validation'] && !values.write) {
        console.log(USAGE);
        process.exitCode = 2;

        return;
    }

    const read = componentReader(searchApiBase());
    const { pool, close } = await openPool();

    try {
        printCounts(await readCardCounts(pool));

        const allowed = await validate(pool, read);

        if (values.validate) {
            return;
        }

        if (values.write && !allowed) {
            if (!values['override-validation']) {
                console.error('Nothing written. Pass --override-validation to write anyway.');
                process.exitCode = 1;

                return;
            }

            console.warn(
                'Writing although validation refused, because --override-validation was passed.',
            );
        }

        await backfill(pool, read, values.write);
    } finally {
        await close();
    }
};

main().catch((error: unknown) => {
    console.error('ERROR:', error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});
