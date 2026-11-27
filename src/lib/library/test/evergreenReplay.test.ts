import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { MODEL } from '../evergreenRule.ts';
import {
    groupRequests,
    groupsOf,
    readLabelled,
    readRecorded,
    replay,
    scoredOf,
} from './evergreen/fit.ts';

// Jev's recorded answers on the scored sentences of labelled.json, which
// scripts/fit-evergreen.mjs writes. Replaying them through `decide` at the
// thresholds the rule ships with gives the misjudgements below. A change to
// the model, the questions, T_HIGH or T_KIND that adds an error or fixes one
// fails here, and the list is then updated on purpose. n28 ("The figure for
// 2024 is preliminary and may be revised.") has a refresh Noul of 0.57, and
// n30 ("Adaptation finance is still far below what countries need.") a
// refresh Noul of 0.92 with no kind Noul above 0.1, so both warn.
const KNOWN = { falseBlocks: [], misses: ['n28', 'n30'], stray: [], unanswered: 0 };

const LABELLED = new URL('./evergreen/labelled.json', import.meta.url);
const RECORDED = new URL('./evergreen/recorded.json', import.meta.url);
const missing = [LABELLED, RECORDED].filter((file) => !existsSync(file));

test(
    'the recorded answers on the labelled sentences replay to the known misjudgements',
    {
        skip:
            missing.length > 0 &&
            `no ${missing.map((file) => file.pathname.split('/').at(-1)).join(' or ')} yet: run scripts/fit-evergreen.mjs`,
    },
    () => {
        const labelled = readLabelled(JSON.parse(readFileSync(LABELLED, 'utf8')));
        const recorded = readRecorded(JSON.parse(readFileSync(RECORDED, 'utf8')));
        const groups = groupsOf(scoredOf(labelled));

        assert.equal(recorded.model, MODEL, 'recorded against another model: fit again');
        assert.equal(recorded.groups.length, groups.length, 'labelled.json changed: fit again');

        for (const [index, group] of groups.entries()) {
            const sent = recorded.groups[index];

            assert.equal(sent.content, group.content, `group ${index}: labelled.json changed`);
            assert.deepEqual(
                sent.requests.map((request) => request.digest),
                groupRequests(group.content).map((request) => request.digest),
                `group ${index}: the questions changed: fit again`,
            );
        }

        assert.deepEqual(replay(labelled, recorded), KNOWN);
    },
);
