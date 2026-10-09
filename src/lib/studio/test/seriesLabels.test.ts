/**
 * `seriesLabels.ts`: what every series name shares is dropped, what tells
 * them apart is kept, and a name that would lose that is left alone.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { legendLabels } from '../seriesLabels.ts';

const who = (category: string) =>
    `Health expenditure as a share of a reference expenditure aggregate [Health expenditure category=${category}, Reference expenditure category=Current health expenditure] / Kenya`;

test('a WHO series keeps only what the category adds', () => {
    assert.deepEqual(
        legendLabels([
            who('Domestic general government health expenditure'),
            who('Domestic private health expenditure'),
            who('External health expenditure'),
        ]),
        ['Domestic general government', 'Domestic private', 'External'],
    );
});

test('names are cut at a boundary, never mid-word', () => {
    assert.deepEqual(legendLabels(['Kenya total', 'Kenyatta total']), ['Kenya', 'Kenyatta']);
});

test('a shared tail goes as well as a shared head', () => {
    assert.deepEqual(legendLabels(['GDP of Kenya / current USD', 'GDP of Ghana / current USD']), [
        'Kenya',
        'Ghana',
    ]);
});

test('the leading clause stands alone when it is already unique', () => {
    assert.deepEqual(
        legendLabels([
            'Spend [scheme=Public health, unit=USD, year=2020] / Kenya',
            'Spend [scheme=Private care, unit=EUR, year=2021] / Kenya',
        ]),
        ['Public health', 'Private care'],
    );
});

test('names with nothing in common are left alone', () => {
    const labels = ['Kenya', 'Ghana', 'Nigeria'];

    assert.deepEqual(legendLabels(labels), labels);
});

test('a lone series is left alone', () => {
    assert.deepEqual(legendLabels(['Health expenditure / Kenya']), ['Health expenditure / Kenya']);
});

test('an empty name leaves every name whole', () => {
    const labels = ['Spend / Kenya', ''];

    assert.deepEqual(legendLabels(labels), labels);
});

test('cutting that would make two names the same leaves them whole', () => {
    const labels = ['Spend (a) / Kenya', 'Spend [a] / Kenya'];

    assert.deepEqual(legendLabels(labels), labels);
});
