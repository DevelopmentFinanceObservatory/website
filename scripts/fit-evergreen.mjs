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
//   TYPESAFE_API_KEY=<dev key> node scripts/fit-evergreen.mjs
//   node scripts/fit-evergreen.mjs --sweep
import { readFileSync, writeFileSync } from 'node:fs';

import { TypeSafeClient } from '@typesafe-ai/sdk';

import {
    KIND_MIN,
    MODEL,
    T_HIGH,
    evergreenRequest,
    kindId,
} from '../src/lib/library/evergreenRule.ts';
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

const labelled = readLabelled(JSON.parse(readFileSync(LABELLED, 'utf8')));
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

        if (model !== MODEL) {
            throw new Error(`TypeSafe answered with ${model}, not ${MODEL}.`);
        }

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

const recorded = process.argv.includes('--sweep')
    ? readRecorded(JSON.parse(readFileSync(RECORDED, 'utf8')))
    : await record();

sweep(recorded);
