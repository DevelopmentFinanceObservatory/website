/**
 * Hand-written `/api/search/resolve` resolution in the wire's shape
 * (dfo-apis src/search/models): query "ODA to Congo from France in 2022",
 * one `no_data` part with reason `entity_ambiguous`.
 *
 * "Congo" names both the Democratic Republic of the Congo and the Republic
 * of the Congo. `no_data.data_query` is the part's parsed form with France
 * pinned and Congo's dcid left empty, ready for a pick to fill. The part
 * omits `operations`, which the wire allows, so normalization must default
 * it to empty.
 */

export const entityAmbiguous: unknown = {
  "schema_version": 1,
  "kind": "resolution",
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "ODA to Congo from France in 2022",
    "normalized_query": "ODA to Congo from France in 2022",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "0000000000000000000000000000000000000000",
    "trace_id": "00000000000000000000000000000000",
    "warnings": [],
    "timing_ms": {
      "total": 2210
    }
  },
  "parts": [
    {
      "variable_text": "ODA",
      "warnings": [],
      "rendered_sentence": "More than one place matches \"Congo\": Congo [DRC] or Congo [Republic].",
      "restatement": {
        "variable_text": "ODA",
        "entities": [
          {
            "text": "Congo",
            "role_text": "to"
          },
          {
            "text": "France",
            "role_text": "from"
          }
        ],
        "time_text": "2022"
      },
      "status": "no_data",
      "no_data": {
        "reason": "entity_ambiguous",
        "entity_terms": [
          "Congo"
        ],
        "ambiguous_entities": [
          {
            "text": "Congo",
            "candidates": [
              {
                "dcid": "country/COD",
                "label": "Congo [DRC]",
                "kind": "country"
              },
              {
                "dcid": "country/COG",
                "label": "Congo [Republic]",
                "kind": "country"
              }
            ]
          }
        ],
        "data_query": {
          "kind": "parsed",
          "parts": [
            {
              "variable_text": "ODA",
              "entities": [
                {
                  "text": "Congo",
                  "role_text": "to"
                },
                {
                  "text": "France",
                  "role_text": "from",
                  "dcid": "country/FRA"
                }
              ],
              "time_text": "2022"
            }
          ],
          "raw_query": "ODA to Congo from France in 2022"
        },
        "unbound_qualifiers": [],
        "nearest_real": null,
        "flagged_match": null
      }
    }
  ],
  "status": "no_data"
};
