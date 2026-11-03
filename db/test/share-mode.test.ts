import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { SavedConversation } from '../../src/lib/chat/history.ts';
import { isLiveStudioShare, searchShareMode } from '../../src/lib/chat/shareMode.ts';
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
 * The `share.mode` column against the migrated tables as the runtime role:
 * a row stored with no mode holds null, which reads as a snapshot for a
 * Studio kind and as live for a search (src/lib/chat/shareMode.ts).
 */
test('share mode column', async (t) => {
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

    await db.insert(user).values({ id: 'owner', name: 'Owner', email: 'owner@example.org' });

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
});
