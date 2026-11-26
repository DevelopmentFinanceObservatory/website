/**
 * The dialogs' calls to /api/library. Each answers with its value, or with
 * the sentence to show: the problem document's `detail` when the route sent
 * one, else `fallback`.
 */

import type { ArtifactText, PublishInput } from './publish.ts';

export type Answer<T> = { ok: true; value: T } | { ok: false; detail: string };

const call = async <T>(
    path: string,
    init: RequestInit | undefined,
    fallback: string,
): Promise<Answer<T>> => {
    try {
        const response = await fetch(path, {
            cache: 'no-store',
            ...init,
            headers: init?.body ? { 'content-type': 'application/json' } : undefined,
        });
        const body: unknown = response.status === 204 ? null : await response.json();

        if (response.ok) {
            return { ok: true, value: body as T };
        }

        const detail =
            typeof body === 'object' && body !== null && 'detail' in body ? body.detail : null;

        return { ok: false, detail: typeof detail === 'string' ? detail : fallback };
    } catch {
        return { ok: false, detail: fallback };
    }
};

const send = (method: string, body: unknown): RequestInit => ({
    method,
    body: JSON.stringify(body),
});

export const loadTopics = () =>
    call<{ topics: string[] }>('/api/library/topics', undefined, 'The topics did not load.');

export const addTopic = (label: string) =>
    call<{ topics: string[] }>(
        '/api/library/topics',
        send('POST', { label }),
        'The topic was not added. Try again.',
    );

export const publishArtifact = (input: PublishInput) =>
    call<{ slug: string }>(
        '/api/library/artifacts',
        send('POST', input),
        'It was not published. Try again.',
    );

export const editArtifact = (id: string, text: ArtifactText) =>
    call<{ slug: string }>(
        `/api/library/artifacts/${encodeURIComponent(id)}`,
        send('PATCH', text),
        'The changes were not saved. Try again.',
    );

export const deleteArtifact = (id: string) =>
    call<null>(
        `/api/library/artifacts/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        'It was not deleted. Try again.',
    );
