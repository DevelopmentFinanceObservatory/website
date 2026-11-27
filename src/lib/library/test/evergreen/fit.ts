/**
 * The labelled sentences the evergreen thresholds are fitted on, and their
 * replay. scripts/fit-evergreen.mjs packs labelled.json into groups, asks
 * Jev about each group as the routes would ask about an artifact's section
 * text, and writes recorded.json. ../evergreenReplay.test.ts replays
 * recorded.json through `decide` in CI.
 */

import {
    type Candidate,
    type EvergreenRefusal,
    T_HIGH,
    batchesOf,
    candidatesOf,
    decide,
    evergreenRequest,
    noulOf,
    requestDigest,
    volatileId,
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

export type RecordedGroup = {
    ids: string[];
    content: string;
    digest: string;
    answers: Record<string, unknown>;
};

export type Recorded = { model: string; groups: RecordedGroup[] };

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
                typeof group.content !== 'string' ||
                typeof group.digest !== 'string' ||
                !isRecord(group.answers)
            ) {
                throw new Error(
                    `recorded.json group ${index} is not { ids, content, digest, answers }.`,
                );
            }

            return {
                ids: group.ids as string[],
                content: group.content,
                digest: group.digest,
                answers: group.answers,
            };
        }),
    };
};

/** `items` in runs of `GROUP_SIZE`, in order, each sentence on its own line. */
export const groupsOf = (items: readonly Labelled[]): Group[] =>
    batchesOf(items).map((run) => {
        const spans: Group['spans'] = [];
        let offset = 0;

        for (const item of run) {
            spans.push({ id: item.id, start: offset, end: offset + item.text.length });
            offset += item.text.length + 1;
        }

        return {
            ids: run.map((item) => item.id),
            content: run.map((item) => item.text).join('\n'),
            spans,
        };
    });

/** The candidates and the request digest the routes would send for
 *  `content` as an artifact's section text. */
export const groupRequest = (content: string): { candidates: Candidate[]; digest: string } => {
    const candidates = candidatesOf({ content });

    return { candidates, digest: requestDigest(evergreenRequest(candidates)) };
};

const within = (span: { start: number; end: number }, at: { start: number; end: number }) =>
    at.start >= span.start && at.end <= span.end;

/** Each sentence's highest Noul over the candidates inside it, by id. */
export const sentenceScores = (
    group: Group,
    answers: Record<string, unknown>,
): Map<string, number> => {
    const { candidates } = groupRequest(group.content);
    const scores = new Map<string, number>();

    for (const span of group.spans) {
        const nouls = candidates.flatMap((candidate, index) =>
            within(span, candidate) ? [noulOf(answers[volatileId(index)]) ?? Number.NaN] : [],
        );

        scores.set(span.id, Math.max(...nouls));
    }

    return scores;
};

export type Replay = {
    /** Evergreen sentences a refusal falls on. */
    falseBlocks: string[];
    /** Sentences that are not evergreen and that no refusal falls on. */
    misses: string[];
    /** Refusals outside every sentence, or pointing at another field. */
    stray: EvergreenRefusal[];
    /** Groups `decide` found unanswered. */
    unanswered: number;
};

/** What `decide` at `tHigh` does with every recorded group. */
export const replay = (
    labelled: readonly Labelled[],
    recorded: Recorded,
    tHigh: number = T_HIGH,
): Replay => {
    const labels = new Map(labelled.map((item) => [item.id, item.label]));
    const result: Replay = { falseBlocks: [], misses: [], stray: [], unanswered: 0 };

    for (const [index, group] of groupsOf(labelled).entries()) {
        const { candidates } = groupRequest(group.content);
        const decision = decide(candidates, recorded.groups[index]?.answers ?? {}, tHigh);

        if (!decision.answered) {
            result.unanswered += 1;
            continue;
        }

        for (const refusal of decision.refusals) {
            if (
                refusal.pointer !== '/content' ||
                !group.spans.some((span) => within(span, refusal))
            ) {
                result.stray.push(refusal);
            }
        }

        for (const span of group.spans) {
            const blocked = decision.refusals.some((refusal) => within(span, refusal));
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
