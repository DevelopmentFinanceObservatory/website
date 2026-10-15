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
    process.env.ENVIRONMENT = 'dev';
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
        { visitorId: 'v-123', userId: 'u-456', page: '/data', headers: null },
    );

    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, 'https://eu.i.posthog.example/i/v0/e/');
    const body = captured[0].body;
    assert.equal(body.api_key, 'phc_test');
    assert.equal(body.event, 'search.query');
    assert.equal(body.distinct_id, 'v-123');
    const props = body.properties as Record<string, unknown>;
    assert.equal(props.environment, 'dev');
    assert.equal(props.page, '/data');
    assert.equal(props.signed_in, true);
    assert.deepEqual(props.spec_ids, ['a', 'b']);
    assert.ok(
        typeof body.timestamp === 'string' && !Number.isNaN(Date.parse(body.timestamp as string)),
    );
});

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/131.0';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// A browser request as it arrives through Cloudflare and the load balancer.
const browserHeaders = (country = 'GB') =>
    new Headers({
        'user-agent': UA,
        'x-forwarded-for': '203.0.113.9, 34.1.1.1, 35.2.2.2',
        'cf-ipcountry': country,
    });

const visitors = [
    { kind: 'consented', who: { visitorId: 'v-123' }, distinctId: 'v-123', personless: false },
    {
        kind: 'signed in without consent',
        who: { userId: 'u-789' },
        distinctId: 'u-789',
        personless: false,
    },
    { kind: 'anonymous', who: {}, distinctId: UUID, personless: true },
] as const;

for (const visitor of visitors) {
    test(`the ${visitor.kind} visitor's payload`, async () => {
        const captured: Captured[] = [];
        stubFetch(200, captured);

        // A browser cannot set PostHog's own properties through event props.
        const props = { $ip: '192.0.2.1', $process_person_profile: true, kind: 'chat' };
        await sendEventToPosthog('feedback.submit', props, {
            ...visitor.who,
            headers: browserHeaders(),
        });
        await sendEventToPosthog('feedback.submit', props, {
            ...visitor.who,
            headers: browserHeaders(),
        });

        const [first, second] = captured.map((call) => call.body);
        const properties = first.properties as Record<string, unknown>;

        if (typeof visitor.distinctId === 'string') {
            assert.equal(first.distinct_id, visitor.distinctId);
            assert.equal(second.distinct_id, visitor.distinctId);
        } else {
            assert.match(String(first.distinct_id), visitor.distinctId);
            assert.match(String(second.distinct_id), visitor.distinctId);
            assert.notEqual(first.distinct_id, second.distinct_id);
        }

        assert.equal(properties.$raw_user_agent, UA);
        assert.equal(properties.country, 'GB');
        assert.equal(properties.$ip, undefined);
        assert.equal(properties.$geoip_disable, true);
        assert.equal(properties.$process_person_profile, visitor.personless ? false : undefined);
        assert.equal(properties.kind, 'chat');
    });
}

test('an event with no browser request carries no user agent or country', async () => {
    const captured: Captured[] = [];
    stubFetch(200, captured);

    await sendEventToPosthog('embed.view', {}, { visitorId: 'v-123', headers: null });

    const properties = captured[0].body.properties as Record<string, unknown>;
    assert.equal(properties.$raw_user_agent, undefined);
    assert.equal(properties.country, null);
    assert.equal(properties.$geoip_disable, true);
});

for (const [header, country] of [
    ['us', 'US'],
    ['XX', null],
    ['T1', null],
] as const) {
    test(`CF-IPCountry ${header} gives country ${country}`, async () => {
        const captured: Captured[] = [];
        stubFetch(200, captured);

        await sendEventToPosthog('embed.view', {}, { headers: browserHeaders(header) });

        const properties = captured[0].body.properties as Record<string, unknown>;
        assert.equal(properties.country, country);
    });
}

test('a non-ok answer throws so track() can log it', async () => {
    const captured: Captured[] = [];
    stubFetch(500, captured);

    await assert.rejects(
        () => sendEventToPosthog('guest.wall_hit', {}, { headers: null }),
        /PostHog answered 500/,
    );
});
