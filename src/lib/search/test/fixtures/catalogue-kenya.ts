/**
 * Hand-written `/api/search/resolve` body in the wire's `CatalogueAnswer`
 * shape (dfo-apis src/search/models): query "What data do you have on
 * Kenya?", scoped to Kenya.
 *
 * A catalogue answer carries no parts. `scope.place` is the country the
 * query named, confirmed by the resolver.
 */

export const catalogueKenya: unknown = {
  "schema_version": 1,
  "kind": "catalogue",
  "scope": {
    "place": {
      "dcid": "country/KEN",
      "label": "Kenya"
    }
  },
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "What data do you have on Kenya?",
    "normalized_query": "What data do you have on Kenya?",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "0000000000000000000000000000000000000000",
    "trace_id": "00000000000000000000000000000000",
    "warnings": [],
    "timing_ms": {
      "total": 903,
      "by_step": {
        "extract": 760
      }
    }
  }
};
