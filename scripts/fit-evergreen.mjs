// Fits the Library's evergreen threshold (src/lib/library/evergreenRule.ts,
// T_HIGH) on labelled sentences. It packs
// src/lib/library/test/evergreen/labelled.json into groups of ten, asks Jev
// about each group exactly as the publish route asks about an artifact's
// section text, writes the model and every answer to recorded.json beside
// it, and prints, for each threshold, how many evergreen sentences it would
// refuse and how many others it would let through. With --sweep it reads
// recorded.json and makes no call. src/lib/library/test/evergreenReplay.test.ts
// replays recorded.json in CI.
//
// With --eval it sends each artifact of eval-candidates.json exactly as the
// publish route does, in the route's batches, writes eval-recorded.json, and
// prints the sentences eval-labelled.json says it gets wrong at T_HIGH.
// src/lib/library/test/evergreenEvalReplay.test.ts replays it in CI.
// --eval --sweep reads eval-recorded.json and makes no call.
//
//   TYPESAFE_API_KEY=<dev key> node scripts/fit-evergreen.mjs
//   node scripts/fit-evergreen.mjs --sweep
//   TYPESAFE_API_KEY=<dev key> node scripts/fit-evergreen.mjs --eval
//   node scripts/fit-evergreen.mjs --eval --sweep
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { TypeSafeClient } from '@typesafe-ai/sdk';

import {
    KIND_MIN,
    MODEL,
    T_HIGH,
    evergreenRequest,
    kindId,
} from '../src/lib/library/evergreenRule.ts';
import {
    evalBatches,
    evalReplay,
    readEvalArtifacts,
    readEvalLabelled,
    readEvalRecorded,
} from '../src/lib/library/test/evergreen/evaluate.ts';
import {
    groupRequest,
    groupsOf,
    readLabelled,
    readRecorded,
    replay,
    sentenceScores,
} from '../src/lib/library/test/evergreen/fit.ts';

const DIR = new URL('../src/lib/library/test/evergreen/', import.meta.url);
const LABELLED = new URL('labelled.json', DIR);
const RECORDED = new URL('recorded.json', DIR);
const EVAL_ARTIFACTS = new URL('eval-candidates.json', DIR);
const EVAL_LABELLED = new URL('eval-labelled.json', DIR);
const EVAL_RECORDED = new URL('eval-recorded.json', DIR);

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const sweepOnly = process.argv.includes('--sweep');

const answered = (model) => {
    if (model !== MODEL) {
        throw new Error(`TypeSafe answered with ${model}, not ${MODEL}.`);
    }
};

const evaluate = async () => {
    const artifacts = readEvalArtifacts(read(EVAL_ARTIFACTS));
    let recorded;

    if (sweepOnly) {
        recorded = readEvalRecorded(read(EVAL_RECORDED));
    } else {
        const client = new TypeSafeClient({ defaultModel: MODEL, timeout: 30_000 });

        recorded = { model: MODEL, artifacts: [] };

        for (const artifact of artifacts) {
            const batches = await Promise.all(
                evalBatches(artifact).map(async ({ request, digest }) => {
                    const { model, answers } = await client.systemOne({ ...request, model: MODEL });

                    answered(model);

                    return { digest, answers };
                }),
            );

            recorded.artifacts.push({ id: artifact.id, batches });
            console.log(`${artifact.id}: ${batches.length} requests`);
        }

        writeFileSync(EVAL_RECORDED, `${JSON.stringify(recorded, null, 4)}\n`);
        console.log(`wrote ${EVAL_RECORDED.pathname}`);
    }

    if (!existsSync(EVAL_LABELLED)) {
        console.log('No eval-labelled.json yet, so nothing to compare.');

        return;
    }

    const labelled = readEvalLabelled(read(EVAL_LABELLED));
    const text = new Map(
        labelled.flatMap((artifact) =>
            artifact.sentences.map((each) => [
                `${artifact.id} ${each.pointer} ${each.start}`,
                each.text,
            ]),
        ),
    );
    const show = (key) => `  ${key} ${text.get(key)}`;
    const { falseBlocks, misses, unanswered } = evalReplay(artifacts, labelled, recorded);

    console.log(`\nAt T_HIGH ${T_HIGH}, evergreen sentences refused:`);
    console.log(falseBlocks.map(show).join('\n') || '  none');
    console.log('Sentences that are not evergreen and pass:');
    console.log(misses.map(show).join('\n') || '  none');

    if (unanswered.length > 0) {
        console.log(`Unanswered: ${unanswered.join(', ')}`);
    }
};

if (process.argv.includes('--eval')) {
    await evaluate();
    process.exit(0);
}

const labelled = readLabelled(read(LABELLED));
const groups = groupsOf(labelled);

const record = async () => {
    const client = new TypeSafeClient({ defaultModel: MODEL, timeout: 30_000 });
    const recorded = { model: MODEL, groups: [] };

    for (const [index, group] of groups.entries()) {
        const { candidates, digest } = groupRequest(group.content);
        const { model, answers } = await client.systemOne({
            ...evergreenRequest(candidates),
            model: MODEL,
        });

        answered(model);

        recorded.groups.push({ ids: group.ids, content: group.content, digest, answers });
        console.log(`group ${index + 1} of ${groups.length}: ${candidates.length} sentences`);
    }

    writeFileSync(RECORDED, `${JSON.stringify(recorded, null, 4)}\n`);
    console.log(`wrote ${RECORDED.pathname}`);

    return recorded;
};

const sweep = (recorded) => {
    const evergreen = labelled.filter((item) => item.label === 'evergreen').length;
    const other = labelled.length - evergreen;

    console.log(`\n${labelled.length} sentences: ${evergreen} evergreen, ${other} not`);
    console.log('threshold  false blocks  misses');

    for (let step = 30; step <= 95; step += 5) {
        const threshold = step / 100;
        const { falseBlocks, misses, unanswered } = replay(labelled, recorded, threshold);

        if (unanswered > 0) {
            throw new Error(`${unanswered} groups have unanswered questions.`);
        }

        const mark = threshold === T_HIGH ? '  <- T_HIGH' : '';

        console.log(
            `${threshold.toFixed(2).padStart(9)}  ${String(falseBlocks.length).padStart(12)}  ${String(misses.length).padStart(6)}${mark}`,
        );
    }

    const { falseBlocks, misses, stray } = replay(labelled, recorded);
    const scores = new Map(
        groups.flatMap((group, index) => [
            ...sentenceScores(group, recorded.groups[index].answers),
        ]),
    );
    const text = new Map(labelled.map((item) => [item.id, item.text]));
    const show = (id) => `  ${id} ${scores.get(id)?.toFixed(3)} ${text.get(id)}`;

    console.log(`\nAt T_HIGH ${T_HIGH}, evergreen sentences refused:`);
    console.log(falseBlocks.map(show).join('\n') || '  none');
    console.log('Sentences that are not evergreen and pass:');
    console.log(misses.map(show).join('\n') || '  none');

    if (stray.length > 0) {
        console.log(`${stray.length} refusals fall outside every sentence.`);
    }

    // How often the claim kind the refusal would name matches the label.
    let named = 0;
    let agreed = 0;

    for (const [index, group] of groups.entries()) {
        const { candidates } = groupRequest(group.content);
        const answers = recorded.groups[index].answers;

        for (const [at, candidate] of candidates.entries()) {
            const span = group.spans.find(
                (each) => candidate.start >= each.start && candidate.end <= each.end,
            );
            const item = labelled.find((each) => each.id === span?.id);
            const answer = answers[kindId(at)];

            if (item?.label !== 'not_evergreen' || !item.kind || item.kind === 'other') {
                continue;
            }

            if (answer?.probabilities?.[answer.choice] >= KIND_MIN) {
                named += 1;
                agreed += answer.choice === item.kind ? 1 : 0;
            }
        }
    }

    console.log(
        `\nClaim kind at or above KIND_MIN ${KIND_MIN}: ${named} sentences, ${agreed} matching their label.`,
    );
};

const recorded = sweepOnly ? readRecorded(read(RECORDED)) : await record();

sweep(recorded);
