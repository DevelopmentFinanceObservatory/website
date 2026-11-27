import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    type Candidate,
    EXAMPLE_SENTENCES,
    QUESTION_NAMES,
    REASONS,
    T_HIGH,
    T_KIND,
    T_LOW,
    DATA_YEAR_REASON,
    YEAR_RANGE_REASON,
    candidatesOf,
    changedText,
    decide,
    evergreenRequest,
    namesDataYear,
    namesYearRange,
    sentenceSpans,
} from '../evergreenRule.ts';

const sentences = (text: string) =>
    sentenceSpans(text).map(({ start, end }) => text.slice(start, end));

test('text splits into sentences at their ends and at line breaks', () => {
    const cases: [string, string[]][] = [
        ['ODA fell. Germany rose.', ['ODA fell.', 'Germany rose.']],
        ['Is it rising? Yes! It is.', ['Is it rising?', 'Yes!', 'It is.']],
        [
            'The target is 0.7% of GNI. The dotted line marks it.',
            ['The target is 0.7% of GNI.', 'The dotted line marks it.'],
        ],
        [
            'Values are in U.S. dollars. Each bar is a year.',
            ['Values are in U.S. dollars.', 'Each bar is a year.'],
        ],
        [
            'Sectors, e.g. Health, are grouped. Read left to right.',
            ['Sectors, e.g. Health, are grouped.', 'Read left to right.'],
        ],
        ['It rose (in 2024). Then it fell.', ['It rose (in 2024).', 'Then it fell.']],
        ['It says "ODA fell." Then it stops.', ['It says "ODA fell."', 'Then it stops.']],
        ['the end. lower case follows', ['the end. lower case follows']],
        ['Read the bars. *Germany* gave most.', ['Read the bars.', '*Germany* gave most.']],
        ['It is **new.** _Norway_ gave most.', ['It is **new.**', '_Norway_ gave most.']],
        ['Debt in the U.S. The bars show it.', ['Debt in the U.S.', 'The bars show it.']],
        ['Read plan B. This line is next.', ['Read plan B.', 'This line is next.']],
        [
            'Data from J. Smith and the U.S. Treasury.',
            ['Data from J. Smith and the U.S. Treasury.'],
        ],
        ['2024. ODA fell to a low.', ['2024. ODA fell to a low.']],
        ['In 2024. 2025. Next one.', ['In 2024.', '2025. Next one.']],
        ['12. Pick a donor\n123. Not a marker', ['Pick a donor', '123. Not a marker']],
        [
            '  - Select a country.\n- Hover over a segment.\n',
            ['Select a country.', 'Hover over a segment.'],
        ],
        [
            '## How to read it\n1. Pick a donor\n> Quoted line',
            ['How to read it', 'Pick a donor', 'Quoted line'],
        ],
        ['---\n\n2024\nA line', ['2024\nA line']],
        ['ODA rose. 25%.', ['ODA rose. 25%.']],
        ['Total ODA\n$250,000,000', ['Total ODA\n$250,000,000']],
        ['$250,000,000\nIn aid to Africa.', ['$250,000,000\nIn aid to Africa.']],
        ['- Norway\n- 25%\n- Sweden\n- 20%', ['Norway\n- 25%', 'Sweden\n- 20%']],
        [
            'Five donors met it:\n- Norway\n\n- Sweden\nRead the bars.',
            ['Five donors met it:\n- Norway\n\n- Sweden', 'Read the bars.'],
        ],
        [
            'Steps:\n1. drop duplicates\n2. sum by year',
            ['Steps:\n1. drop duplicates\n2. sum by year'],
        ],
        [
            'Read it in two steps:\n- Pick a donor.\n- Hover over a bar.',
            ['Read it in two steps:', 'Pick a donor.', 'Hover over a bar.'],
        ],
        [
            'It covers:\n- grants\n- loans. Then\n- equity',
            ['It covers:\n- grants', 'loans.', 'Then', 'equity'],
        ],
        ['Key: a dot is a donor.\n- Norway', ['Key: a dot is a donor.', 'Norway']],
        ['25%', ['25%']],
        ['25%\n30%', ['25%\n30%']],
        ['', []],
    ];

    for (const [text, expected] of cases) {
        assert.deepEqual(sentences(text), expected, JSON.stringify(text));
    }
});

test('candidates carry their field and offsets into that field', () => {
    const text = {
        title: 'ODA by donor',
        description: null,
        contentTitle: undefined,
        content: 'This chart shows ODA.\n- Norway gives the most.',
    };
    const candidates = candidatesOf(text);

    assert.deepEqual(
        candidates.map(({ field, start, end }) => [field, start, end]),
        [
            ['title', 0, 12],
            ['content', 0, 21],
            ['content', 24, 46],
        ],
    );

    for (const candidate of candidates) {
        assert.equal(text[candidate.field]?.slice(candidate.start, candidate.end), candidate.text);
    }
});

test('the request holds one sentence and its part, and asks every question about it', () => {
    const [heading] = candidatesOf({ contentTitle: 'Trend' });
    const request = evergreenRequest(heading);

    assert.deepEqual(request.state, { part: 'section heading', sentence: 'Trend' });
    assert.deepEqual(Object.keys(request.questions), [...QUESTION_NAMES]);

    for (const question of Object.values(request.questions)) {
        assert.equal(question.type, 'noul');
        assert.match(question.instructions, /`sentence`/);
    }
});

const answer = (stale: number, kinds: Partial<Record<string, number>> = {}) => ({
    stale: { type: 'noul', noul: stale },
    ...Object.fromEntries(
        ['value', 'ranking', 'change', 'period'].map((name) => [
            name,
            { type: 'noul', noul: kinds[name] ?? 0.05 },
        ]),
    ),
});

test('the refresh Noul decides, and the highest kind Noul names the kind', () => {
    const content = 'Norway gives the most. ODA fell. It rose. This chart shows ODA.';
    const [ranked, fell, rose, shows] = candidatesOf({ content });
    const cases: [Candidate, Record<string, unknown>, string, string | null][] = [
        [ranked, answer(0.95, { ranking: 0.9, value: 0.2 }), 'refused', 'ranking'],
        [fell, answer(T_HIGH, { change: 0.6, period: 0.5 }), 'refused', 'trend'],
        [fell, answer(0.95, { change: T_KIND }), 'refused', 'trend'],
        // A refresh Noul alone, with no kind Noul at T_KIND, warns.
        [fell, answer(0.95, { change: T_KIND - 0.01 }), 'warned', 'trend'],
        // A kind Noul alone refuses nothing.
        [shows, answer(0.05, { value: 0.99 }), 'passed', null],
        [rose, answer((T_LOW + T_HIGH) / 2, { period: 0.8 }), 'warned', 'recency'],
        [rose, answer(T_LOW - 0.01, { change: 0.9 }), 'passed', null],
    ];

    for (const [candidate, answers, outcome, kind] of cases) {
        const decision = decide(candidate, answers);

        assert.equal(decision.outcome, outcome, candidate.text);

        if (decision.outcome === 'refused') {
            assert.equal(decision.refusal.kind, kind);
            assert.equal(decision.refusal.reason, REASONS[decision.refusal.kind]);
            assert.equal(
                content.slice(decision.refusal.start, decision.refusal.end),
                candidate.text,
            );
        }

        if (decision.outcome === 'warned') {
            assert.equal(decision.warning.kind, kind);
            assert.equal(decision.warning.quote, candidate.text);
        }
    }
});

test('a title or section heading that names a year range is refused whatever the answers', () => {
    const cases: [
        Partial<Record<'title' | 'contentTitle' | 'description' | 'content', string>>,
        boolean,
    ][] = [
        [{ title: 'Climate finance, 2013 to 2022' }, true],
        [{ title: 'Climate finance, 2013-2022' }, true],
        [{ title: 'Climate finance 2013 – 2022' }, true],
        [{ title: 'Climate finance, 2013—2022' }, true],
        [{ contentTitle: 'From 1990 through 2005' }, true],
        [{ contentTitle: 'Between 2016 and 2021' }, true],
        [{ title: 'Aid since 2015' }, false],
        [{ title: 'The 0.15-0.20% target' }, false],
        [{ title: 'Codes 1850 to 1900' }, false],
        [{ description: 'Aid from 2013 to 2022, by donor.' }, false],
        [{ content: 'Each line runs from 2013 to 2022.' }, false],
    ];

    for (const [text, refused] of cases) {
        const [candidate] = candidatesOf(text);
        const decision = decide(candidate, answer(0.05));

        assert.equal(namesYearRange(candidate), refused, candidate.text);
        assert.equal(decision.outcome, refused ? 'refused' : 'passed', candidate.text);

        if (decision.outcome === 'refused') {
            assert.equal(decision.refusal.kind, 'recency');
            assert.equal(decision.refusal.reason, YEAR_RANGE_REASON);
        }
    }
});

test('a title or section heading that names the year the data covers is refused whatever the answers', () => {
    const cases: [
        Partial<Record<'title' | 'contentTitle' | 'description' | 'content', string>>,
        boolean,
    ][] = [
        [{ title: 'Total ODA in 2023' }, true],
        [{ title: 'LDC aid in 2021' }, true],
        [{ title: 'ODA for 2022' }, true],
        [{ title: 'Aid at end 2023' }, true],
        [{ title: 'Flows — 2022' }, true],
        [{ contentTitle: 'Net flows: 2022' }, true],
        [{ title: 'Aid to fragile states in 2021' }, true],
        [{ title: 'Bilateral giving by member, 2023' }, true],
        [{ title: 'Grants by sector – 2022' }, true],
        [{ contentTitle: 'Disbursements for 2020' }, true],
        [{ contentTitle: 'Arrears during 2019' }, true],
        [{ contentTitle: 'Debt stock as of 2024' }, true],
        [{ contentTitle: 'Reserves at end 2022' }, true],
        [{ title: 'ODA fell 7% in 2024' }, true],
        [{ title: 'Debt service, change since 2015' }, false],
        [{ contentTitle: 'Change since 2015' }, false],
        [{ title: 'Debt service compared with 2015' }, false],
        [{ contentTitle: 'Compared with 2015' }, false],
        [{ title: 'In 2015 constant prices' }, false],
        [{ title: 'Aid at constant prices, 2015' }, false],
        [{ title: 'Base year 2015' }, false],
        [{ title: 'From 2010 onwards' }, false],
        [{ title: 'SDG 17 indicators' }, false],
        [{ title: 'Climate finance goal for 2025' }, false],
        [{ title: 'Target for 2030' }, false],
        [{ contentTitle: 'Agenda for 2030' }, false],
        [{ contentTitle: 'Deadline: 2030' }, false],
        [{ title: 'Spending against the goal, 2030' }, false],
        [{ title: 'Aid relative to 2010' }, false],
        [{ title: 'Lending before 2018' }, false],
        [{ title: 'Commitments after 2020' }, false],
        [{ title: 'Growth from 2000' }, false],
        [{ title: 'Constant prices, 2021' }, false],
        [{ title: 'Base year, 2021' }, false],
        [{ title: 'ODA in 2021 prices' }, false],
        [{ title: 'ODA in 2021 US dollars' }, false],
        [{ title: 'The latest year' }, false],
        [{ title: 'Agenda 2030 targets' }, false],
        [{ description: 'Total ODA in 2023, by donor.' }, false],
        [{ content: 'Values are for 2023.' }, false],
    ];

    for (const [text, refused] of cases) {
        const [candidate] = candidatesOf(text);
        const decision = decide(candidate, answer(0.05));

        assert.equal(namesDataYear(candidate), refused, candidate.text);
        assert.equal(decision.outcome, refused ? 'refused' : 'passed', candidate.text);

        if (decision.outcome === 'refused') {
            assert.equal(decision.refusal.kind, 'recency');
            assert.equal(decision.refusal.reason, DATA_YEAR_REASON);
        }
    }
});

test('a missing or mistyped answer leaves the decision unanswered', () => {
    const [candidate] = candidatesOf({ title: 'ODA by donor' });
    const without = (name: string): Record<string, unknown> => {
        const answers: Record<string, unknown> = answer(0.1);

        delete answers[name];

        return answers;
    };
    const cases: Record<string, unknown>[] = [
        {},
        without('stale'),
        without('period'),
        { ...answer(0.1), stale: { type: 'noul', noul: 1.5 } },
        { ...answer(0.1), value: { type: 'choice', choice: 'figure' } },
    ];

    for (const answers of cases) {
        assert.equal(decide(candidate, answers).outcome, 'unanswered', JSON.stringify(answers));
    }
});

test('no criteria example is a sentence of an artifact the fit or the held-out run scores', () => {
    const names = [
        'eval-candidates.json',
        'eval-additions.json',
        'holdout-candidates.json',
        'holdout2-candidates.json',
    ];
    const artifacts = names.flatMap(
        (name) =>
            JSON.parse(readFileSync(new URL(`./evergreen/${name}`, import.meta.url), 'utf8')) as {
                title: string;
                description: string;
                contentTitle: string | null;
                content: string | null;
            }[],
    );

    assert.ok(EXAMPLE_SENTENCES.size >= QUESTION_NAMES.length);
    assert.ok(artifacts.length > 0);
    assert.deepEqual(
        artifacts.flatMap((artifact) =>
            candidatesOf(artifact).filter((candidate) => EXAMPLE_SENTENCES.has(candidate.text)),
        ),
        [],
    );
});

test('an edit checks only the text fields it changes', () => {
    const stored = {
        title: 'ODA by donor',
        description: 'Annual ODA.',
        contentTitle: null,
        content: 'Norway gives the most.',
    };

    assert.deepEqual(changedText(stored, { ...stored }), {});
    assert.deepEqual(
        changedText(stored, {
            ...stored,
            description: 'Annual ODA, by donor.',
            contentTitle: 'Reading it',
            content: null,
        }),
        { description: 'Annual ODA, by donor.', contentTitle: 'Reading it' },
    );
});
