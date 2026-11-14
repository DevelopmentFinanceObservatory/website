/** `idBreaks.ts`: where an id may wrap. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { idPieces } from '../idBreaks.ts';

test('an id may wrap after each "/", "." and "_", and between camelCase words', () => {
    assert.deepEqual(idPieces('provenance/OECDDAC1'), ['provenance/', 'OECDDAC1']);
    assert.deepEqual(idPieces('DT.DOD.DPPG.CD'), ['DT.', 'DOD.', 'DPPG.', 'CD']);
    assert.deepEqual(idPieces('Amount_FinancialPosition_Nominal'), [
        'Amount_',
        'Financial',
        'Position_',
        'Nominal',
    ]);
    assert.deepEqual(idPieces('fixedCapitalConsumptionBasis'), [
        'fixed',
        'Capital',
        'Consumption',
        'Basis',
    ]);
    // A run of capitals or digits stays whole.
    assert.deepEqual(idPieces('IDSCreditorTypeRDB'), ['IDSCreditor', 'Type', 'RDB']);
    assert.deepEqual(idPieces('CurrencyUSD'), ['Currency', 'USD']);
    assert.equal(idPieces('a_bC/c.d').join(''), 'a_bC/c.d');
});
