/* eslint-disable @typescript-eslint/no-explicit-any -- reads the raw wire envelope of another fixture */
/**
 * A `/api/search/resolve` resolution for "Top 5 donors of ODA for malaria
 * control to Kenya since 2015": one definite part carrying a `rank`
 * operation over `origin`, the ranking search leaves to Studio. The donor
 * axis stays open, so the part's data covers every donor.
 *
 * Built from crs-hierarchical-purpose.ts: the part's spec is that capture's
 * definite spec, verbatim.
 */

import { crsHierarchicalPurpose } from './crs-hierarchical-purpose.ts';

const source = crsHierarchicalPurpose as any;
const [sourcePart] = source.parts;
const query = 'Top 5 donors of ODA for malaria control to Kenya since 2015';

export const definiteRankOperation: unknown = {
  "schema_version": source.schema_version,
  "kind": "resolution",
  "query_echo": {
    ...source.query_echo,
    "raw_query": query,
    "normalized_query": query
  },
  "diagnostics": source.diagnostics,
  "parts": [
    {
      "variable_text": sourcePart.variable_text,
      "warnings": [],
      "restatement": sourcePart.restatement,
      "operations": [
        {
          "verb": "rank",
          "phrase": "top 5 donors",
          "over": "origin"
        }
      ],
      "status": "definite",
      "spec": sourcePart.spec
    }
  ],
  "status": "definite"
};
