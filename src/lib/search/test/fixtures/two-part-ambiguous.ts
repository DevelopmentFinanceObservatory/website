/* eslint-disable @typescript-eslint/no-explicit-any -- reads the raw wire envelopes of other fixtures */
/**
 * A two-part `/api/search/resolve` resolution for "Population of Kenya in
 * 2020 and ODA to Congo from France in 2022": part 0 definite, part 1
 * `no_data` with reason `entity_ambiguous`.
 *
 * Built from definite-single.ts (its part, verbatim) and
 * entity-ambiguous.ts (its part, verbatim).
 */

import { definiteSingle } from './definite-single.ts';
import { entityAmbiguous } from './entity-ambiguous.ts';

const definite = definiteSingle as any;
const ambiguous = entityAmbiguous as any;
const query = 'Population of Kenya in 2020 and ODA to Congo from France in 2022';

export const twoPartAmbiguous: unknown = {
  "schema_version": definite.schema_version,
  "kind": "resolution",
  "query_echo": {
    ...definite.query_echo,
    "raw_query": query,
    "normalized_query": query
  },
  "diagnostics": definite.diagnostics,
  "parts": [definite.parts[0], ambiguous.parts[0]],
  "status": "mixed"
};
