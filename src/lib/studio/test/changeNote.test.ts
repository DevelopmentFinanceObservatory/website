import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { placeCard } from '../cardReplace.ts';
import { changeNote, rowValues } from '../changeNote.ts';
import { widgetFromComponent } from '../widgets.ts';
import type { ComponentCreated } from '../wire.ts';

const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/event-06-component-created.json', import.meta.url), 'utf8'),
) as ComponentCreated;

// Card `id` drawn on page turn `turn`, over `start` to `end`, showing `place`.
const drawn = (id: string, turn: number, start: number, end: number, place = 'Kenya') => {
    const widget = widgetFromComponent({
        ...fixture,
        component_id: id,
        card_changes: {
            spec_id: `spec_${id}`,
            window: { start_year: start, end_year: end, first_year: 2000, last_year: 2024 },
            places: [
                {
                    role: 'observationAbout',
                    multiple: false,
                    chosen: [{ id: `country/${place}`, label: place }],
                },
            ],
        },
    });

    assert.ok(widget);

    return { ...widget, turn };
};

// The reply of turn 1 drew `first`; each later card is a card change of the
// card before it, on the next page turn.
const changed = (...cards: ReturnType<typeof drawn>[]) =>
    cards.slice(1).reduce(
        (held, card, index) =>
            placeCard(held, card, {
                replaces: cards[index]?.id,
                keepTurn: true,
                values: rowValues,
            }),
        [cards[0] as ReturnType<typeof drawn>],
    );

const titleOf = (card: { id: string }) => `Aid ${card.id}`;

test('a reply whose card a change redrew says what the card shows since, and the last of several changes of one kind', () => {
    assert.equal(changeNote([drawn('a', 1, 2016, 2024)], titleOf), null);
    assert.equal(
        changeNote(changed(drawn('a', 1, 2016, 2024), drawn('b', 2, 2010, 2020)), titleOf),
        'This card now shows 2010 to 2020.',
    );
    assert.equal(
        changeNote(
            changed(
                drawn('a', 1, 2016, 2024),
                drawn('b', 2, 2010, 2020),
                drawn('c', 3, 2000, 2015),
                drawn('d', 4, 2000, 2015, 'Uganda'),
            ),
            titleOf,
        ),
        'This card now shows Uganda, 2000 to 2015.',
    );
});

test('a change and a change back leave no note', () => {
    assert.equal(
        changeNote(
            changed(
                drawn('a', 1, 2016, 2024),
                drawn('b', 2, 2010, 2020),
                drawn('c', 3, 2016, 2024),
            ),
            titleOf,
        ),
        null,
    );
});

test('a reply with two cards names the changed card by its title', () => {
    const [b] = changed(drawn('a', 1, 2016, 2024), drawn('b', 2, 2010, 2020));

    assert.ok(b);
    assert.equal(
        changeNote([b, drawn('x', 1, 2016, 2024)], titleOf),
        '“Aid b” now shows 2010 to 2020.',
    );
});

test('a card a question drew in another’s place starts afresh, so its reply has no note', () => {
    const [b] = changed(drawn('a', 1, 2016, 2024), drawn('b', 2, 2010, 2020));

    assert.ok(b);

    const asked = placeCard([b], drawn('c', 3, 2012, 2020), { replaces: 'b', values: rowValues });

    assert.equal(changeNote(asked, titleOf), null);
});

test('the note stands on the rows the change recorded, once the card’s offers are gone', () => {
    const [b] = changed(drawn('a', 1, 2016, 2024), drawn('b', 2, 2010, 2020, 'Uganda'));

    assert.ok(b && b.kind !== 'text');

    // A reload without a session, a left session or a stale refusal drops
    // the offers; the card still shows the change.
    const bare = { ...b, cardChanges: undefined };

    assert.equal(changeNote([bare], titleOf), 'This card now shows Uganda, 2010 to 2020.');
});
