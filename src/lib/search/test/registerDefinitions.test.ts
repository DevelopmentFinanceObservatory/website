import assert from 'node:assert/strict';
import test from 'node:test';

import { registerDefinitions } from '../registerDefinitions.ts';

type Call = { url: string; body: unknown };

const registerApi = (statusFor: (call: number) => number) => {
    const calls: Call[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        const status = statusFor(calls.length);

        return {
            ok: status < 300,
            status,
            json: async () => (status < 300 ? {} : { code: 'spec_id_mismatch' }),
        } as Response;
    }) as typeof fetch;

    return { calls, fetchImpl };
};

const definitions = [{ spec_id: 'spec_a' }, { spec_id: 'spec_b' }, { spec_id: 'spec_c' }];

test('registerDefinitions posts one definition per call and never a members list', async () => {
    const { calls, fetchImpl } = registerApi(() => 200);

    await registerDefinitions({ base: 'https://api', definitions, fetchImpl });

    assert.deepEqual(
        calls.map((call) => call.url),
        Array(3).fill('https://api/api/datasets/register'),
    );
    assert.deepEqual(
        calls.map((call) => call.body),
        definitions.map((definition) => ({ schema_version: 1, definition })),
    );
});

test('registerDefinitions stops at the first refusal and throws the platform code', async () => {
    const { calls, fetchImpl } = registerApi((call) => (call === 2 ? 422 : 200));

    await assert.rejects(
        registerDefinitions({ base: 'https://api', definitions, fetchImpl }),
        { message: 'spec_id_mismatch' },
    );
    assert.equal(calls.length, 2);
});

const bodyReleasingApi = (statusFor: (call: number) => number, payload: string) => {
    const responses: Response[] = [];
    const releasedAtNextCall: boolean[] = [];
    const fetchImpl = (async () => {
        releasedAtNextCall.push(responses.every((res) => res.bodyUsed));
        const status = statusFor(responses.length + 1);
        const res = new Response(payload, { status });

        responses.push(res);

        return res;
    }) as typeof fetch;

    return { responses, releasedAtNextCall, fetchImpl };
};

test('registerDefinitions releases every successful response body before the next call', async () => {
    const { responses, releasedAtNextCall, fetchImpl } = bodyReleasingApi(
        () => 200,
        JSON.stringify({ definition: { spec_id: 'spec_a' } }),
    );

    await registerDefinitions({ base: 'https://api', definitions, fetchImpl });

    assert.equal(responses.length, 3);
    assert.deepEqual(releasedAtNextCall, [true, true, true]);
    assert.ok(responses.every((res) => res.bodyUsed));
});

test('registerDefinitions releases a refusal body that does not parse', async () => {
    const { responses, fetchImpl } = bodyReleasingApi(() => 502, '<html>bad gateway</html>');

    await assert.rejects(registerDefinitions({ base: 'https://api', definitions, fetchImpl }), {
        message: 'register 502',
    });
    assert.ok(responses[0]?.bodyUsed);
});
