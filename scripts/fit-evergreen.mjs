// Fits the Library's evergreen thresholds (src/lib/library/evergreenRule.ts,
// T_HIGH for the refresh Noul and T_KIND for the highest kind Noul) on the
// labelled dev set, which is the scored sentences of
// src/lib/library/test/evergreen/labelled.json and the artifacts of
// eval-candidates.json and eval-additions.json, labelled in
// eval-labelled.json and eval-additions-labelled.json. It sends every
// sentence exactly as the publish route does, one request each, writes the
// answers to recorded.json and eval-recorded.json beside them, and prints how
// many evergreen sentences each pair of thresholds would refuse and how many
// others it would let through. With --sweep it reads the recordings and
// makes no call. src/lib/library/test/evergreenReplay.test.ts and
// evergreenEvalReplay.test.ts replay them in CI.
//
// With --holdout it sends each artifact of holdout-candidates.json, writes
// holdout-recorded.json, and prints what the route decides at T_HIGH and
// T_KIND against holdout-labelled.json. --holdout2 does the same with the
// holdout2- files. With --sweep either reads its recording and makes no
// call.
//
//   TYPESAFE_API_KEY=<dev key> node scripts/fit-evergreen.mjs
//   node scripts/fit-evergreen.mjs --sweep
//   TYPESAFE_API_KEY=<dev key> node scripts/fit-evergreen.mjs --holdout
//   node scripts/fit-evergreen.mjs --holdout --sweep
//   TYPESAFE_API_KEY=<dev key> node scripts/fit-evergreen.mjs --holdout2
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { TypeSafeClient } from '@typesafe-ai/sdk';

import {
    MODEL,
    REQUEST_CONCURRENCY,
    T_HIGH,
    T_KIND,
    scoreOf,
} from '../src/lib/library/evergreenRule.ts';
import {
    evalReplay,
    evalRequests,
    readEvalArtifacts,
    readEvalLabelled,
    readEvalRecorded,
} from '../src/lib/library/test/evergreen/evaluate.ts';
import {
    groupRequests,
    groupsOf,
    readLabelled,
    readRecorded,
    replay,
    scoredOf,
} from '../src/lib/library/test/evergreen/fit.ts';

const DIR = new URL('../src/lib/library/test/evergreen/', import.meta.url);
const file = (name) => new URL(name, DIR);
const read = (name) => JSON.parse(readFileSync(file(name), 'utf8'));
const write = (name, value) => {
    writeFileSync(file(name), `${JSON.stringify(value, null, 4)}\n`);
    console.log(`wrote ${file(name).pathname}`);
};
const sweepOnly = process.argv.includes('--sweep');
const AT = { stale: T_HIGH, kind: T_KIND };

const client = () => new TypeSafeClient({ defaultModel: MODEL, timeout: 30_000, logLevel: 'off' });

// Sends every request, REQUEST_CONCURRENCY at a time, and keeps each one's
// digest and answers in order.
const send = async (typesafe, requests) => {
    const results = new Array(requests.length);
    let next = 0;

    const worker = async () => {
        while (next < requests.length) {
            const at = next++;
            const { request, digest } = requests[at];
            const { model, answers } = await typesafe.systemOne({ ...request, model: MODEL });

            if (model !== MODEL) {
                throw new Error(`TypeSafe answered with ${model}, not ${MODEL}.`);
            }

            results[at] = { digest, answers };
        }
    };

    await Promise.all(Array.from({ length: REQUEST_CONCURRENCY }, worker));

    return results;
};

// The artifacts of `names`, sent and written to `out`, or read from it with
// --sweep.
const artifactSet = async (names, out) => {
    const artifacts = names.flatMap((name) => readEvalArtifacts(read(name)));

    if (sweepOnly) {
        return { artifacts, recorded: readEvalRecorded(read(out)) };
    }

    const typesafe = client();
    const recorded = { model: MODEL, artifacts: [] };

    for (const artifact of artifacts) {
        recorded.artifacts.push({
            id: artifact.id,
            requests: await send(typesafe, evalRequests(artifact)),
        });
    }

    write(out, recorded);

    return { artifacts, recorded };
};

// Every labelled sentence of a set of artifacts with its scores.
const artifactSentences = (artifacts, labelled, recorded) =>
    artifacts.flatMap((artifact) => {
        const sentences = labelled.find((each) => each.id === artifact.id)?.sentences ?? [];
        const sent = recorded.artifacts.find((each) => each.id === artifact.id)?.requests ?? [];
        const scores = new Map(
            evalRequests(artifact).map(({ candidate }, at) => [
                `/${candidate.field} ${candidate.start}`,
                scoreOf(sent[at]?.answers ?? {}),
            ]),
        );

        return sentences.map((sentence) => ({
            key: `${artifact.id} ${sentence.pointer} ${sentence.start}`,
            text: sentence.text,
            label: sentence.label,
            kind: null,
            score: scores.get(`${sentence.pointer} ${sentence.start}`) ?? null,
        }));
    });

const show = (sentences) => (key) => {
    const sentence = sentences.get(key);
    const score = sentence?.score;
    const nouls = score
        ? `stale ${score.stale.toFixed(2)} ${score.kind} ${score.kindNoul.toFixed(2)}`
        : '';

    return `  ${key}  ${nouls}  ${sentence?.text.replaceAll('\n', ' / ')}`;
};

const steps = (from, to) =>
    Array.from({ length: Math.round((to - from) / 0.05) + 1 }, (_, at) =>
        Number((from + at * 0.05).toFixed(2)),
    );

const holdout = ['holdout', 'holdout2'].find((name) => process.argv.includes(`--${name}`));

if (holdout) {
    const { artifacts, recorded } = await artifactSet(
        [`${holdout}-candidates.json`],
        `${holdout}-recorded.json`,
    );

    if (!existsSync(file(`${holdout}-labelled.json`))) {
        console.log(`No ${holdout}-labelled.json yet, so nothing to compare.`);
        process.exit(0);
    }

    const labelled = readEvalLabelled(read(`${holdout}-labelled.json`));
    const sentences = artifactSentences(artifacts, labelled, recorded);
    const byKey = new Map(sentences.map((each) => [each.key, each]));
    const { falseBlocks, misses, unanswered } = evalReplay(artifacts, labelled, recorded, AT);
    const evergreen = sentences.filter((each) => each.label === 'evergreen').length;

    console.log(
        `\n${artifacts.length} artifacts, ${sentences.length} sentences: ${evergreen} evergreen, ${sentences.length - evergreen} not`,
    );
    console.log(`At T_HIGH ${T_HIGH} and T_KIND ${T_KIND}, evergreen sentences refused:`);
    console.log(falseBlocks.map(show(byKey)).join('\n') || '  none');
    console.log('Sentences that are not evergreen and pass:');
    console.log(misses.map(show(byKey)).join('\n') || '  none');

    if (unanswered.length > 0) {
        console.log(`Unanswered: ${unanswered.join(', ')}`);
    }

    process.exit(0);
}

const labelled = readLabelled(read('labelled.json'));
const scored = scoredOf(labelled);
const groups = groupsOf(scored);

const recordGroups = async () => {
    if (sweepOnly) {
        return readRecorded(read('recorded.json'));
    }

    const typesafe = client();
    const recorded = { model: MODEL, groups: [] };

    for (const group of groups) {
        recorded.groups.push({
            ids: group.ids,
            content: group.content,
            requests: await send(typesafe, groupRequests(group.content)),
        });
    }

    write('recorded.json', recorded);

    return recorded;
};

const recorded = await recordGroups();
const evalSet = await artifactSet(
    ['eval-candidates.json', 'eval-additions.json'],
    'eval-recorded.json',
);
const evalLabelled = ['eval-labelled.json', 'eval-additions-labelled.json'].flatMap((name) =>
    readEvalLabelled(read(name)),
);

// Every dev sentence with its scores, by the key a replay reports.
const groupSentences = groups.flatMap((group, index) =>
    groupRequests(group.content).flatMap(({ candidate }, at) => {
        const span = group.spans.find(
            (each) => candidate.start >= each.start && candidate.end <= each.end,
        );
        const item = scored.find((each) => each.id === span?.id);
        const score = scoreOf(recorded.groups[index].requests[at]?.answers ?? {});

        return item ? [{ ...item, key: item.id, score }] : [];
    }),
);
const all = [
    ...groupSentences,
    ...artifactSentences(evalSet.artifacts, evalLabelled, evalSet.recorded),
];
const sentences = new Map(all.map((each) => [each.key, each]));

const errors = (thresholds) => {
    const fit = replay(labelled, recorded, thresholds);
    const held = evalReplay(evalSet.artifacts, evalLabelled, evalSet.recorded, thresholds);

    if (fit.unanswered > 0 || held.unanswered.length > 0 || fit.stray.length > 0) {
        throw new Error('A recording has unanswered questions or stray refusals.');
    }

    return {
        falseBlocks: [...fit.falseBlocks, ...held.falseBlocks],
        misses: [...fit.misses, ...held.misses],
    };
};

const evergreen = all.filter((each) => each.label === 'evergreen').length;

console.log(
    `\n${all.length} dev sentences (${groupSentences.length} from labelled.json, ${all.length - groupSentences.length} from ${evalSet.artifacts.length} artifacts): ${evergreen} evergreen, ${all.length - evergreen} not`,
);

// Errors as false blocks/misses, the refresh threshold down the side and the
// kind threshold across. A star marks T_HIGH and T_KIND.
const kinds = steps(0, 0.9);

console.log(`\nstale\\kind ${kinds.map((kind) => kind.toFixed(2).padStart(6)).join('')}`);

for (const stale of steps(0.3, 0.95)) {
    const cells = kinds.map((kind) => {
        const { falseBlocks, misses } = errors({ stale, kind });
        const cell = `${falseBlocks.length}/${misses.length}`;

        return (stale === T_HIGH && kind === T_KIND ? `*${cell}` : cell).padStart(6);
    });

    console.log(`${stale.toFixed(2).padStart(10)} ${cells.join('')}`);
}

const { falseBlocks, misses } = errors(AT);

console.log(`\nAt T_HIGH ${T_HIGH} and T_KIND ${T_KIND}, evergreen sentences refused:`);
console.log(falseBlocks.map(show(sentences)).join('\n') || '  none');
console.log('Sentences that are not evergreen and pass:');
console.log(misses.map(show(sentences)).join('\n') || '  none');

const near = all.filter(
    ({ score }) =>
        score && (Math.abs(score.stale - T_HIGH) < 0.1 || Math.abs(score.kindNoul - T_KIND) < 0.1),
);

console.log(`\n${near.length} sentences within 0.1 of either threshold.`);

// How often the kind a refusal would name matches the label's.
const named = groupSentences.filter(
    (each) => each.label === 'not_evergreen' && each.kind && each.kind !== 'other' && each.score,
);
const agreed = named.filter((each) => each.score.kind === each.kind).length;

console.log(`Claim kind: ${agreed} of ${named.length} labelled.json sentences match their label.`);
