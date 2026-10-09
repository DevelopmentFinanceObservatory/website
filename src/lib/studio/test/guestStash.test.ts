/**
 * `guestStash.ts`: a guest's session survives the trip through sign-in,
 * is read back once, and every storage failure reads as nothing stashed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { stashGuestSession, takeGuestSession } from '../guestStash.ts';

import type { SavedConversation } from '@/lib/chat/history';

/** A Storage over a Map, as `sessionStorage` behaves. */
class MemoryStorage {
    items = new Map<string, string>();

    getItem(key: string) {
        return this.items.get(key) ?? null;
    }

    setItem(key: string, value: string) {
        this.items.set(key, value);
    }

    removeItem(key: string) {
        this.items.delete(key);
    }
}

const saved = {
    id: 'conv_a',
    sessionId: 'sess_a',
    title: 'Kenya debt service',
    updatedAt: 1,
    messages: [{ role: 'user', text: 'Kenya debt service' }],
    widgets: [],
    activity: [],
} as unknown as SavedConversation;

test('a stashed session is read back once', () => {
    const storage = new MemoryStorage();
    const get = () => storage;

    stashGuestSession(get, saved);

    assert.deepEqual(takeGuestSession(get), saved);
    assert.equal(takeGuestSession(get), null);
});

test('nothing to stash clears what an earlier one left', () => {
    const storage = new MemoryStorage();
    const get = () => storage;

    stashGuestSession(get, saved);
    stashGuestSession(get, null);

    assert.equal(takeGuestSession(get), null);
});

test('a write the storage refuses leaves nothing behind', () => {
    const storage = new MemoryStorage();
    const get = () => storage;

    storage.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError');
    };

    stashGuestSession(get, saved);

    assert.equal(takeGuestSession(get), null);
});

test('storage that cannot be reached reads as nothing stashed', () => {
    const blocked = () => {
        throw new DOMException('denied', 'SecurityError');
    };

    stashGuestSession(blocked, saved);

    assert.equal(takeGuestSession(blocked), null);
});

test('a half-written or empty session is not reopened', () => {
    const storage = new MemoryStorage();
    const get = () => storage;

    storage.setItem('studio-guest-session', '{not json');
    assert.equal(takeGuestSession(get), null);

    storage.setItem('studio-guest-session', JSON.stringify({ ...saved, messages: [] }));
    assert.equal(takeGuestSession(get), null);

    storage.setItem('studio-guest-session', JSON.stringify({ messages: [{ text: 'x' }] }));
    assert.equal(takeGuestSession(get), null);
});
