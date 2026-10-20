/**
 * Registers definitions with the Datasets API, one `POST /api/datasets/register`
 * call per definition. The door takes a single definition and answers its
 * canonical `{definition}`; the share flow already holds each part's spec id,
 * so the answer is not read.
 *
 * Like `snapshot.ts`, this module has no database or path-alias dependency, so
 * `node --test` imports it directly.
 */

import type { ProblemDetails } from '@developmentfinance/client/wire';

import { apisFetch } from '../apisAuth.ts';

const REGISTER_TIMEOUT_MS = 20_000;

type RegisterOptions = {
    base: string;
    definitions: unknown[];
    fetchImpl?: typeof fetch;
};

/**
 * Registers each definition in turn: the door's write capacity is a few
 * slots, and a share holds at most six parts, so parallel calls could trip
 * its retryable 503 where sequential ones do not. Throws on the first
 * refusal, with the platform's code as the message.
 */
export const registerDefinitions = async ({
    base,
    definitions,
    fetchImpl = apisFetch,
}: RegisterOptions): Promise<void> => {
    for (const definition of definitions) {
        const res = await fetchImpl(`${base}/api/datasets/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ schema_version: 1, definition }),
            cache: 'no-store',
            signal: AbortSignal.timeout(REGISTER_TIMEOUT_MS),
        });

        if (!res.ok) {
            const body: Partial<ProblemDetails> | null = await res.json().catch(() => null);

            throw new Error(body?.code ?? `register ${res.status}`);
        }

        // The answer is not read; cancel it so the connection and its buffered body are freed.
        await res.body?.cancel();
    }
};
