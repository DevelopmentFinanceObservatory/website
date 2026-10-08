import assert from 'node:assert/strict';
import test from 'node:test';

import { posthogConfigured, sendEventToPosthog } from '../events/posthog.ts';

type Captured = { url: string; body: Record<string, unknown> };

// Stands in for the real fetch; records the request and answers with the given status.
const stubFetch = (status: number, captured: Captured[]) => {
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
        captured.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return new Response(status === 204 ? null : '{}', { status });
    }) as typeof fetch;
};

const realFetch = globalThis.fetch;

test.beforeEach(() => {
    process.env.POSTHOG_KEY = 'phc_test';
    process.env.POSTHOG_HOST = 'https://eu.i.posthog.example';
    process.env.ENVIRONMENT = 'staging';
});

test.afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.ENVIRONMENT;
});

test('configured only when both halves are set', () => {
    assert.equal(posthogConfigured(), true);
    delete process.env.POSTHOG_KEY;
    assert.equal(posthogConfigured(), false);
    process.env.POSTHOG_KEY = 'phc_test';
    delete process.env.POSTHOG_HOST;
    assert.equal(posthogConfigured(), false);
});

test('sends the capture payload with the environment stamped', async () => {
    const captured: Captured[] = [];
    stubFetch(200, captured);

    await sendEventToPosthog(
        'search.query',
        { spec_ids: ['a', 'b'], places: 3 },
        { visitorId: 'v-123', userId: 'u-456', page: '/data' },
    );

    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, 'https://eu.i.posthog.example/i/v0/e/');
    const body = captured[0].body;
    assert.equal(body.api_key, 'phc_test');
    assert.equal(body.event, 'search.query');
    assert.equal(body.distinct_id, 'v-123');
    const props = body.properties as Record<string, unknown>;
    assert.equal(props.environment, 'staging');
    assert.equal(props.page, '/data');
    assert.equal(props.signed_in, true);
    assert.deepEqual(props.spec_ids, ['a', 'b']);
    assert.ok(typeof body.timestamp === 'string' && !Number.isNaN(Date.parse(body.timestamp as string)));
});

test('distinct_id falls back from visitor to user to anonymous', async () => {
    const captured: Captured[] = [];
    stubFetch(200, captured);

    await sendEventToPosthog('auth.signin', {}, { userId: 'u-789' });
    await sendEventToPosthog('feedback.submit', {}, {});

    assert.equal(captured[0].body.distinct_id, 'u-789');
    assert.equal((captured[0].body.properties as Record<string, unknown>).signed_in, true);
    assert.equal(captured[1].body.distinct_id, 'anonymous');
    assert.equal((captured[1].body.properties as Record<string, unknown>).signed_in, false);
});

test('a non-ok answer throws so track() can log it', async () => {
    const captured: Captured[] = [];
    stubFetch(500, captured);

    await assert.rejects(
        () => sendEventToPosthog('guest.wall_hit', {}, {}),
        /PostHog answered 500/,
    );
});
