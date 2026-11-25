import assert from 'node:assert/strict';
import test from 'node:test';

import type { RecordSlot } from '../chat/apisShares.ts';
import { embedDataView } from '../events/dataView.ts';
import { MAX_LIST_IDS } from '../events/limits.ts';

const CALLER = 'ip:0123456789abcdef0123456789abcdef';

const slot = (at: number, frame: [string, string] | null): RecordSlot => ({
    slot: at,
    card: {
        component_id: `comp-${at}`,
        revision: 1,
        frame: frame && { spec_id: frame[0], content_version: frame[1] },
    },
});

test('embedDataView: one part per distinct frame the embed shows, in slot order', () => {
    const slots = [
        slot(3, ['spec_c', 'cv_3']),
        slot(1, ['spec_a', 'cv_1']),
        slot(2, ['spec_a', 'cv_1']),
        slot(4, ['spec_d', 'cv_4']),
        { slot: 5, card: null },
    ];

    assert.deepEqual(
        embedDataView({
            slots,
            shownSlots: [3, 1, 2, 5],
            host: 'blog.example.org',
            caller: CALLER,
        }),
        {
            specIds: ['spec_a', 'spec_c'],
            contentVersions: ['cv_1', 'cv_3'],
            via: 'share',
            host: 'blog.example.org',
            caller: CALLER,
        },
    );
});

test('embedDataView: an unrecorded frame or a value the export refuses is a blank part', () => {
    assert.deepEqual(
        embedDataView({
            slots: [slot(1, null), slot(2, ['spec b', 'cv_2']), slot(3, ['spec_c', 'cv 3'])],
            shownSlots: [1, 2, 3],
            host: 'not a host',
            caller: null,
        }),
        {
            specIds: ['-', '-', 'spec_c'],
            contentVersions: ['-', 'cv_2', '-'],
            via: 'share',
            caller: null,
        },
    );
});

test('embedDataView: an embed that shows no data card records no view', () => {
    assert.equal(
        embedDataView({
            slots: [slot(1, ['spec_a', 'cv_1'])],
            shownSlots: [],
            host: null,
            caller: CALLER,
        }),
        null,
    );
});

test('embedDataView: each slot with no recorded frame keeps its own blank part', () => {
    const view = embedDataView({
        slots: [slot(1, null), slot(2, ['spec_b', 'cv_2']), slot(3, null)],
        shownSlots: [1, 2, 3],
        host: null,
        caller: null,
    });

    assert.deepEqual(view?.specIds, ['-', 'spec_b', '-']);
    assert.deepEqual(view?.contentVersions, ['-', 'cv_2', '-']);
});

test('embedDataView: the lists stop at MAX_LIST_IDS, in slot order', () => {
    const slots = Array.from({ length: MAX_LIST_IDS + 3 }, (_, at) =>
        slot(at + 1, [`spec_${at + 1}`, `cv_${at + 1}`]),
    );
    const view = embedDataView({
        slots,
        shownSlots: slots.map(({ slot: at }) => at),
        host: null,
        caller: null,
    });

    assert.deepEqual(
        view?.specIds,
        Array.from({ length: MAX_LIST_IDS }, (_, at) => `spec_${at + 1}`),
    );
    assert.deepEqual(
        view?.contentVersions,
        Array.from({ length: MAX_LIST_IDS }, (_, at) => `cv_${at + 1}`),
    );
});
