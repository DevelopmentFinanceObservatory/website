import assert from 'node:assert/strict';
import test from 'node:test';

import { allPeriodsFixed } from '../periods.ts';

const APIS = 'https://apis.test';
const A = { component_id: 'cmp_a', revision: 2 };
const B = { component_id: 'cmp_b', revision: 5 };

// dfo-apis' component reads, answering each id from `answers`.
const backendOver = (answers: Record<string, () => Response>) => {
    const calls: string[] = [];
    const fetcher = async (url: string | URL | Request) => {
        calls.push(String(url));

        const id = /components\/([^?]+)/.exec(String(url))?.[1] ?? '';

        return answers[id]();
    };

    return { calls, backend: { apisBase: APIS, fetch: fetcher as typeof fetch } };
};

const mode = (value: unknown) => () => Response.json({ component_id: 'x', period_mode: value });

test('every card fixed is fixed, and each card is read at its revision', async () => {
    const { calls, backend } = backendOver({ cmp_a: mode('fixed'), cmp_b: mode('fixed') });

    assert.equal(await allPeriodsFixed(backend, [A, B]), 'fixed');
    assert.deepEqual(calls.sort(), [
        `${APIS}/api/presentation/components/cmp_a?revision=2`,
        `${APIS}/api/presentation/components/cmp_b?revision=5`,
    ]);
});

test('a rolling card is rolling, and a card whose mode is not known names why', async () => {
    const cases: [string, Record<string, () => Response>, (typeof A | null)[]][] = [
        ['rolling', { cmp_a: mode('fixed'), cmp_b: mode('rolling') }, [A, B]],
        ['mode_missing', { cmp_a: mode('fixed'), cmp_b: mode(undefined) }, [A, B]],
        ['mode_unknown', { cmp_a: mode('frozen') }, [A]],
        ['no_revision', { cmp_a: mode('fixed') }, [A, null]],
        ['no_cards', {}, []],
    ];

    for (const [found, answers, refs] of cases) {
        assert.equal(await allPeriodsFixed(backendOver(answers).backend, refs), found);
    }
});

test('a refused read rejects with its code', async () => {
    const { backend } = backendOver({
        cmp_a: () => Response.json({ code: 'not_found' }, { status: 404 }),
    });

    await assert.rejects(allPeriodsFixed(backend, [A]), { code: 'not_found' });
});
