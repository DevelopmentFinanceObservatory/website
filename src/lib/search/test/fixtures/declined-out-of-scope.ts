/**
 * Hand-written `/api/search/resolve` body in the wire's `DeclinedAnswer`
 * shape (dfo-apis src/search/models): query "What's the temperature in
 * Guatemala City right now?", declined `out_of_scope`.
 *
 * A declined answer carries no parts and no message. `scope.place` is null
 * because Guatemala City is a city, and scope names a confirmed country
 * only.
 */

export const declinedOutOfScope: unknown = {
  "schema_version": 1,
  "kind": "declined",
  "reason": "out_of_scope",
  "scope": {
    "place": null
  },
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "What's the temperature in Guatemala City right now?",
    "normalized_query": "What's the temperature in Guatemala City right now?",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "0000000000000000000000000000000000000000",
    "trace_id": "00000000000000000000000000000000",
    "warnings": [],
    "timing_ms": {
      "total": 812,
      "by_step": {
        "extract": 790
      }
    }
  }
};
