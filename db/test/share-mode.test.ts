import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { SavedConversation } from '../../src/lib/chat/history.ts';
import { isLiveStudioShare, searchShareMode } from '../../src/lib/chat/shareMode.ts';
import {
    deleteOwnedShare,
    insertStudioShare,
    LIVE_CARD_TITLE,
    snapshotOwnedShare,
} from '../../src/lib/chat/shareWrites.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { share, user } from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

const saved: SavedConversation = {
    id: 'conv-1',
    sessionId: 'harness-session-1',
    componentRefs: [{ component_id: 'private-card', revision: 3 }],
    title: 'Aid to Kenya',
    updatedAt: 1,
    messages: [],
    widgets: [],
    activity: [],
    turnCount: 1,
    pinnedIds: [],
    removedIds: [],
    layout: {},
    textCards: [{ kind: 'text', id: 'note-1', title: 'Note', body: 'Body' }],
};

/**
 * `shareWrites.ts` against the migrated tables as the runtime role: a Studio
 * share stores its mode, a row with no mode reads as a snapshot for a Studio
 * kind and as live for a search, and only a share's owner switches it to
 * snapshot or deletes it.
 */
test('Studio share writes', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const db = drizzle(database.runtimePool());
    const stored = async (id: string) => {
        const [row] = await db.select().from(share).where(eq(share.id, id)).limit(1);

        return row;
    };

    await db.insert(user).values([
        { id: 'owner', name: 'Owner', email: 'owner@example.org' },
        { id: 'other', name: 'Other', email: 'other@example.org' },
    ]);

    await t.test('insertStudioShare stores the mode it is given', async () => {
        const cases = [
            ['canvas', 'live'],
            ['canvas', 'snapshot'],
            ['card', 'live'],
            ['card', 'snapshot'],
            ['conversation', 'snapshot'],
        ] as const;

        for (const [kind, mode] of cases) {
            const { id } = await insertStudioShare(db, {
                userId: 'owner',
                kind,
                mode,
                saved,
                cardId: kind === 'card' ? 'note-1' : undefined,
            });
            const row = await stored(id);

            assert.equal(row?.mode, mode, `${kind} ${mode}`);
            assert.equal(isLiveStudioShare(row!), mode === 'live', `${kind} ${mode}`);
        }
    });

    await t.test('a live card share’s title is the sharer’s own, never the card’s', async () => {
        const withCard = {
            ...saved,
            widgets: [
                {
                    kind: 'chart' as const,
                    id: 'chart-1',
                    turn: 1,
                    chartType: 'line' as const,
                    title: 'Stored heading',
                    categories: ['2024'],
                    series: [{ label: 'Kenya', values: [1] }],
                },
            ],
        };
        const titled = async (mode: 'live' | 'snapshot', titles?: Record<string, string>) => {
            const { id } = await insertStudioShare(db, {
                userId: 'owner',
                kind: 'card',
                mode,
                saved: { ...withCard, ...(titles ? { titles } : {}) },
                cardId: 'chart-1',
            });

            return (await stored(id))?.title;
        };

        assert.equal(await titled('snapshot'), 'Stored heading');
        assert.equal(await titled('live'), LIVE_CARD_TITLE);
        assert.equal(await titled('live', { 'chart-1': 'My own title' }), 'My own title');
        assert.equal(await titled('snapshot', { 'chart-1': 'My own title' }), 'My own title');
    });

    await t.test('a stored row with no mode is a Studio snapshot and a live search', async () => {
        await db.insert(share).values([
            { id: 'canv0000', userId: 'owner', kind: 'canvas', title: 'Old', data: saved },
            { id: 'card0000', userId: 'owner', kind: 'card', title: 'Old', data: saved },
            { id: 'srch0000', kind: 'search', title: 'aid', data: { query: 'aid' } },
        ]);

        for (const id of ['canv0000', 'card0000']) {
            const row = await stored(id);

            assert.equal(row?.mode, null);
            assert.equal(isLiveStudioShare(row!), false, id);
        }

        const search = await stored('srch0000');

        assert.equal(search?.mode, null);
        assert.equal(searchShareMode(search!.mode), 'live');
        assert.equal(isLiveStudioShare(search!), false);
    });

    await t.test('snapshotOwnedShare switches the owner’s live share only', async () => {
        const { id } = await insertStudioShare(db, {
            userId: 'owner',
            kind: 'canvas',
            mode: 'live',
            saved,
        });

        assert.equal(await snapshotOwnedShare(db, id, 'other'), 'not_found');
        assert.equal((await stored(id))?.mode, 'live');
        assert.equal(await snapshotOwnedShare(db, 'missing0', 'owner'), 'not_found');

        assert.equal(await snapshotOwnedShare(db, id, 'owner'), 'done');

        const row = await stored(id);

        assert.equal(row?.mode, 'snapshot');
        assert.deepEqual(row?.data, {
            ...saved,
            sessionId: null,
            componentRefs: [],
            messages: [],
            activity: [],
        });
        assert.equal(await snapshotOwnedShare(db, id, 'owner'), 'done');
        assert.equal((await stored(id))?.mode, 'snapshot');
    });

    await t.test('deleteOwnedShare removes the owner’s share only', async () => {
        const { id } = await insertStudioShare(db, {
            userId: 'owner',
            kind: 'card',
            mode: 'live',
            saved,
            cardId: 'note-1',
        });

        assert.equal(await deleteOwnedShare(db, id, 'other'), 'not_found');
        assert.ok(await stored(id));
        assert.equal(await deleteOwnedShare(db, 'missing0', 'owner'), 'not_found');

        assert.equal(await deleteOwnedShare(db, id, 'owner'), 'done');
        assert.equal(await stored(id), undefined);
        assert.equal(await deleteOwnedShare(db, id, 'owner'), 'not_found');
    });

    await t.test('a guest’s Studio share is unowned and matches no caller', async () => {
        const { id } = await insertStudioShare(db, {
            userId: null,
            kind: 'canvas',
            mode: 'live',
            saved,
        });

        assert.equal((await stored(id))?.userId, null);
        assert.equal(await snapshotOwnedShare(db, id, 'owner'), 'not_found');
        assert.equal(await deleteOwnedShare(db, id, 'owner'), 'not_found');
        assert.equal((await stored(id))?.mode, 'live');
    });

    await t.test('a search share has no owner writes', async () => {
        await db.insert(share).values([
            {
                id: 'srch0001',
                userId: 'owner',
                kind: 'search',
                mode: 'live',
                title: 'aid',
                data: { query: 'aid' },
            },
        ]);

        assert.equal(await snapshotOwnedShare(db, 'srch0001', 'owner'), 'unsupported_kind');
        assert.equal(await deleteOwnedShare(db, 'srch0001', 'owner'), 'unsupported_kind');
        assert.equal(await snapshotOwnedShare(db, 'srch0001', 'other'), 'not_found');
        assert.equal(await deleteOwnedShare(db, 'srch0001', 'other'), 'not_found');
        // An unowned search share matches no caller.
        assert.equal(await deleteOwnedShare(db, 'srch0000', 'owner'), 'not_found');
        assert.equal((await stored('srch0001'))?.mode, 'live');
        assert.ok(await stored('srch0000'));
    });
});
