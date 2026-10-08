/**
 * The site's side of dfo-ai's `POST /api/studio/refresh`: what each answer
 * the route documents becomes (status, code, wait) and which class of failure
 * each refusal code is, which decides the viewer's message and whether the
 * share dialog withdraws the live link.
 *
 * dfo-ai has no recording file. The answers are the documented JSON, built
 * in `fixtures/live-backend-stub.ts` from the harness's `REFRESH_CODES` table
 * in `services/harness/src/harness/live_refresh.py`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AI_REFRESH_TIMEOUT_MS,
    BackendError,
    liveBackendFrom,
    refreshDerived,
} from '../liveBackend.ts';
import { refreshCard } from '../liveShare.ts';
import { liveCardFailure, liveFailureKind, type LiveFailureKind } from '../liveCards.ts';
import { LEASE_SECONDS, REFRESH_DEADLINE_MS } from '../liveShareResults.ts';
import {
    AI_REFUSALS,
    aiCurrent,
    aiPending,
    aiRedrawn,
    aiRefusal,
    componentRead,
    DERIVED_FRAME,
    ENV,
    json,
    REPLAYED_FRAME,
    renderReply,
    stubBackend,
    type StubScript,
} from './fixtures/live-backend-stub.ts';

const REF = { component_id: 'cmp_derived', revision: 2 };

const over = (refreshDerivedAnswer: NonNullable<StubScript['refreshDerived']>) => {
    const stub = stubBackend({
        components: { cmp_derived: DERIVED_FRAME },
        refreshDerived: refreshDerivedAnswer,
    });

    return liveBackendFrom(ENV, stub.fetch)!;
};

test('current: the stored revision’s own read, with nothing drawn', async () => {
    const stored = componentRead('cmp_derived', 2, DERIVED_FRAME);

    assert.deepEqual(await refreshCard(over(aiCurrent), REF), {
        status: 'current',
        card: {
            component_id: 'cmp_derived',
            revision: 2,
            payload: stored['resolved_payload'],
            fact_summary: stored['fact_summary'],
        },
    });
});

test('pending: a fractional wait is kept by the client and held as whole seconds', async () => {
    const waits = [1.0, 1.5, 2.0, 2.5, 5.0];

    assert.deepEqual(
        await refreshDerived(
            over(() => aiPending(1.5)),
            REF,
        ),
        {
            status: 'pending',
            retryAfterS: 1.5,
        },
    );
    assert.deepEqual(
        await Promise.all(
            waits.map((wait) =>
                refreshCard(
                    over(() => aiPending(wait)),
                    REF,
                ),
            ),
        ),
        [2, 2, 2, 3, 5].map((retryAfterS) => ({ status: 'pending', retryAfterS })),
    );
});

test('redrawn: the card and the frame its dfo-apis read names', async () => {
    const render = renderReply('cmp_derived', 2, REPLAYED_FRAME);
    const result = await refreshCard(
        over(() => aiRedrawn(render)),
        REF,
    );

    assert.deepEqual(result, {
        status: 'redrawn',
        frame: REPLAYED_FRAME,
        card: {
            component_id: 'cmp_derived',
            revision: 2,
            payload: render['resolved_payload'],
            fact_summary: render['fact_summary'],
        },
    });
    // The stored frame is the render's `stored_intent`, and is not the one drawn.
    assert.deepEqual(render['stored_intent'].frame_ref, DERIVED_FRAME);
});

// The class each documented code belongs to, by what the route says of it:
// a retry can succeed (`transient`), the site or its credential is not set
// up (`switched_off`), or the card itself cannot be redrawn (`permanent`).
const CLASS_OF: Record<keyof typeof AI_REFUSALS, LiveFailureKind> = {
    unauthorized: 'switched_off',
    request_invalid: 'permanent',
    component_not_found: 'permanent',
    frame_unsupported: 'permanent',
    dataset_frame: 'permanent',
    recipe_missing: 'permanent',
    recipe_invalid: 'permanent',
    dfo_apis_refused: 'permanent',
    upstream_unavailable: 'transient',
    refresh_not_configured: 'switched_off',
};

test('each documented refusal is its code, its status, and its class', async () => {
    for (const [code, { status, retry }] of Object.entries(AI_REFUSALS)) {
        const backend = over((call) => aiRefusal(code, call));
        const failure = await refreshDerived(backend, REF).catch((error) => error);

        assert.ok(failure instanceof BackendError, code);
        assert.equal(failure.code, code);
        assert.equal(failure.status, status, code);
        assert.deepEqual(await refreshCard(backend, REF), { status: 'error', code }, code);

        const kind = liveFailureKind({ code });

        assert.equal(kind, CLASS_OF[code as keyof typeof CLASS_OF], code);
        // A retry can succeed exactly for the transient class, and only a
        // transient failure leaves the live link standing.
        assert.equal(kind === 'transient', retry, code);
        assert.equal(liveCardFailure({ code }).retry, retry, code);
    }
});

test('a code passed through from dfo-apis or the replayer under 422 is permanent', async () => {
    const passedThrough = [
        'rendering_not_recorded',
        'spec_not_found',
        'snapshot_not_found',
        'over_ceiling',
        'publish_not_permitted',
        'render_target_mismatch',
        'binding_invalid',
        'release_mismatch',
        'recipe_normal_form_changed',
        'root_rendering_ambiguous',
        'root_dataset_changed',
        'recipe_unbuildable',
        'growth_gap_year',
        'publish_not_configured',
        'a_code_no_table_names',
    ];

    for (const code of passedThrough) {
        const backend = over((call) => aiRefusal(code, call));

        assert.deepEqual(await refreshCard(backend, REF), { status: 'error', code }, code);
        assert.equal(liveFailureKind({ code }), 'permanent', code);
        assert.equal(liveCardFailure({ code }).retry, false, code);
    }
});

test('an unexpected fault of dfo-ai, a plain 500 with no code, is transient', async () => {
    const backend = over(() => json({ detail: 'Internal Server Error' }, 500));

    assert.deepEqual(await refreshCard(backend, REF), { status: 'error', code: 'backend_refused' });
    assert.equal(liveFailureKind({ code: 'backend_refused' }), 'transient');
});

test('the call to dfo-ai waits past its hard stop, inside the refresh deadline and the lease', () => {
    // dfo-ai's replay deadline is 45 seconds and its hard stop 53, after
    // which it answers `pending`.
    const hardStopMs = 53_000;

    assert.ok(AI_REFRESH_TIMEOUT_MS > hardStopMs);
    assert.ok(REFRESH_DEADLINE_MS > AI_REFRESH_TIMEOUT_MS);
    assert.ok(LEASE_SECONDS * 1000 > REFRESH_DEADLINE_MS);
});

test('the call to dfo-ai ends when the refresh deadline does', async () => {
    let sent: AbortSignal | null | undefined;
    const backend = {
        ...liveBackendFrom(ENV, async (_input, init) => {
            sent = init?.signal;

            return aiCurrent();
        })!,
        signal: AbortSignal.abort(),
    };

    await refreshDerived(backend, REF).catch(() => undefined);

    assert.equal(sent?.aborted, true);
});
