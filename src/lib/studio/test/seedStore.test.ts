/**
 * `seedStore.ts`: seeds written under a token are read back once, and every
 * storage failure reads as no seeds.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { takeSeeds, writeSeeds } from '../seedStore.ts';
import type { Seed } from '../wire.ts';

/** A Storage over a Map, as `sessionStorage` behaves. */
class MemoryStorage {
    items = new Map<string, string>();

    get length() {
        return this.items.size;
    }

    key(index: number) {
        return [...this.items.keys()][index] ?? null;
    }

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

const seed: Seed = {
    spec: {
        spec_id: 'spec_a',
        definition: { schema_version: 1, spec_id: 'spec_a', identity: {} },
        resolved: { stat_vars: { items: [], member_count: 0, truncated: false } },
    },
    operations: [{ verb: 'explain', phrase: 'why did it fall', over: null }],
};

test('seeds written under a token are read back once', () => {
    const storage = new MemoryStorage();
    const get = () => storage;
    const token = writeSeeds(get, [seed]);

    assert.ok(token);
    assert.deepEqual(takeSeeds(get, token), [seed]);
    assert.equal(takeSeeds(get, token), null);
    assert.equal(storage.length, 0);
});

test('a forecast operation keeps its target year through the store', () => {
    const storage = new MemoryStorage();
    const get = () => storage;
    const forecast: Seed = {
        ...seed,
        operations: [{ verb: 'forecast', phrase: 'by 2030', over: null, target_year: 2030 }],
    };
    const token = writeSeeds(get, [forecast]);

    assert.ok(token);
    assert.deepEqual(takeSeeds(get, token), [forecast]);
});

test('no seeds write nothing and give no token', () => {
    const storage = new MemoryStorage();
    const get = () => storage;

    assert.equal(writeSeeds(get, []), null);
    assert.equal(storage.length, 0);
});

test('a new handoff clears seeds an earlier one left unread, and nothing else', () => {
    const storage = new MemoryStorage();
    const get = () => storage;

    storage.setItem('dfo-visitor', 'v');

    const first = writeSeeds(get, [seed])!;
    const second = writeSeeds(get, [seed])!;

    assert.equal(takeSeeds(get, first), null);
    assert.deepEqual(takeSeeds(get, second), [seed]);
    assert.equal(storage.getItem('dfo-visitor'), 'v');
});

test('a write the storage refuses gives no token', () => {
    const storage = new MemoryStorage();
    const get = () => storage;

    storage.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError');
    };

    assert.equal(writeSeeds(get, [seed]), null);
});

test('storage that cannot be reached reads as no seeds either way', () => {
    const blocked = () => {
        throw new DOMException('denied', 'SecurityError');
    };

    assert.equal(writeSeeds(blocked, [seed]), null);
    assert.equal(takeSeeds(blocked, 'token'), null);
});

test('a token with nothing or unreadable text behind it reads as no seeds', () => {
    const storage = new MemoryStorage();
    const get = () => storage;

    storage.setItem('studio-seed:broken', '{not json');
    storage.setItem('studio-seed:empty', '[]');

    assert.equal(takeSeeds(get, 'missing'), null);
    assert.equal(takeSeeds(get, 'broken'), null);
    assert.equal(takeSeeds(get, 'empty'), null);
});
