import assert from 'node:assert/strict';
import test from 'node:test';

import { groupSourceCodes, sourceCodeParts, sourceCodeText } from '../sourceCodes.ts';

const WB = 'dc/base/WorldBankInternationalDebtStatistics';
const publisherOf = (dcid: string): string | null => (dcid === WB ? 'World Bank' : null);

test('the codes read as one sentence, each code its own part', () => {
    const exact = groupSourceCodes(
        [
            { provenance: WB, code: 'DT.TDS.DEGG.CD', exact: true },
            { provenance: WB, code: 'DT.AMT.A' },
        ],
        publisherOf,
    );
    const builtFrom = groupSourceCodes(
        [
            ...['A', 'B', 'C', 'D', 'E'].map((code) => ({ provenance: WB, code })),
            { provenance: 'dc/base/Unlisted', code: 'X1' },
            { provenance: 'dc/base/Unlisted', code: 'X2' },
        ],
        publisherOf,
    );

    assert.ok(exact && builtFrom);
    assert.deepEqual(sourceCodeParts(exact), [
        { text: 'World Bank code ' },
        { code: 'DT.TDS.DEGG.CD' },
    ]);
    assert.equal(
        sourceCodeText(builtFrom),
        'Built from World Bank codes A, B, C and 2 more and Source codes X1 and X2',
    );
    assert.equal(groupSourceCodes([], publisherOf), null);
});
