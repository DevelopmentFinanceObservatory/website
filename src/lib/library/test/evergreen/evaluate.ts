/**
 * The evaluation set of complete artifacts, apart from the sentences the
 * thresholds are fitted on (./fit.ts). eval-candidates.json holds each
 * artifact's title, description, section heading and section text.
 * eval-labelled.json holds each artifact's sentences, split as the routes
 * split them, each labelled evergreen or not. `node scripts/fit-evergreen.mjs
 * --eval` sends every artifact exactly as the publish route does and writes
 * eval-recorded.json, and ../evergreenEvalReplay.test.ts replays it in CI.
 */

import {
    type Candidate,
    T_HIGH,
    batchesOf,
    candidatesOf,
    decide,
    evergreenRequest,
    overBudget,
    requestDigest,
} from '../../evergreenRule.ts';
import { readArtifactText } from '../../publish.ts';

import type { Label } from './fit.ts';

export type EvalArtifact = {
    id: string;
    title: string;
    description: string;
    contentTitle: string | null;
    content: string | null;
};

export type EvalSentence = {
    pointer: string;
    start: number;
    end: number;
    text: string;
    label: Label;
};

export type EvalLabelled = { id: string; sentences: EvalSentence[] };

export type EvalRecorded = {
    model: string;
    artifacts: { id: string; batches: { digest: string; answers: Record<string, unknown> }[] }[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (file: string, index: number, shape: string): never => {
    throw new Error(`${file} entry ${index} is not ${shape}.`);
};

/** eval-candidates.json, narrowed. Throws on an entry that is not one. */
export const readEvalArtifacts = (raw: unknown): EvalArtifact[] =>
    (Array.isArray(raw) ? raw : fail('eval-candidates.json', -1, 'a list')).map(
        (entry: unknown, index) => {
            const shape = '{ id, title, description, contentTitle, content }';
            const text = (value: unknown) => value === null || typeof value === 'string';

            if (
                !isRecord(entry) ||
                typeof entry.id !== 'string' ||
                typeof entry.title !== 'string' ||
                typeof entry.description !== 'string' ||
                !text(entry.contentTitle) ||
                !text(entry.content)
            ) {
                return fail('eval-candidates.json', index, shape);
            }

            return {
                id: entry.id,
                title: entry.title,
                description: entry.description,
                contentTitle: (entry.contentTitle as string | null) ?? null,
                content: (entry.content as string | null) ?? null,
            };
        },
    );

/** eval-labelled.json, narrowed. Throws on an entry that is not one. */
export const readEvalLabelled = (raw: unknown): EvalLabelled[] =>
    (Array.isArray(raw) ? raw : fail('eval-labelled.json', -1, 'a list')).map(
        (entry: unknown, index) => {
            const shape = '{ id, sentences: [{ pointer, start, end, text, label }] }';

            if (
                !isRecord(entry) ||
                typeof entry.id !== 'string' ||
                !Array.isArray(entry.sentences)
            ) {
                return fail('eval-labelled.json', index, shape);
            }

            return {
                id: entry.id,
                sentences: entry.sentences.map((sentence: unknown) => {
                    if (
                        !isRecord(sentence) ||
                        typeof sentence.pointer !== 'string' ||
                        typeof sentence.start !== 'number' ||
                        typeof sentence.end !== 'number' ||
                        typeof sentence.text !== 'string' ||
                        (sentence.label !== 'evergreen' && sentence.label !== 'not_evergreen')
                    ) {
                        return fail('eval-labelled.json', index, shape);
                    }

                    return {
                        pointer: sentence.pointer,
                        start: sentence.start,
                        end: sentence.end,
                        text: sentence.text,
                        label: sentence.label,
                    };
                }),
            };
        },
    );

/** eval-recorded.json, narrowed. Throws when it is not one. */
export const readEvalRecorded = (raw: unknown): EvalRecorded => {
    const shape = '{ model, artifacts: [{ id, batches: [{ digest, answers }] }] }';

    if (!isRecord(raw) || typeof raw.model !== 'string' || !Array.isArray(raw.artifacts)) {
        return fail('eval-recorded.json', -1, shape);
    }

    return {
        model: raw.model,
        artifacts: raw.artifacts.map((artifact: unknown, index) => {
            if (
                !isRecord(artifact) ||
                typeof artifact.id !== 'string' ||
                !Array.isArray(artifact.batches)
            ) {
                return fail('eval-recorded.json', index, shape);
            }

            return {
                id: artifact.id,
                batches: artifact.batches.map((batch: unknown) =>
                    isRecord(batch) && typeof batch.digest === 'string' && isRecord(batch.answers)
                        ? { digest: batch.digest, answers: batch.answers }
                        : fail('eval-recorded.json', index, shape),
                ),
            };
        }),
    };
};

/**
 * The batches the publish route sends for `artifact`, each with its request
 * and digest. The text is narrowed by `readArtifactText`, as the route
 * narrows it. Throws when the artifact is not valid publish text or runs
 * past `MAX_CANDIDATES`, since the route would send nothing for it.
 */
export const evalBatches = (artifact: EvalArtifact) => {
    const read = readArtifactText({ ...artifact, topics: [] });

    if (!read.ok) {
        throw new Error(`${artifact.id}: ${read.pointer} ${read.detail}`);
    }

    const candidates = candidatesOf(read.value);

    if (overBudget(candidates)) {
        throw new Error(`${artifact.id}: too many sentences to check.`);
    }

    return batchesOf(candidates).map((batch) => {
        const request = evergreenRequest(batch);

        return { candidates: batch, request, digest: requestDigest(request) };
    });
};

/** `artifact`'s sentences as the routes split them, which eval-labelled.json
 *  labels. */
export const evalSentences = (artifact: EvalArtifact): Omit<EvalSentence, 'label'>[] =>
    evalBatches(artifact)
        .flatMap((batch) => batch.candidates)
        .map((candidate: Candidate) => ({
            pointer: `/${candidate.field}`,
            start: candidate.start,
            end: candidate.end,
            text: candidate.text,
        }));

export type EvalReplay = {
    /** Sentences labelled evergreen that a refusal falls on, as `id pointer start`. */
    falseBlocks: string[];
    /** Sentences labelled not evergreen with no refusal. */
    misses: string[];
    /** Artifacts whose recorded batches `decide` found unanswered. */
    unanswered: string[];
};

const key = (id: string, at: { pointer: string; start: number }) =>
    `${id} ${at.pointer} ${at.start}`;

/** What the route's decision at `tHigh` does with every recorded artifact. */
export const evalReplay = (
    artifacts: readonly EvalArtifact[],
    labelled: readonly EvalLabelled[],
    recorded: EvalRecorded,
    tHigh: number = T_HIGH,
): EvalReplay => {
    const result: EvalReplay = { falseBlocks: [], misses: [], unanswered: [] };

    for (const artifact of artifacts) {
        const sentences = labelled.find((each) => each.id === artifact.id)?.sentences ?? [];
        const sent = recorded.artifacts.find((each) => each.id === artifact.id)?.batches ?? [];
        const refused = new Set<string>();

        for (const [index, batch] of evalBatches(artifact).entries()) {
            const decision = decide(batch.candidates, sent[index]?.answers ?? {}, tHigh);

            if (!decision.answered) {
                result.unanswered.push(artifact.id);
                continue;
            }

            for (const refusal of decision.refusals) {
                refused.add(key(artifact.id, refusal));
            }
        }

        for (const sentence of sentences) {
            const blocked = refused.has(key(artifact.id, sentence));

            if (blocked && sentence.label === 'evergreen') {
                result.falseBlocks.push(key(artifact.id, sentence));
            }

            if (!blocked && sentence.label === 'not_evergreen') {
                result.misses.push(key(artifact.id, sentence));
            }
        }
    }

    return result;
};
