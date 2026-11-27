/**
 * The labelled sentences the evergreen threshold is fitted on, and their
 * replay. scripts/fit-evergreen.mjs packs the scored sentences of
 * labelled.json into groups, one sentence per line of a section text, sends
 * each group exactly as the routes send an artifact's text, and writes
 * recorded.json. ../evergreenReplay.test.ts replays recorded.json through
 * `decide` in CI.
 */

import {
    type Candidate,
    type EvergreenRefusal,
    EXAMPLE_SENTENCES,
    T_HIGH,
    T_KIND,
    type Thresholds,
    candidatesOf,
    decide,
    evergreenRequest,
    requestDigest,
    scoreOf,
} from '../../evergreenRule.ts';

export type Label = 'evergreen' | 'not_evergreen';

export type Labelled = { id: string; text: string; label: Label; kind: string | null };

/** A run of labelled sentences, one per line of `content`, which the fit
 *  sends as one artifact's section text. */
export type Group = {
    ids: string[];
    content: string;
    spans: { id: string; start: number; end: number }[];
};

/** One request's digest and answers, as a recording keeps them. */
export type RecordedRequest = { digest: string; answers: Record<string, unknown> };

/** A group's requests, one per candidate of its content, in order. */
export type RecordedGroup = { ids: string[]; content: string; requests: RecordedRequest[] };

export type Recorded = { model: string; groups: RecordedGroup[] };

/** Labelled sentences per group. It sets only how the fit's text is cut up,
 *  since each sentence goes in a request of its own. */
export const FIT_GROUP_SIZE = 20;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** labelled.json, narrowed. Throws on an entry that is not one. */
export const readLabelled = (raw: unknown): Labelled[] => {
    if (!Array.isArray(raw)) {
        throw new Error('labelled.json is not a list.');
    }

    return raw.map((entry, index) => {
        if (
            !isRecord(entry) ||
            typeof entry.id !== 'string' ||
            typeof entry.text !== 'string' ||
            entry.text.includes('\n') ||
            (entry.label !== 'evergreen' && entry.label !== 'not_evergreen') ||
            (entry.kind !== null && typeof entry.kind !== 'string')
        ) {
            throw new Error(`labelled.json entry ${index} is not { id, text, label, kind }.`);
        }

        return { id: entry.id, text: entry.text, label: entry.label, kind: entry.kind };
    });
};

/** The labelled sentences that are scored. The questions' criteria quote
 *  the rest, so scoring them would test the model on its own examples. */
export const scoredOf = (labelled: readonly Labelled[]): Labelled[] =>
    labelled.filter((item) => !EXAMPLE_SENTENCES.has(item.text));

/** A recording's list of requests, narrowed. Throws when it is not one. */
export const readRequests = (raw: unknown, where: string): RecordedRequest[] => {
    if (!Array.isArray(raw)) {
        throw new Error(`${where} has no requests.`);
    }

    return raw.map((entry) => {
        if (!isRecord(entry) || typeof entry.digest !== 'string' || !isRecord(entry.answers)) {
            throw new Error(`${where} has a request that is not { digest, answers }.`);
        }

        return { digest: entry.digest, answers: entry.answers };
    });
};

/** recorded.json, narrowed. Throws when it is not one. */
export const readRecorded = (raw: unknown): Recorded => {
    if (!isRecord(raw) || typeof raw.model !== 'string' || !Array.isArray(raw.groups)) {
        throw new Error('recorded.json is not { model, groups }.');
    }

    return {
        model: raw.model,
        groups: raw.groups.map((group, index) => {
            if (
                !isRecord(group) ||
                !Array.isArray(group.ids) ||
                !group.ids.every((id) => typeof id === 'string') ||
                typeof group.content !== 'string'
            ) {
                throw new Error(`recorded.json group ${index} is not { ids, content, requests }.`);
            }

            return {
                ids: group.ids as string[],
                content: group.content,
                requests: readRequests(group.requests, `recorded.json group ${index}`),
            };
        }),
    };
};

/** `items` in runs of `FIT_GROUP_SIZE`, in order, each sentence on its own
 *  line. */
export const groupsOf = (items: readonly Labelled[]): Group[] => {
    const groups: Group[] = [];

    for (let at = 0; at < items.length; at += FIT_GROUP_SIZE) {
        const run = items.slice(at, at + FIT_GROUP_SIZE);
        const spans: Group['spans'] = [];
        let offset = 0;

        for (const item of run) {
            spans.push({ id: item.id, start: offset, end: offset + item.text.length });
            offset += item.text.length + 1;
        }

        groups.push({
            ids: run.map((item) => item.id),
            content: run.map((item) => item.text).join('\n'),
            spans,
        });
    }

    return groups;
};

/** The requests the routes would send for `content` as an artifact's
 *  section text, one per candidate, each with its digest. */
export const groupRequests = (content: string) =>
    candidatesOf({ content }).map((candidate: Candidate) => {
        const request = evergreenRequest(candidate);

        return { candidate, request, digest: requestDigest(request) };
    });

const within = (span: { start: number; end: number }, at: { start: number; end: number }) =>
    at.start >= span.start && at.end <= span.end;

/** Each sentence's highest refresh Noul over the candidates inside it, by
 *  id. */
export const sentenceScores = (
    group: Group,
    requests: readonly RecordedRequest[],
): Map<string, number> => {
    const scored = groupRequests(group.content).map(({ candidate }, at) => ({
        candidate,
        noul: scoreOf(requests[at]?.answers ?? {})?.stale ?? Number.NaN,
    }));

    return new Map(
        group.spans.map((span) => [
            span.id,
            Math.max(
                ...scored
                    .filter(({ candidate }) => within(span, candidate))
                    .map(({ noul }) => noul),
            ),
        ]),
    );
};

export type Replay = {
    /** Evergreen sentences a refusal falls on. */
    falseBlocks: string[];
    /** Sentences that are not evergreen and that no refusal falls on. */
    misses: string[];
    /** Refusals outside every sentence, or pointing at another field. */
    stray: EvergreenRefusal[];
    /** Requests `decide` found unanswered. */
    unanswered: number;
};

/** What `decide` at `thresholds` does with every recorded group of the
 *  scored sentences. */
export const replay = (
    labelled: readonly Labelled[],
    recorded: Recorded,
    thresholds: Thresholds = { stale: T_HIGH, kind: T_KIND },
): Replay => {
    const labels = new Map(labelled.map((item) => [item.id, item.label]));
    const result: Replay = { falseBlocks: [], misses: [], stray: [], unanswered: 0 };

    for (const [index, group] of groupsOf(scoredOf(labelled)).entries()) {
        const refusals: EvergreenRefusal[] = [];

        for (const [at, { candidate }] of groupRequests(group.content).entries()) {
            const decision = decide(
                candidate,
                recorded.groups[index]?.requests[at]?.answers ?? {},
                thresholds,
            );

            if (decision.outcome === 'unanswered') {
                result.unanswered += 1;
            } else if (decision.outcome === 'refused') {
                refusals.push(decision.refusal);
            }
        }

        for (const refusal of refusals) {
            if (
                refusal.pointer !== '/content' ||
                !group.spans.some((span) => within(span, refusal))
            ) {
                result.stray.push(refusal);
            }
        }

        for (const span of group.spans) {
            const blocked = refusals.some((refusal) => within(span, refusal));
            const label = labels.get(span.id);

            if (blocked && label === 'evergreen') {
                result.falseBlocks.push(span.id);
            }

            if (!blocked && label === 'not_evergreen') {
                result.misses.push(span.id);
            }
        }
    }

    return result;
};
