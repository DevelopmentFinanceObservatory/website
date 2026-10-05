import assert from 'node:assert/strict';
import test from 'node:test';

import { originLine } from '../dataCommons.ts';

const DFO = { id: 'dfo', label: 'Development Finance Observatory' } as const;
const BASE = { id: 'base', label: 'Data Commons by Google' } as const;
const UN = { id: 'un_system', label: 'UN System Data Commons' } as const;

const worldBank = { ref: 'dc/s/WorldBank', label: 'World Bank' };
const unicef = { ref: 'undata/p/UNICEF', label: "United Nations Children's Fund (UNICEF)" };
const oecd = { ref: 'dc/s/OECD', label: 'OECD' };

test('an upstream Dataset credits its publisher via its Data Commons', () => {
    assert.equal(
        originLine('dc/d/WorldBank_WorldDevelopmentIndicators', worldBank, BASE),
        'World Bank via Data Commons by Google',
    );
});

test("a UN agency's provenance is its own publisher, so the line keeps the origin alone", () => {
    assert.equal(originLine(unicef.ref, unicef, UN), 'via UN System Data Commons');
});

test("DFO's own data credits the publisher alone", () => {
    assert.equal(originLine('provenance/OECDCreditorReportingSystem', oecd, DFO), 'OECD');
});

test('a publisher known only by name is kept, and nothing left is null', () => {
    assert.equal(originLine('dc/d/Kenya_Census', { label: 'Kenya NBS' }, null), 'Kenya NBS');
    assert.equal(
        originLine(null, unicef, UN),
        "United Nations Children's Fund (UNICEF) via UN System Data Commons",
    );
    assert.equal(originLine(unicef.ref, unicef, DFO), null);
    assert.equal(originLine('dc/d/X', null, null), null);
});

test('a publisher whose label equals the card title is dropped', () => {
    const budget = { ref: 'dc/s/SouthAfricaBudget', label: 'South Africa Budget' };
    assert.equal(
        originLine('dc/d/Budget', budget, BASE, ' south africa budget '),
        'via Data Commons by Google',
    );
    assert.equal(
        originLine('dc/d/Budget', budget, BASE, 'Other'),
        'South Africa Budget via Data Commons by Google',
    );
});
