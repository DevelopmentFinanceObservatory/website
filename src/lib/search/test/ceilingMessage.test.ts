import assert from 'node:assert/strict';
import test from 'node:test';

import { measuredMessage } from '../ceilingMessage.ts';
import type { ApiError } from '../searchClient.ts';

/** A thrown refusal shaped the way `apiError` builds one: an Error carrying
 *  the body's own `code` and the two numbers. */
function refusal(fields: Partial<ApiError>): ApiError {
    return Object.assign(new Error('refused'), fields) as ApiError;
}

test('candidate_window states the limit without a number', () => {
    const message = measuredMessage(
        refusal({ code: 'over_ceiling', ceilingKind: 'candidate_window', count: 4000, cap: 4000 }),
    );

    assert.equal(
        message,
        'This selection matches more variables than one export can list. Pick a specific measure and try again.',
    );
    assert.ok(!message?.includes('narrow'));
});

test('candidate_window gives the same message when the read listed fewer candidates than the window', () => {
    const message = measuredMessage(
        refusal({ code: 'over_ceiling', ceilingKind: 'candidate_window', count: 37, cap: 4000 }),
    );

    assert.equal(
        message,
        'This selection matches more variables than one export can list. Pick a specific measure and try again.',
    );
});

test('rows keeps the size wording, naming the result and the limit in rows', () => {
    const message = measuredMessage(
        refusal({ code: 'over_ceiling', ceilingKind: 'rows', count: 1200000, cap: 1000000 }),
    );

    assert.equal(
        message,
        'This result is 1,200,000 rows, over the 1,000,000 rows export limit — narrow it (a place, a shorter window, a more specific measure) and try again.',
    );
});

test('member_cardinality keeps the size wording, naming the result and the limit in series', () => {
    const message = measuredMessage(
        refusal({ code: 'over_ceiling', ceilingKind: 'member_cardinality', count: 500, cap: 100 }),
    );

    assert.equal(
        message,
        'This result is 500 series, over the 100 series export limit — narrow it (a place, a shorter window, a more specific measure) and try again.',
    );
});

test('bytes keeps the size wording, converting both numbers to MB', () => {
    const message = measuredMessage(
        refusal({ code: 'over_ceiling', ceilingKind: 'bytes', count: 52428800, cap: 10485760 }),
    );

    assert.equal(
        message,
        'This result is 50.0 MB, over the 10.0 MB export limit — narrow it (a place, a shorter window, a more specific measure) and try again.',
    );
});

test('an unknown ceiling kind falls back to a plain count, with no noun', () => {
    const message = measuredMessage(
        refusal({ code: 'over_ceiling', ceilingKind: 'something_new', count: 5, cap: 3 }),
    );

    assert.equal(
        message,
        'This result is 5, over the 3 export limit — narrow it (a place, a shorter window, a more specific measure) and try again.',
    );
});

test('a ceiling kind the engine omitted falls back the same way as an unknown one', () => {
    const message = measuredMessage(refusal({ code: 'over_ceiling', count: 5, cap: 3 }));

    assert.equal(
        message,
        'This result is 5, over the 3 export limit — narrow it (a place, a shorter window, a more specific measure) and try again.',
    );
});

test('an over_ceiling refusal without a count has no measured message', () => {
    assert.equal(
        measuredMessage(refusal({ code: 'over_ceiling', ceilingKind: 'rows', cap: 1000000 })),
        null,
    );
    assert.equal(
        measuredMessage(
            refusal({ code: 'over_ceiling', ceilingKind: 'rows', count: null, cap: 10 }),
        ),
        null,
    );
});

test('a refusal with a different code has no measured message', () => {
    assert.equal(
        measuredMessage(
            refusal({ code: 'spec_not_exportable', ceilingKind: 'rows', count: 5, cap: 3 }),
        ),
        null,
    );
    assert.equal(measuredMessage(refusal({})), null);
});
