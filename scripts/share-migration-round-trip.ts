// The share migration end to end, on a local website and the dfo-apis local
// stack: seeds one share row per legacy case in the website database, runs
// export-shares, dfo-apis' import-shares and import-share-tokens, renders
// /s/<id> and /embed/<id> of each through the dev server, writes to the
// signed-in owner's share with its imported token, and runs both imports
// again to show they change nothing. docs/share-export.md says how to run it.
//
//   node scripts/share-migration-round-trip.ts
//
// Reads DATABASE_URL (the dev server's database, migrated), BETTER_AUTH_SECRET
// (the dev server's, to sign the owner's session cookie), WEBSITE_URL (the dev
// server, default http://127.0.0.1:3000) and DFO_APIS_DIR (the dfo-apis
// checkout whose `just local-stack` is up and seeded). Each check prints one
// line, and the run exits 1 when any fails. It leaves its rows and shares in
// place, under ids no other run uses.
import { execFile } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { openPool } from './open-pool.ts';

const run = promisify(execFile);

const WEBSITE = (process.env.WEBSITE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const APIS_DIR = process.env.DFO_APIS_DIR;
const AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
// The address the site's front end would append for this script, a
// documentation address (RFC 5737).
const CLIENT = { 'x-forwarded-for': '203.0.113.11' };
const SESSION_COOKIE = 'better-auth.session_token';

let failures = 0;

const check = (name: string, ok: boolean, detail = ''): void => {
    if (!ok) {
        failures += 1;
    }

    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? `: ${detail}` : ''}`);
};

const SHARE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// A fresh 8-character share id, so a run never meets an earlier run's shares.
const shareId = (): string =>
    Array.from(randomBytes(8), (byte) => SHARE_ALPHABET[byte % SHARE_ALPHABET.length]).join('');

type Reading = { name: string; spec_id: string; content_version: string };
type CardRef = { component_id: string; revision: number };
type Frame = { spec_id: string; content_version: string };

// A card in dfo-apis on `frame`, made through the site's proxy.
const makeCard = async (type: string, title: string, frame: Frame): Promise<CardRef> => {
    const manifest = (await (
        await fetch(`${WEBSITE}/api/v1/datasets/${frame.spec_id}/${frame.content_version}`)
    ).json()) as { definition: { identity: { shape: { id: string } } } };
    const response = await fetch(`${WEBSITE}/api/v1/presentation/components`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...CLIENT },
        body: JSON.stringify({
            intent: {
                type,
                title,
                frame_ref: { spec_id: frame.spec_id, content_version: frame.content_version },
                select: { stat_var: `dcid:${manifest.definition.identity.shape.id}` },
            },
        }),
    });
    const body = (await response.json()) as CardRef & { code?: string };

    if (!response.ok) {
        throw new Error(`card create answered ${response.status} ${body.code}`);
    }

    return { component_id: body.component_id, revision: body.revision };
};

const chart = (id: string, turn: number, title: string, extra: Record<string, unknown> = {}) => ({
    kind: 'chart',
    id,
    turn,
    chartType: 'line',
    title,
    categories: ['2022', '2023'],
    series: [{ label: 'Kenya', values: [1, 2] }],
    ...extra,
});

const table = (id: string, turn: number, title: string, extra: Record<string, unknown> = {}) => ({
    kind: 'table',
    id,
    turn,
    title,
    columns: ['Year', 'Value'],
    rows: [['2023', '3.5']],
    ...extra,
});

// A saved conversation as the website stored a share's copy of it.
const conversation = (title: string, widgets: unknown[], rest: Record<string, unknown> = {}) => ({
    id: `conv-${randomUUID()}`,
    sessionId: 'harness-session',
    componentRefs: [],
    title,
    updatedAt: 1,
    messages: [],
    widgets,
    activity: [],
    turnCount: 1,
    pinnedIds: [],
    removedIds: [],
    layout: {},
    textCards: [],
    titles: {},
    notes: {},
    views: {},
    ...rest,
});

type Case = {
    label: string;
    id: string;
    kind: 'search' | 'canvas' | 'card' | 'conversation';
    mode: 'live' | 'snapshot' | null;
    owned: boolean;
    title: string;
    data: unknown;
    parts: Record<string, unknown>[];
    // Text each Studio page shows, server-rendered, and text it must not.
    // A slotted card draws its component revision, and a live one is held
    // for the browser, named by its component id.
    shows: string[];
    hides: string[];
    // The titles a live share's slots draw, from their component revisions.
    slots: string[];
};

const searchPart = (index: number, reading: Reading, pinned: boolean) => ({
    part_index: index,
    spec_id: reading.spec_id,
    identity: { variable: reading.name },
    entity_groups: null,
    variable_text: reading.name,
    content_version: pinned ? reading.content_version : null,
    artifact_digest: null,
    operations: [],
    assumptions: null,
});

const page = async (pathname: string) => {
    const response = await fetch(`${WEBSITE}${pathname}`, { redirect: 'manual', headers: CLIENT });

    return {
        status: response.status,
        location: response.headers.get('location'),
        text: await response.text(),
    };
};

// The counts in import-shares' `presentation_shares_imported` line.
const importCounts = (output: string): { imported?: number; unchanged?: number } =>
    JSON.parse(
        output.split('\n').find((line) => line.includes('presentation_shares_imported')) ?? '{}',
    );

const main = async (): Promise<void> => {
    if (!APIS_DIR || !AUTH_SECRET || !process.env.DATABASE_URL) {
        console.error(
            'set DATABASE_URL, BETTER_AUTH_SECRET and DFO_APIS_DIR; see docs/share-export.md',
        );
        process.exitCode = 2;

        return;
    }

    const readings = JSON.parse(
        await fs.readFile(path.join(APIS_DIR, 'runs/local-stack/seeded.json'), 'utf8'),
    ) as Reading[];
    const [oda, population] = ['oda_germany_to_kenya_ghana_nigeria', 'kenya_population'].map(
        (name) => {
            const reading = readings.find((r) => r.name === name);

            if (!reading) {
                throw new Error(`the local stack seeded no ${name}`);
            }

            return reading;
        },
    ) as [Reading, Reading];

    const odaCard = await makeCard('line_chart', 'German aid, round trip', oda);
    const peopleCard = await makeCard('table', 'Kenya population, round trip', population);
    const odaFrame = { spec_id: oda.spec_id, content_version: oda.content_version };

    const cases: Case[] = [
        {
            label: 'search, no mode, guest',
            id: shareId(),
            kind: 'search',
            mode: null,
            owned: false,
            title: 'aid to Kenya',
            data: { query: 'aid to Kenya' },
            parts: [searchPart(0, oda, false)],
            shows: [],
            hides: [],
            slots: [],
        },
        {
            label: 'search snapshot, owner',
            id: shareId(),
            kind: 'search',
            mode: 'snapshot',
            owned: true,
            title: 'people in Kenya',
            data: { query: 'people in Kenya' },
            parts: [searchPart(0, population, true)],
            shows: [],
            hides: [],
            slots: [],
        },
        {
            label: 'canvas, no mode, a card with no ref, owner',
            id: shareId(),
            kind: 'canvas',
            mode: null,
            owned: true,
            title: 'Round trip canvas',
            data: conversation(
                'Round trip canvas',
                [
                    chart('c1', 1, 'Stored chart title', { ref: odaCard, frame: odaFrame }),
                    table('c2', 1, 'Inline table with no ref'),
                ],
                {
                    textCards: [
                        { kind: 'text', id: 't1', title: 'Note', body: 'Words from the owner' },
                    ],
                },
            ),
            parts: [],
            shows: ['German aid, round trip', 'Inline table with no ref', 'Words from the owner'],
            hides: ['Stored chart title'],
            slots: [],
        },
        {
            label: 'canvas live, a card with no frame, owner',
            id: shareId(),
            kind: 'canvas',
            mode: 'live',
            owned: true,
            title: 'Round trip live canvas',
            data: conversation('Round trip live canvas', [
                chart('c1', 1, 'Stored chart title', { ref: odaCard, frame: odaFrame }),
                table('c2', 1, 'Stored table title', { ref: peopleCard }),
            ]),
            parts: [],
            shows: [odaCard.component_id, peopleCard.component_id],
            hides: ['Stored chart title', 'Stored table title'],
            slots: ['German aid, round trip', 'Kenya population, round trip'],
        },
        {
            label: 'card live, owner',
            id: shareId(),
            kind: 'card',
            mode: 'live',
            owned: true,
            title: 'Round trip live card',
            data: conversation(
                'Round trip live card',
                [chart('c1', 1, 'Stored chart title', { ref: odaCard, frame: odaFrame })],
                { pinnedIds: ['c1'] },
            ),
            parts: [],
            shows: [odaCard.component_id],
            hides: ['Stored chart title'],
            slots: ['German aid, round trip'],
        },
        {
            label: 'card snapshot with no ref, guest',
            id: shareId(),
            kind: 'card',
            mode: 'snapshot',
            owned: false,
            title: 'Guest card',
            data: conversation('Guest card', [table('c1', 1, 'Guest table with no ref')], {
                pinnedIds: ['c1'],
            }),
            parts: [],
            shows: ['Guest table with no ref'],
            hides: [],
            slots: [],
        },
        {
            label: 'conversation, no mode, owner',
            id: shareId(),
            kind: 'conversation',
            mode: null,
            owned: true,
            title: 'Round trip conversation',
            data: conversation(
                'Round trip conversation',
                [chart('c1', 1, 'Stored chart title', { ref: odaCard, frame: odaFrame })],
                {
                    messages: [
                        { role: 'user', text: 'How much aid did Germany give Kenya?' },
                        { role: 'bot', text: 'Here is German aid to Kenya.' },
                    ],
                },
            ),
            parts: [],
            // A conversation keeps its stored copy whole, cards included.
            shows: [
                'How much aid did Germany give Kenya?',
                'Here is German aid to Kenya.',
                'Stored chart title',
            ],
            hides: [],
            slots: [],
        },
    ];

    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'share-round-trip-'));
    const exported = path.join(work, 'shares.jsonl');
    const tokens = path.join(work, 'share-tokens.jsonl');
    const { pool, close } = await openPool();

    try {
        const owner = `owner-${randomUUID()}`;
        // The owner's share_token rows, as share id to token.
        const ownerTokens = async () =>
            JSON.stringify(
                (
                    await pool.query(
                        'select share_id, write_token from share_token where user_id = $1 order by share_id',
                        [owner],
                    )
                ).rows.map((row: { share_id: string; write_token: string }) => [
                    row.share_id,
                    row.write_token,
                ]),
            );
        // Every case is made after this moment, in case order, so the export
        // takes exactly them.
        const since = new Date(Date.now() - 1000);

        await pool.query(
            `insert into "user" (id, name, email, email_verified) values ($1, 'Owner', $2, true)`,
            [owner, `${owner}@example.org`],
        );

        for (const [index, share] of cases.entries()) {
            await pool.query(
                `insert into share (id, user_id, kind, mode, title, data, created_at)
                 values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
                [
                    share.id,
                    share.owned ? owner : null,
                    share.kind,
                    share.mode,
                    share.title,
                    JSON.stringify(share.data),
                    new Date(since.getTime() + 1 + index),
                ],
            );

            for (const part of share.parts) {
                await pool.query(
                    `insert into share_ref (share_id, part_index, spec_id, identity, entity_groups,
                         variable_text, content_version, artifact_digest, operations, assumptions)
                     values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb)`,
                    [
                        share.id,
                        part.part_index,
                        part.spec_id,
                        JSON.stringify(part.identity),
                        JSON.stringify(part.entity_groups),
                        part.variable_text,
                        part.content_version,
                        part.artifact_digest,
                        JSON.stringify(part.operations),
                        JSON.stringify(part.assumptions),
                    ],
                );
            }
        }

        console.log(`seeded ${cases.length} shares since ${since.toISOString()}:`);

        for (const share of cases) {
            console.log(`  ${share.id}  ${share.label}`);
        }

        const before = await page(`/s/${cases[2]!.id}`);

        check(
            'a share the website alone holds is not found before the import',
            before.status === 404,
            `${before.status}`,
        );

        const migrate = async () => {
            const out = await run(
                process.execPath,
                ['scripts/export-shares.ts', '--since', since.toISOString(), '--out', exported],
                { env: process.env },
            );
            const imported = await run(
                'uv',
                [
                    'run',
                    '--no-sync',
                    '--env-file',
                    'scripts/local-stack/local.env',
                    'datasets-maintenance',
                    'import-shares',
                    '--in',
                    exported,
                    '--tokens',
                    tokens,
                ],
                { cwd: APIS_DIR, env: { ...process.env, PYTHONPATH: APIS_DIR } },
            );
            const stored = await run(
                process.execPath,
                ['scripts/import-share-tokens.ts', '--in', tokens],
                { env: process.env },
            );

            return {
                export: out.stderr.trim(),
                import: (imported.stdout + imported.stderr).trim(),
                tokens: stored.stderr.trim(),
            };
        };

        const first = await migrate();

        console.log(`export-shares: ${first.export}`);
        console.log(`import-shares: ${first.import}`);
        console.log(`import-share-tokens: ${first.tokens}`);

        const lines = (await fs.readFile(exported, 'utf8'))
            .trimEnd()
            .split('\n')
            .map((line) => JSON.parse(line) as { id: string });

        check(
            'the export holds every seeded share, in order',
            JSON.stringify(lines.map(({ id }) => id)) === JSON.stringify(cases.map(({ id }) => id)),
            lines.map(({ id }) => id).join(' '),
        );
        check(
            'import-shares imported every share',
            importCounts(first.import).imported === cases.length,
            first.import,
        );

        const tokenLines = (await fs.readFile(tokens, 'utf8'))
            .trimEnd()
            .split('\n')
            .map((line) => JSON.parse(line) as { id: string; owner: string; write_token: string });
        const owned = cases.filter(({ owned }) => owned).map(({ id }) => id);

        check(
            "a token for each signed-in owner's share and none for a guest's",
            JSON.stringify(tokenLines.map(({ id }) => id).sort()) ===
                JSON.stringify([...owned].sort()) &&
                tokenLines.every((line) => line.owner === owner),
            tokenLines.map(({ id }) => id).join(' '),
        );

        const reported = JSON.stringify(
            tokenLines
                .map((line) => [line.id, line.write_token])
                .sort(([a = ''], [b = '']) => (a < b ? -1 : 1)),
        );
        const kept = await ownerTokens();

        check('import-share-tokens kept each token for the owner', kept === reported, kept);

        for (const share of cases) {
            const shown = await page(`/s/${share.id}`);
            const embedded = await page(`/embed/${share.id}`);

            if (share.kind === 'search') {
                check(
                    `${share.id} ${share.label}: /s redirects to its search`,
                    shown.status === 307 && shown.location === `/data?share=${share.id}`,
                    `${shown.status} ${shown.location}`,
                );
                check(
                    `${share.id} ${share.label}: /embed is not found`,
                    embedded.status === 404,
                    `${embedded.status}`,
                );

                const read = await fetch(`${WEBSITE}/api/share/${share.id}`);
                const body = (await read.json()) as {
                    mode?: string;
                    query?: string;
                    refs?: unknown[];
                };
                const expectedMode = share.mode ?? 'live';

                check(
                    `${share.id} ${share.label}: its references read back as ${expectedMode}`,
                    read.status === 200 &&
                        body.mode === expectedMode &&
                        body.query === share.title &&
                        body.refs?.length === share.parts.length,
                    `${read.status} ${JSON.stringify(body).slice(0, 300)}`,
                );
                continue;
            }

            for (const [name, answer] of [
                ['/s', shown],
                ['/embed', embedded],
            ] as const) {
                const missing = share.shows.filter((text) => !answer.text.includes(text));
                const extra = share.hides.filter((text) => answer.text.includes(text));

                check(
                    `${share.id} ${share.label}: ${name} answers 200 with its cards`,
                    answer.status === 200 && missing.length === 0 && extra.length === 0,
                    `${answer.status}, missing ${JSON.stringify(missing)}, shown ${JSON.stringify(extra)}`,
                );
            }

            for (const [index, title] of share.slots.entries()) {
                const slot = await fetch(
                    `${WEBSITE}/api/v1/presentation/shares/${share.id}/slots/${index + 1}`,
                    { headers: CLIENT },
                );
                const text = await slot.text();

                check(
                    `${share.id} ${share.label}: live slot ${index + 1} draws "${title}"`,
                    slot.status === 200 && text.includes(title),
                    `${slot.status} ${text.slice(0, 300)}`,
                );
            }
        }

        // The owner signs in with a session row and its cookie, signed as
        // Better Auth signs it.
        const token = randomBytes(24).toString('base64url');

        await pool.query(
            `insert into session (id, token, user_id, expires_at, created_at, updated_at)
             values ($1, $2, $3, now() + interval '1 hour', now(), now())`,
            [randomUUID(), token, owner],
        );

        const signature = createHmac('sha256', AUTH_SECRET).update(token).digest('base64');
        const cookie = `${SESSION_COOKIE}=${encodeURIComponent(`${token}.${signature}`)}`;
        const live = cases.find(({ kind, mode }) => kind === 'canvas' && mode === 'live')!;
        const guest = cases.find(({ owned, kind }) => !owned && kind === 'card')!;
        const write = (id: string, method: string, withCookie = true) =>
            fetch(`${WEBSITE}/api/share/${id}`, {
                method,
                headers: {
                    'content-type': 'application/json',
                    ...CLIENT,
                    ...(withCookie ? { cookie } : {}),
                },
                ...(method === 'PATCH' ? { body: JSON.stringify({ mode: 'snapshot' }) } : {}),
            });

        const anonymous = await write(live.id, 'PATCH', false);

        check(
            'a write without a session is refused',
            anonymous.status === 401,
            `${anonymous.status}`,
        );

        const switched = await write(live.id, 'PATCH');
        const switchedBody = await switched.text();

        check(
            `${live.id} the owner switches their imported live canvas to snapshot`,
            switched.status === 200 && JSON.parse(switchedBody).mode === 'snapshot',
            `${switched.status} ${switchedBody}`,
        );

        const record = await fetch(`${WEBSITE}/api/v1/presentation/shares/${live.id}`, {
            headers: CLIENT,
        });
        const recordBody = (await record.json()) as { mode?: string };

        check(
            `${live.id} dfo-apis holds it as a snapshot`,
            recordBody.mode === 'snapshot',
            JSON.stringify(recordBody).slice(0, 300),
        );

        const refused = await write(guest.id, 'DELETE');

        check(
            `${guest.id} the owner cannot delete a guest's share`,
            refused.status === 404,
            `${refused.status}`,
        );
        check(
            `${guest.id} the guest's share still renders`,
            (await page(`/s/${guest.id}`)).status === 200,
        );

        // Both imports again change nothing in dfo-apis or the website. The
        // reads go one at a time, since the shares door answers a retryable
        // 503 past four requests in flight.
        const readAll = async () => {
            const records = [];

            for (const { id } of cases) {
                const response = await fetch(`${WEBSITE}/api/v1/presentation/shares/${id}`, {
                    headers: CLIENT,
                });

                records.push(await response.json());
            }

            return JSON.stringify(records);
        };
        const recordsBefore = await readAll();
        const tokensBefore = await ownerTokens();
        const reportBefore = await fs.readFile(tokens, 'utf8');
        const again = await migrate();

        console.log(`export-shares again: ${again.export}`);
        console.log(`import-shares again: ${again.import}`);
        console.log(`import-share-tokens again: ${again.tokens}`);
        check(
            'a second import-shares imports none and finds every share imported',
            importCounts(again.import).imported === 0 &&
                importCounts(again.import).unchanged === cases.length,
            again.import,
        );
        check(
            'a second import-shares writes no token line',
            (await fs.readFile(tokens, 'utf8')) === reportBefore,
        );
        const recordsAfter = await readAll();

        check(
            'dfo-apis holds the same shares after both imports again',
            recordsAfter === recordsBefore,
            `before ${recordsBefore}\nafter  ${recordsAfter}`,
        );
        check(
            'share_token holds the same tokens after both imports again',
            (await ownerTokens()) === tokensBefore,
        );
    } finally {
        await close();
        await fs.rm(work, { recursive: true, force: true });
    }

    console.log(failures ? `${failures} checks failed` : 'every check passed');
    process.exitCode = failures ? 1 : 0;
};

main().catch((error: unknown) => {
    console.error('ERROR:', error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});
