import assert from 'node:assert/strict';
import test from 'node:test';

import { plainTextFromNote } from '../note.ts';

test('an answer with inner underscores keeps them, only the wrapping strips', () => {
    assert.equal(plainTextFromNote('_co2_emissions_per_capita_'), 'co2_emissions_per_capita');
});

test('a note with no wrapping passes through unchanged', () => {
    assert.equal(plainTextFromNote('Thinking'), 'Thinking');
});

test('the chosen-option note strips its wrapping', () => {
    assert.equal(
        plainTextFromNote('_You chose: gross_national_income_'),
        'You chose: gross_national_income',
    );
});

test('the skipped note strips its wrapping', () => {
    assert.equal(plainTextFromNote('_Skipped._'), 'Skipped.');
});
