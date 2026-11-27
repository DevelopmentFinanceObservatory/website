/**
 * The dialogs' calls to /api/library. Each answers with its value, or with
 * the sentence to show: the problem document's `detail` when the route sent
 * one, else `fallback`. A refusal also carries the response body, which
 * `publishRefusalText` reads for a publish.
 */

import type { ArtifactText, PublishInput } from './publish.ts';
import { readShareAnswer, type SharedCard, withdrawalText } from '../studio/shareDialog.ts';

export type Answer<T> = { ok: true; value: T } | { ok: false; detail: string; problem: unknown };

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

        return {
            ok: false,
            detail: typeof detail === 'string' ? detail : fallback,
            problem: body,
        };
    } catch {
        return { ok: false, detail: fallback, problem: null };
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

const AS_SNAPSHOT = 'Publish it as a snapshot.';

/**
 * The sentence a publish refusal shows. The share refusals read as the
 * Share dialog words them (`withdrawalText`), with the way out a publisher
 * has: a live share over the card cap or with cards that cannot show live
 * data can go as a snapshot. `cards` is the data cards the publish shows,
 * which name the blocked ones, and `single` is a publish of one card. Any
 * other refusal shows `detail`.
 */
export const publishRefusalText = (
    problem: unknown,
    detail: string,
    cards: readonly SharedCard[],
    single: boolean,
): string => {
    const answer = readShareAnswer(false, problem);
    const refusal = 'refusal' in answer ? answer.refusal : null;

    switch (refusal?.code) {
        case 'live_too_many_cards':
            return `${withdrawalText({ reason: 'limit', limit: refusal.limit, count: refusal.count }, single)} ${AS_SNAPSHOT}`;
        case 'live_cards_blocked': {
            const blocked = cards.filter((card) => refusal.cardIds.includes(card.id));

            return `${withdrawalText({ reason: 'cards', cards: blocked }, single)} ${AS_SNAPSHOT}`;
        }
        case 'share_limit':
            return "This network has made today's links. Try again tomorrow.";
        case 'payload_too_large':
        case 'share_refused':
            return 'This cannot be published as it stands.';
        default:
            return detail;
    }
};

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
