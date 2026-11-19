import type { ApiKeysData, KeyIssued, KeyRemoved } from './state';

/**
 * The account panel's calls to /api/account/api-keys. Each answers with its
 * result or `{ error }`, the message to show: a refusal's `detail`, or the
 * call's own fallback when the network fails or the answer is not one.
 */

const BASE = '/api/account/api-keys';

const SAME_ORIGIN = { cache: 'no-store', credentials: 'same-origin' } as const;

type Reply = { ok: boolean; body: unknown };

const send = async (url: string, init: RequestInit = {}): Promise<Reply | null> => {
    try {
        const response = await fetch(url, {
            ...SAME_ORIGIN,
            ...init,
            headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
        });
        const body: unknown = await response.json().catch(() => null);

        return { ok: response.ok, body };
    } catch {
        return null;
    }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

// The message of a refusal (a problem document), else the fallback.
const refusal = (reply: Reply | null, fallback: string): string =>
    reply && isRecord(reply.body) && typeof reply.body.detail === 'string'
        ? reply.body.detail
        : fallback;

/** The signed-in user's keys. */
export const listKeys = async (): Promise<ApiKeysData | { error: string }> => {
    const reply = await send(BASE);

    // The route answers with `ApiKeysData`, so the parsed body is that shape.
    return reply?.ok && isRecord(reply.body)
        ? (reply.body as ApiKeysData)
        : { error: refusal(reply, 'Your keys could not be loaded. Try again.') };
};

const issued = (reply: Reply | null, fallback: string): KeyIssued =>
    reply?.ok && isRecord(reply.body) && typeof reply.body.key === 'string'
        ? { key: reply.body.key }
        : { error: refusal(reply, fallback) };

/** Makes a key named `label`. */
export const createKey = async (label: string): Promise<KeyIssued> =>
    issued(
        await send(BASE, { method: 'POST', body: JSON.stringify({ label }) }),
        'The key was not created. Try again.',
    );

/** Deletes a key. */
export const deleteKey = async (keyId: string): Promise<KeyRemoved> => {
    const reply = await send(`${BASE}/${encodeURIComponent(keyId)}`, { method: 'DELETE' });

    return { error: reply?.ok ? null : refusal(reply, 'The key was not deleted. Try again.') };
};
