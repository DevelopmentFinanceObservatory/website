/**
 * The dialogs' calls to /api/library. Each answers with its value, or with
 * the sentence to show: the problem document's `detail` when the route sent
 * one, else `fallback`. A refusal also carries the response body, which
 * `publishRefusalText` reads for a publish.
 */

import { asRecord } from '../asRecord.ts';
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
    call<{ slug: string; title: string }>(
        '/api/library/artifacts',
        send('POST', input),
        'It was not published. Try again.',
    );

/** Whether a publish answered that the artifact its key made was withdrawn. */
export const isWithdrawnRefusal = (problem: unknown): boolean =>
    asRecord(problem)?.['code'] === 'artifact_withdrawn';

/** Whether a publish answered that another artifact holds the chosen slug. */
export const isSlugTakenRefusal = (problem: unknown): boolean =>
    asRecord(problem)?.['code'] === 'slug_taken';

export type EvergreenField = 'title' | 'description' | 'contentTitle' | 'content';

/** One sentence the evergreen check refused. `start` and `end` index the
 *  field as the server stores it, after `readArtifactText`. */
export type EvergreenError = {
    field: EvergreenField;
    start: number;
    end: number;
    quote: string;
    kind: string;
    reason: string;
};

/** What an evergreen refusal or failure of the check answered: the refused
 *  sentences with the fix line, a retryable failure of the check, or a
 *  refusal of the text by the check that a retry would not mend. */
export type EvergreenAnswer =
    | {
          code: 'not_evergreen';
          fix: string;
          errors: EvergreenError[];
          warnings: EvergreenWarning[];
      }
    | { code: 'evergreen_too_long'; field: EvergreenField; detail: string }
    | { code: 'evergreen_check_unavailable' }
    | { code: 'evergreen_check_refused' };

const EVERGREEN_FIELDS: readonly EvergreenField[] = [
    'title',
    'description',
    'contentTitle',
    'content',
];

// The field a pointer such as `/content` names, when it is one of the four.
const fieldOf = (pointer: unknown): EvergreenField | null => {
    const name = typeof pointer === 'string' ? pointer.replace(/^\//, '') : null;

    return EVERGREEN_FIELDS.find((field) => field === name) ?? null;
};

/** A sentence in the check's middle band: the text was accepted, and the
 *  sentence may state something a data update can change. */
export type EvergreenWarning = {
    field: EvergreenField;
    start: number;
    end: number;
    quote: string;
    kind: string;
};

/** The sentences a successful publish or edit flagged, from its response
 *  body. Entries that do not read as a sentence of a known field are dropped. */
export const readEvergreenWarnings = (body: unknown): EvergreenWarning[] => {
    const entries: unknown = asRecord(body)?.['warnings'];

    return Array.isArray(entries)
        ? entries.flatMap((entry: unknown): EvergreenWarning[] => {
              const record = asRecord(entry);
              const field = fieldOf(record?.['pointer']);
              const { start, end, quote, kind } = record ?? {};

              return field !== null &&
                  typeof start === 'number' &&
                  typeof end === 'number' &&
                  typeof quote === 'string' &&
                  typeof kind === 'string'
                  ? [{ field, start, end, quote, kind }]
                  : [];
          })
        : [];
};

const readEvergreenError = (entry: unknown): EvergreenError | null => {
    const record = asRecord(entry);
    const field = fieldOf(record?.['pointer']);
    const { start, end, quote, kind, reason } = record ?? {};

    if (
        field === null ||
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        typeof quote !== 'string' ||
        typeof kind !== 'string' ||
        typeof reason !== 'string'
    ) {
        return null;
    }

    return { field, start, end, quote, kind, reason };
};

/**
 * The evergreen answer in a refused publish or edit, or null for any other
 * refusal. Entries of `errors` that do not read as a sentence of a known
 * field are dropped, and a `not_evergreen` left with none reads as null so
 * the caller shows `detail`. A `not_evergreen` also carries the sentences it
 * flagged without refusing.
 */
export const readEvergreenAnswer = (problem: unknown): EvergreenAnswer | null => {
    const body = asRecord(problem);

    switch (body?.['code']) {
        case 'evergreen_too_long': {
            // Read from the pointer and `detail` alone, so the limit's own
            // fields are not needed.
            const field = fieldOf(body['pointer']);
            const detail = body['detail'];

            return field && typeof detail === 'string'
                ? { code: 'evergreen_too_long', field, detail }
                : null;
        }
        case 'evergreen_check_unavailable':
            return { code: 'evergreen_check_unavailable' };
        case 'evergreen_check_refused':
            return { code: 'evergreen_check_refused' };
        case 'not_evergreen': {
            const entries: unknown = body['errors'];
            const errors = Array.isArray(entries)
                ? entries.flatMap((entry: unknown) => readEvergreenError(entry) ?? [])
                : [];
            const fix = body['detail'];

            return errors.length > 0 && typeof fix === 'string'
                ? { code: 'not_evergreen', fix, errors, warnings: readEvergreenWarnings(body) }
                : null;
        }
        default:
            return null;
    }
};

/** Whether `field` holds in `current` what it held in `submitted`. A
 *  refusal belongs to the value that was sent, so it applies to this field
 *  only while the two match. */
export const sameField = (
    submitted: ArtifactText,
    current: ArtifactText,
    field: EvergreenField,
): boolean => (submitted[field] ?? '') === (current[field] ?? '');

/** Whether an edit answered that the artifact changed since it was read. */
export const isArtifactChangedRefusal = (problem: unknown): boolean =>
    asRecord(problem)?.['code'] === 'artifact_changed';

/** The sentence a failure of the check shows, or null for a refusal of
 *  sentences, which show under their fields. */
export const evergreenFailureText = (answer: EvergreenAnswer): string | null => {
    switch (answer.code) {
        case 'evergreen_check_unavailable':
            return 'The text check is not available right now. Try again in a few seconds.';
        case 'evergreen_check_refused':
            return 'The check refused this text. Shorten or simplify it, then try again.';
        default:
            return null;
    }
};

const AS_SNAPSHOT = 'Publish it as a snapshot.';

/**
 * The sentence a publish refusal shows. The share refusals read as the
 * Share dialog words them (`withdrawalText`), with the way out a publisher
 * has. A publish whose key made an artifact since withdrawn reads as a
 * withdrawn one, and one whose chosen slug another artifact holds asks for
 * another. A live share over the card cap or with cards that cannot show live
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
    if (isWithdrawnRefusal(problem)) {
        return 'This was published and then withdrawn. Publish it again to make a new page.';
    }

    if (isSlugTakenRefusal(problem)) {
        return 'Another artifact uses this URL. Choose a different one.';
    }

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

/** Changes the text and topics, as of the `revision` they were loaded at. */
export const editArtifact = (id: string, text: ArtifactText, revision: number) =>
    call<{ slug: string }>(
        `/api/library/artifacts/${encodeURIComponent(id)}`,
        send('PATCH', { ...text, revision }),
        'The changes were not saved. Try again.',
    );

/** The slug of an artifact a withdrawal took down without the replacement
 *  it named, which was withdrawn meanwhile, or null for any other answer. */
export const withdrawnWithoutReplacement = (problem: unknown): string | null => {
    const record = asRecord(problem);
    const slug = record?.['slug'];

    return record?.['code'] === 'withdrawn_without_replacement' && typeof slug === 'string'
        ? slug
        : null;
};

/** Withdraws the artifact, its address then linking to `replacedBy` when
 *  one is named. */
export const deleteArtifact = (id: string, replacedBy: string | null = null) =>
    call<null>(
        `/api/library/artifacts/${encodeURIComponent(id)}`,
        replacedBy ? send('DELETE', { replacedBy }) : { method: 'DELETE' },
        'It was not deleted. Try again.',
    );

/** Points a withdrawn artifact's address at `replacedBy`, or at nothing. */
export const replaceArtifact = (id: string, replacedBy: string | null) =>
    call<{ slug: string }>(
        `/api/library/artifacts/${encodeURIComponent(id)}/replacement`,
        send('PUT', { replacedBy }),
        'The replacement was not saved. Try again.',
    );
