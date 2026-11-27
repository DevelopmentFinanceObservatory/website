import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { MODEL } from '../evergreenRule.ts';
import {
    evalReplay,
    evalRequests,
    evalSentences,
    readEvalArtifacts,
    readEvalLabelled,
    readEvalRecorded,
} from './evergreen/evaluate.ts';

// Jev's recorded answers on each set of artifacts, which
// scripts/fit-evergreen.mjs writes. Replaying them through the route's
// requests and `decide` gives the misjudgements below, as `<artifact>
// <pointer> <start>`. A change to the model, the questions, T_HIGH or T_KIND
// that adds an error or fixes one fails here, and the list is then updated on
// purpose. The evaluation artifacts are part of the set the thresholds are
// fitted on, and the held-out artifacts are not.
const SETS = [
    {
        name: 'evaluation',
        artifacts: ['eval-candidates.json', 'eval-additions.json'],
        labelled: ['eval-labelled.json', 'eval-additions-labelled.json'],
        recorded: 'eval-recorded.json',
        run: 'scripts/fit-evergreen.mjs',
        known: { falseBlocks: [], misses: [], unanswered: [] },
    },
    {
        name: 'held-out',
        artifacts: ['holdout-candidates.json'],
        labelled: ['holdout-labelled.json'],
        recorded: 'holdout-recorded.json',
        run: 'scripts/fit-evergreen.mjs --holdout',
        // Two descriptions that name a top list are refused, and the heading
        // "Recent rise" passes with a warning.
        known: {
            falseBlocks: ['h02 /description 0', 'h06 /description 0'],
            misses: ['h30 /contentTitle 0'],
            unanswered: [],
        },
    },
    {
        name: 'second held-out',
        artifacts: ['holdout2-candidates.json'],
        labelled: ['holdout2-labelled.json'],
        recorded: 'holdout2-recorded.json',
        run: 'scripts/fit-evergreen.mjs --holdout2',
        // `namesDataYear` refuses the heading "Why the line breaks in 2018",
        // whose year dates a method, and the title "Debt statistics, 2024
        // edition" passes with a warning.
        known: {
            falseBlocks: ['k06 /contentTitle 0'],
            misses: ['k21 /title 0'],
            unanswered: [],
        },
    },
];

const file = (name: string) => new URL(`./evergreen/${name}`, import.meta.url);
const read = (name: string): unknown => JSON.parse(readFileSync(file(name), 'utf8'));

for (const set of SETS) {
    const missing = [...set.labelled, set.recorded].filter((name) => !existsSync(file(name)));

    test(
        `the recorded answers on the ${set.name} artifacts replay to the known misjudgements`,
        { skip: missing.length > 0 && `no ${missing.join(' or ')} yet: run ${set.run}` },
        () => {
            const artifacts = set.artifacts.flatMap((name) => readEvalArtifacts(read(name)));
            const labelled = set.labelled.flatMap((name) => readEvalLabelled(read(name)));
            const recorded = readEvalRecorded(read(set.recorded));

            assert.equal(recorded.model, MODEL, `recorded against another model: run ${set.run}`);

            for (const artifact of artifacts) {
                const sentences = labelled.find((each) => each.id === artifact.id)?.sentences;
                const sent = recorded.artifacts.find((each) => each.id === artifact.id)?.requests;

                assert.deepEqual(
                    sentences?.map(({ pointer, start, end, text }) => ({
                        pointer,
                        start,
                        end,
                        text,
                    })),
                    evalSentences(artifact),
                    `${artifact.id}: the sentences split differently: label them again`,
                );
                assert.deepEqual(
                    sent?.map((request) => request.digest),
                    evalRequests(artifact).map((request) => request.digest),
                    `${artifact.id}: the requests changed: run ${set.run}`,
                );
            }

            assert.deepEqual(evalReplay(artifacts, labelled, recorded), set.known);
        },
    );
}
