import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { searchConversations } from '../../src/lib/chat/conversationSearch.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { conversation, user } from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

/**
 * Conversation search on Postgres reads each saved message's text and the
 * title of the card a user message names, and leaves out the approved plan
 * stored beside a reply.
 */
test('conversation search matches message text and card titles, not stored plans', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const db = drizzle(database.runtimePool());

    await db.insert(user).values([{ id: 'owner', name: 'Owner', email: 'owner@example.org' }]);
    await db.insert(conversation).values({
        id: 'conv-1',
        userId: 'owner',
        title: 'Aid question',
        data: {
            messages: [
                { role: 'user', text: 'How much aid did Ghana get?' },
                {
                    role: 'bot',
                    text: 'About 1 billion dollars.',
                    plan: { title: 'Net disbursements to Zanzibar', steps: [], choices: [] },
                },
                { role: 'user', text: 'Make it a bar chart', card: { title: 'Health aid trend' } },
            ],
        },
    });

    const hits = async (q: string) =>
        (await searchConversations(db, 'owner', q)).map((hit) => [hit.id, hit.snippet]);

    assert.deepEqual(await hits('ghana'), [['conv-1', 'How much aid did Ghana get?']]);
    assert.deepEqual(await hits('health aid'), [['conv-1', 'Health aid trend']]);
    assert.deepEqual(await hits('zanzibar'), []);
});
