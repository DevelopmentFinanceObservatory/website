import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { MODEL } from '../evergreenRule.ts';
import {
    evalBatches,
    evalReplay,
    evalSentences,
    readEvalArtifacts,
    readEvalLabelled,
    readEvalRecorded,
} from './evergreen/evaluate.ts';

// Jev's recorded answers on whole artifacts, which `scripts/fit-evergreen.mjs
// --eval` writes. Replaying them through the route's batches and `decide`
// shows the rule refuses every sentence labelled not evergreen at that
// sentence and no sentence labelled evergreen, on text the thresholds were
// not fitted on.
const ARTIFACTS = new URL('./evergreen/eval-candidates.json', import.meta.url);
const LABELLED = new URL('./evergreen/eval-labelled.json', import.meta.url);
const RECORDED = new URL('./evergreen/eval-recorded.json', import.meta.url);
const missing = [LABELLED, RECORDED].filter((file) => !existsSync(file));
const read = (file: URL): unknown => JSON.parse(readFileSync(file, 'utf8'));

test(
    'the recorded answers on the evaluation artifacts replay to their labels',
    {
        skip:
            missing.length > 0 &&
            `no ${missing.map((file) => file.pathname.split('/').at(-1)).join(' or ')} yet: run scripts/fit-evergreen.mjs --eval`,
    },
    () => {
        const artifacts = readEvalArtifacts(read(ARTIFACTS));
        const labelled = readEvalLabelled(read(LABELLED));
        const recorded = readEvalRecorded(read(RECORDED));

        assert.equal(recorded.model, MODEL, 'recorded against another model: run --eval again');

        for (const artifact of artifacts) {
            const sentences = labelled.find((each) => each.id === artifact.id)?.sentences;
            const sent = recorded.artifacts.find((each) => each.id === artifact.id)?.batches;

            assert.deepEqual(
                sentences?.map(({ pointer, start, end, text }) => ({ pointer, start, end, text })),
                evalSentences(artifact),
                `${artifact.id}: the sentences split differently: label them again`,
            );
            assert.deepEqual(
                sent?.map((batch) => batch.digest),
                evalBatches(artifact).map((batch) => batch.digest),
                `${artifact.id}: the requests changed: run --eval again`,
            );
        }

        assert.deepEqual(evalReplay(artifacts, labelled, recorded), {
            falseBlocks: [],
            misses: [],
            unanswered: [],
        });
    },
);
