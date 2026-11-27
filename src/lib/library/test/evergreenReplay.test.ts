import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { MODEL } from '../evergreenRule.ts';
import { groupRequest, groupsOf, readLabelled, readRecorded, replay } from './evergreen/fit.ts';

// Jev's recorded answers on the labelled sentences, which
// scripts/fit-evergreen.mjs writes. Replaying them through `decide` shows the
// rule, at the thresholds it ships with, refuses every sentence labelled not
// evergreen at that sentence and no sentence labelled evergreen.
const LABELLED = new URL('./evergreen/labelled.json', import.meta.url);
const RECORDED = new URL('./evergreen/recorded.json', import.meta.url);
const missing = [LABELLED, RECORDED].filter((file) => !existsSync(file));

test(
    'the recorded answers on the labelled sentences replay to the labels',
    {
        skip:
            missing.length > 0 &&
            `no ${missing.map((file) => file.pathname.split('/').at(-1)).join(' or ')} yet: run scripts/fit-evergreen.mjs`,
    },
    () => {
        const labelled = readLabelled(JSON.parse(readFileSync(LABELLED, 'utf8')));
        const recorded = readRecorded(JSON.parse(readFileSync(RECORDED, 'utf8')));
        const groups = groupsOf(labelled);

        assert.equal(recorded.model, MODEL, 'recorded against another model: fit again');
        assert.equal(recorded.groups.length, groups.length, 'labelled.json changed: fit again');

        for (const [index, group] of groups.entries()) {
            const sent = recorded.groups[index];

            assert.equal(sent.content, group.content, `group ${index}: labelled.json changed`);
            assert.equal(
                sent.digest,
                groupRequest(group.content).digest,
                `group ${index}: the questions changed: fit again`,
            );
        }

        assert.deepEqual(replay(labelled, recorded), {
            falseBlocks: [],
            misses: [],
            stray: [],
            unanswered: 0,
        });
    },
);
