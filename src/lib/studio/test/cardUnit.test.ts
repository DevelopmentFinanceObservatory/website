/**
 * `cardUnit.ts`: a card drawn from a `component.created` frame with
 * `unit_change` builds an `apply_unit` request for a pick, says what it
 * changes, and loses its offer when its conversation has no harness session.
 * studioClient.test.ts replays the request against the harness fixture.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    cardUnitChange,
    cardUnitOffer,
    changeUnitText,
    unitRefusalDetail,
    unitRefusalStale,
    withoutUnitChanges,
} from '../cardUnit.ts';
import { widgetFromComponent } from '../widgets.ts';
import type { ComponentCreated } from '../wire.ts';

// Copied from the harness's wire fixtures
// (`services/harness/tests/wire_fixtures/studio` in dfo-ai).
const read = (name: string): unknown =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const created = read('event-19-component-unit-change.json') as ComponentCreated;

const card = () => {
    const widget = widgetFromComponent(created);

    assert.ok(widget);

    return { ...widget, turn: 2 };
};

test('the transcript and the chat line name the card and the unit', () => {
    const change = cardUnitChange(card(), 'Debt service', {
        currency: 'EUR',
        prices: 'constant',
        base_year: 2020,
    });

    assert.ok(change);
    assert.deepEqual(change.request.unit, { currency: 'EUR', prices: 'constant', base_year: 2020 });
    assert.equal(changeUnitText(change), 'Constant 2020 Euros');
});

test('a card with no offer, or no turn to name, has no change', () => {
    const plain = { ...card(), unitChange: undefined };
    const unit = { currency: 'USD', prices: 'current' as const };

    assert.equal(cardUnitOffer(plain), null);
    assert.equal(cardUnitChange(plain, 'Debt service', unit), null);
    assert.equal(cardUnitChange({ ...card(), turn: 0 }, 'Debt service', unit), null);
});

test('only a 422 pointing under /apply_unit is a unit refusal', () => {
    const refusal = (status: number, pointer: string) => ({
        status,
        detail: 'Stale.',
        error: {
            error: 'constraint_violation' as const,
            retry: 'do_not_retry' as const,
            detail: 'Stale.',
            pointer,
        },
    });

    assert.equal(unitRefusalDetail(refusal(422, '/apply_unit')), 'Stale.');
    assert.equal(unitRefusalDetail(refusal(422, '/apply_unit/unit')), 'Stale.');
    assert.equal(unitRefusalDetail(refusal(422, '/apply_choice')), null);
    assert.equal(unitRefusalDetail(refusal(409, '/apply_unit')), null);
});

test('only a scope_choice_stale unit refusal is stale', () => {
    const refusal = (constraint_id: string) => ({
        status: 422,
        detail: 'Stale.',
        error: {
            error: 'constraint_violation' as const,
            retry: 'do_not_retry' as const,
            detail: 'Stale.',
            pointer: '/apply_unit',
            constraint_id,
        },
    });

    assert.equal(unitRefusalStale(refusal('scope_choice_stale')), true);
    assert.equal(unitRefusalStale(refusal('request_invalid')), false);
});

test('a conversation reopened without its session drops every card offer', () => {
    const [stripped] = withoutUnitChanges([card()]);

    assert.ok(stripped);
    assert.equal(cardUnitOffer(card())?.start.currency, 'USD');
    assert.equal(cardUnitOffer(stripped), null);
});
