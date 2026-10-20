import assert from 'node:assert/strict';
import test from 'node:test';

import { operationButtonLabel } from '../operations.ts';
import { normalizeResponse } from '../searchClient.ts';
import type { Part } from '../types.ts';
import { fixtures } from './fixtures/index.ts';

test('operationButtonLabel names each verb', () => {
    assert.deepEqual(
        (['rank', 'aggregate', 'growth', 'share_of', 'explain', 'forecast', 'report'] as const).map(
            operationButtonLabel,
        ),
        [
            'Rank in Studio',
            'Add up in Studio',
            'Work out the change in Studio',
            'Work out the share in Studio',
            'Ask Studio why',
            'Ask Studio for a forecast',
            'Ask Studio for a report',
        ],
    );
    assert.equal(operationButtonLabel('tally'), 'Open in Studio');
});

test("the rank fixture's operation names its Studio button", () => {
    const [part]: Part[] = normalizeResponse(fixtures['definite-rank-operation']).parts;

    assert.equal(part.status, 'definite');
    assert.equal(operationButtonLabel(part.operations[0].verb), 'Rank in Studio');
});
