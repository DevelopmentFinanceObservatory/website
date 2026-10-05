/**
 * `/api/search/resolve` resolution for "ODA from the World Bank" (golden
 * ent-04), built by dfo-apis' own `build_no_data_part` and `make_response`
 * (src/search/engine/assemble.py, envelope.py), so its sentence plans are the
 * renderer's output. One `no_data` part with reason `entity_ambiguous`.
 *
 * "World Bank" names both the International Bank for Reconstruction and
 * Development and the International Development Association. The composed
 * `sentence_plan` carries the wording as a `slot` token with `role` origin,
 * no `axis`, no `entity_refs` and `part_index` 0, the token the site hangs
 * the candidate menu on.
 */

export const worldBankAmbiguous: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "ODA from the World Bank",
    "normalized_query": "ODA from the World Bank",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "0000000000000000000000000000000000000000",
    "trace_id": "00000000000000000000000000000000",
    "warnings": [],
    "timing_ms": {
      "total": 2140
    }
  },
  "kind": "resolution",
  "parts": [
    {
      "variable_text": "ODA",
      "warnings": [],
      "rendered_sentence": "\"World Bank\" matches more than one entity: \"International Bank for Reconstruction and Development\" and \"International Development Association\". Be more specific.",
      "sentence_plan": [
        {
          "kind": "text",
          "text": "\"",
          "entity_refs": []
        },
        {
          "kind": "slot",
          "text": "World Bank",
          "role": "origin",
          "entity_refs": []
        },
        {
          "kind": "text",
          "text": "\" matches more than one entity: \"International Bank for Reconstruction and Development\" and \"International Development Association\". Be more specific.",
          "entity_refs": []
        }
      ],
      "restatement": {
        "variable_text": "ODA",
        "entities": [
          {
            "text": "World Bank",
            "role_text": "from"
          }
        ],
        "operations": []
      },
      "operations": [],
      "status": "no_data",
      "no_data": {
        "reason": "entity_ambiguous",
        "category": "unresolved",
        "entity_terms": [
          "World Bank"
        ],
        "ambiguous_entities": [
          {
            "text": "World Bank",
            "candidates": [
              {
                "dcid": "InternationalBankForReconstructionAndDevelopment",
                "label": "International Bank for Reconstruction and Development",
                "kind": "organisation"
              },
              {
                "dcid": "InternationalDevelopmentAssociation",
                "label": "International Development Association",
                "kind": "organisation"
              }
            ]
          }
        ],
        "unbound_qualifiers": [],
        "data_query": {
          "kind": "parsed",
          "parts": [
            {
              "variable_text": "ODA",
              "entities": [
                {
                  "text": "World Bank",
                  "role_text": "from"
                }
              ],
              "operations": []
            }
          ],
          "raw_query": "ODA from the World Bank"
        }
      }
    }
  ],
  "rendered_sentence": "\"World Bank\" matches more than one entity: \"International Bank for Reconstruction and Development\" and \"International Development Association\". Be more specific.",
  "sentence_plan": [
    {
      "kind": "text",
      "text": "\"",
      "entity_refs": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "World Bank",
      "role": "origin",
      "entity_refs": [],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": "\" matches more than one entity: \"International Bank for Reconstruction and Development\" and \"International Development Association\". Be more specific.",
      "entity_refs": [],
      "part_index": 0
    }
  ],
  "status": "no_data"
};
