/**
 * Fixture registry: `/api/search/resolve` responses used as unit-test input
 * for src/lib/search. Never imported by runtime code — the app always talks
 * to the live search engine.
 *
 * Every entry is the raw wire body (pre-`normalizeResponse`/`flattenSpec`),
 * the same shape searchClient.ts receives over the wire, so the suite
 * exercises the site's own parsing rather than a pre-flattened stand-in.
 *
 * Most are real captures, trimmed for size; the rest are built from them
 * or written to the wire's shape (see each file's header).
 * scripts/check-search-fixtures.mts validates every one against the API's
 * models.
 */

import { definiteSingle } from './definite-single.ts';
import { multiCandidate } from './multi-candidate.ts';
import { broadTruncated } from './broad-truncated.ts';
import { crsHierarchicalPurpose } from './crs-hierarchical-purpose.ts';
import { methodBound } from './method-bound.ts';
import { methodUnbound } from './method-unbound.ts';
import { declinedOutOfScope } from './declined-out-of-scope.ts';
import { catalogueKenya } from './catalogue-kenya.ts';
import { definiteRankOperation } from './definite-rank-operation.ts';
import { definiteExplainEdited, definiteExplainOperation } from './definite-explain-operation.ts';
import { entityAmbiguous } from './entity-ambiguous.ts';
import { twoPartAmbiguous } from './two-part-ambiguous.ts';
import { worldBankAmbiguous } from './world-bank-ambiguous.ts';
import { regionGroup } from './region-group.ts';
import {
    servedAid,
    servedAidSector,
    servedDebt,
    servedGdp,
    servedHealth,
    servedMulti,
} from './served-options.ts';
import {
    unitAid,
    unitAidEuroConstant,
    unitAidLoans,
    unitDebt,
    unitHealth,
} from './unit-conversion.ts';

export type FixtureName =
    | 'definite-single'
    | 'multi-candidate'
    | 'broad-truncated'
    | 'crs-hierarchical-purpose'
    | 'method-unbound'
    | 'method-bound'
    | 'declined-out-of-scope'
    | 'catalogue-kenya'
    | 'definite-rank-operation'
    | 'definite-explain-operation'
    | 'definite-explain-edited'
    | 'region-group'
    | 'entity-ambiguous'
    | 'two-part-ambiguous'
    | 'world-bank-ambiguous'
    | 'served-aid'
    | 'served-aid-sector'
    | 'served-debt'
    | 'served-gdp'
    | 'served-health'
    | 'served-multi'
    | 'unit-aid'
    | 'unit-aid-euro-constant'
    | 'unit-debt'
    | 'unit-health'
    | 'unit-aid-loans';

export const fixtures: Record<FixtureName, unknown> = {
    'definite-single': definiteSingle,
    'multi-candidate': multiCandidate,
    'broad-truncated': broadTruncated,
    'crs-hierarchical-purpose': crsHierarchicalPurpose,
    'method-unbound': methodUnbound,
    'method-bound': methodBound,
    'declined-out-of-scope': declinedOutOfScope,
    'catalogue-kenya': catalogueKenya,
    'definite-rank-operation': definiteRankOperation,
    'definite-explain-operation': definiteExplainOperation,
    'definite-explain-edited': definiteExplainEdited,
    'region-group': regionGroup,
    'entity-ambiguous': entityAmbiguous,
    'two-part-ambiguous': twoPartAmbiguous,
    'world-bank-ambiguous': worldBankAmbiguous,
    'served-aid': servedAid,
    'served-aid-sector': servedAidSector,
    'served-debt': servedDebt,
    'served-gdp': servedGdp,
    'served-health': servedHealth,
    'served-multi': servedMulti,
    'unit-aid': unitAid,
    'unit-aid-euro-constant': unitAidEuroConstant,
    'unit-debt': unitDebt,
    'unit-health': unitHealth,
    'unit-aid-loans': unitAidLoans,
};

export const fixtureNames = Object.keys(fixtures) as FixtureName[];

/** The fixtures whose parts carry at least one spec, which the spec
 *  invariants in fixtures.test.ts run over. */
export const specFixtureNames: FixtureName[] = [
    'definite-single',
    'multi-candidate',
    'broad-truncated',
    'crs-hierarchical-purpose',
    'definite-rank-operation',
    'method-unbound',
    'method-bound',
    'definite-explain-operation',
    'definite-explain-edited',
    'region-group',
    'served-aid',
    'served-aid-sector',
    'served-debt',
    'served-gdp',
    'served-health',
    'served-multi',
    'unit-aid',
    'unit-aid-euro-constant',
    'unit-debt',
    'unit-health',
    'unit-aid-loans',
];

export {
    definiteSingle,
    multiCandidate,
    broadTruncated,
    crsHierarchicalPurpose,
    methodUnbound,
    methodBound,
    declinedOutOfScope,
    catalogueKenya,
    definiteRankOperation,
    definiteExplainOperation,
    definiteExplainEdited,
    entityAmbiguous,
    twoPartAmbiguous,
    worldBankAmbiguous,
    regionGroup,
};
