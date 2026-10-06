/**
 * Real `/api/search/resolve` response from dfo-apis branch
 * feat/answer-edit-routes (commit b14dbb031), captured 2026-10-04 from a
 * local server with observations on: query "Population of Kenya in 2020".
 *
 * A single-part `definite` answer: exactly one resolved StatVar
 * (`resolved.stat_vars.served_count === 1`), and a byline source token that
 * states "source:".
 *
 * Trimmed for size; each body still validates against the API's models
 * (scripts/check-search-fixtures.mts). `slot_values` and
 * `open_axis_facts[].values` keep two, the specs' own `sentence_plan` is
 * dropped (the envelope's stays), `trace.slot_filters` is empty, and
 * timings keep their totals. The server omits a `unit_conversion` currency's
 * `current_years` when it is null, which its own model requires; this
 * file writes the null.
 * The spec's `observations` are dropped.
 *
 * The capture's StatVar lists are folded into the current wire: each
 * `stat_vars` carries counts and a date range (`served_count` is the listed members'
 * count, or `member_count` where the list was cut and exact, and
 * `data_date_range` spans the listed members), each related measure its
 * StatVar as `stat_var`, and `trace.resolved_stat_vars` is gone.
 */

export const definiteSingle: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "Population of Kenya in 2020",
    "normalized_query": "Population of Kenya in 2020",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "d39792cbff5a42a1b1f3e0d5f7282c99",
    "warnings": [],
    "timing_ms": {
      "total": 10363
    },
    "llm_usage": {
      "input_tokens": 0,
      "output_tokens": 0,
      "cached_tokens": 0
    },
    "timed_out": false
  },
  "kind": "resolution",
  "parts": [
    {
      "variable_text": "population",
      "warnings": [],
      "timing_ms": {
        "total": 2178
      },
      "restatement": {
        "variable_text": "population",
        "entities": [
          {
            "text": "Kenya"
          }
        ],
        "time_text": "2020",
        "operations": []
      },
      "operations": [],
      "departures": [],
      "status": "definite",
      "spec": {
        "spec_id": "spec_169304e0963fceebb643825ae25a745c",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_169304e0963fceebb643825ae25a745c",
          "identity": {
            "identity_version": "spec1",
            "shape": {
              "kind": "statvar_schema",
              "population_type": "Person",
              "measured_property": "count",
              "stat_type": "measuredValue"
            },
            "slots": [
              {
                "property": "age",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "employment",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "employmentStatus",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "gender",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "maritalStatus",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "nativity",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "placeOfBirth",
                "binding": {
                  "state": "unbound"
                }
              }
            ],
            "entities": {
              "observationAbout": [
                "country/KEN"
              ]
            },
            "requested_window": {
              "kind": "range",
              "start_year": 2020,
              "end_year": 2020
            }
          }
        },
        "resolved": {
          "shape": {
            "shape_id": "person_count_measuredvalue",
            "label": "Total population",
            "population_type": {
              "dcid": "Person",
              "label": "Person"
            },
            "measured_property": {
              "dcid": "count",
              "label": "count"
            },
            "stat_type": {
              "dcid": "measuredValue",
              "label": "measuredValue"
            },
            "measurement_denominator_unresolved": false,
            "slot_keys": [
              {
                "axis": "how",
                "property": {
                  "dcid": "age",
                  "label": "age"
                },
                "label": "age"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "maritalStatus",
                  "label": "maritalStatus"
                },
                "label": "marital status"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "gender",
                  "label": "gender"
                },
                "label": "gender"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "placeOfBirth",
                  "label": "placeOfBirth"
                },
                "label": "place of birth"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "nativity",
                  "label": "nativity"
                },
                "label": "nativity"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "employment",
                  "label": "employment"
                },
                "label": "employment"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "employmentStatus",
                  "label": "employmentStatus"
                },
                "label": "employment status"
              },
              {
                "axis": "where",
                "label": "place"
              },
              {
                "axis": "when",
                "label": "time window"
              },
              {
                "axis": "source",
                "label": "data source"
              }
            ],
            "member_count": 493,
            "refine_supported": true,
            "data_commons": [
              {
                "id": "base",
                "label": "Data Commons by Google"
              }
            ]
          },
          "slots": [
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "age",
                  "label": "age"
                },
                "label": "age"
              },
              "binding": {
                "kind": "unbound"
              },
              "summable": false
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "maritalStatus",
                  "label": "maritalStatus"
                },
                "label": "marital status"
              },
              "binding": {
                "kind": "unbound"
              },
              "summable": false
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "gender",
                  "label": "gender"
                },
                "label": "gender"
              },
              "binding": {
                "kind": "unbound"
              },
              "summable": false
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "placeOfBirth",
                  "label": "placeOfBirth"
                },
                "label": "place of birth"
              },
              "binding": {
                "kind": "unbound"
              },
              "summable": false
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "nativity",
                  "label": "nativity"
                },
                "label": "nativity"
              },
              "binding": {
                "kind": "unbound"
              },
              "summable": false
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "employment",
                  "label": "employment"
                },
                "label": "employment"
              },
              "binding": {
                "kind": "unbound"
              },
              "summable": false
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "employmentStatus",
                  "label": "employmentStatus"
                },
                "label": "employment status"
              },
              "binding": {
                "kind": "unbound"
              },
              "summable": false
            },
            {
              "key": {
                "axis": "where",
                "label": "place"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "dcid": "country/KEN",
                    "label": "Kenya"
                  },
                  "value_kind": "entity"
                }
              },
              "summable": false
            },
            {
              "key": {
                "axis": "when",
                "label": "time window"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "value_kind": "time_window",
                  "time_window": {
                    "start_year": 2020,
                    "end_year": 2020
                  }
                }
              },
              "summable": false
            },
            {
              "key": {
                "axis": "source",
                "label": "data source"
              },
              "binding": {
                "kind": "unbound"
              },
              "summable": false
            }
          ],
          "inapplicable_slots": [
            "age",
            "maritalStatus",
            "gender",
            "placeOfBirth",
            "nativity",
            "employment",
            "employmentStatus"
          ],
          "unresolved_slots": [],
          "stat_vars": {
            "member_count": 1,
            "member_count_exact": false,
            "served_count": 1,
            "data_date_range": {
              "start": "2020",
              "end": "2020"
            }
          },
          "entities": [
            {
              "ref": "country/KEN",
              "label": "Kenya",
              "entity_type": "Country",
              "role": "observationAbout"
            }
          ],
          "coverage": {
            "kind": "exact",
            "has_data": true,
            "observation_count": 1,
            "evidence": "observed",
            "dimensions": [
              {
                "label": "sources",
                "count": 1
              },
              {
                "label": "observations",
                "count": 1
              },
              {
                "label": "variables",
                "count": 1
              }
            ],
            "window": {
              "start_year": 2020,
              "end_year": 2020
            }
          },
          "download": {
            "rows": 1,
            "rows_exact": true,
            "series": 1,
            "window": {
              "start_year": 2020,
              "end_year": 2020
            },
            "licence": {
              "label": "Creative Commons Attribution License"
            }
          },
          "facets": {
            "provenance": {
              "basis": "fallback",
              "ref": "dc/base/WorldDevelopmentIndicators",
              "label": "World Development Indicators",
              "source": {
                "ref": "dc/s/WorldBank",
                "label": "World Bank"
              },
              "data_commons": {
                "id": "base",
                "label": "Data Commons by Google"
              }
            }
          },
          "slot_options": [
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "age",
                  "label": "age"
                },
                "label": "age"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "Years0To4",
                      "label": "Years 0 To 4"
                    },
                    "value_kind": "enum_value"
                  }
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "gender",
                  "label": "gender"
                },
                "label": "gender"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "Female",
                      "label": "Female"
                    },
                    "value_kind": "enum_value"
                  }
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "Male",
                      "label": "Male"
                    },
                    "value_kind": "enum_value"
                  }
                }
              ],
              "truncated": true,
              "source": "observed"
            }
          ],
          "entity_options": [],
          "facet_options": [],
          "rendered_sentence": "Kenya's total population in 2020. World Development Indicators.",
          "trace": {
            "resolved_entities": [
              {
                "dcid": "country/KEN",
                "label": "Kenya"
              }
            ],
            "resolved_sources": [
              {
                "dcid": "dc/base/WorldDevelopmentIndicators",
                "label": "World Development Indicators",
                "source": {
                  "ref": "dc/s/WorldBank",
                  "label": "World Bank"
                },
                "data_commons": {
                  "id": "base",
                  "label": "Data Commons by Google"
                }
              }
            ],
            "slot_filters": [],
            "query_qualifiers": [],
            "requested_window": {
              "start_year": 2020,
              "end_year": 2020
            },
            "capability_version": "cap_cbe83b130f0e8d02",
            "default_reading": {
              "applied": true,
              "removed_stat_vars": []
            }
          },
          "confidence": "high",
          "available_at_place": true,
          "measure_label_axes": [],
          "measure_axis_values": [],
          "related_group": {
            "dcid": "dc/g/Demographics",
            "label": "Demographics"
          },
          "related_measures": [
            {
              "stat_var": {
                "dcid": "GrowthRate_Count_Person",
                "label": "Rate of Population Growth"
              },
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_c1dec554843efb3e7b51d23ed9edd644",
                "identity": {
                  "identity_version": "spec1",
                  "shape": {
                    "kind": "statvar_schema",
                    "population_type": "Person",
                    "measured_property": "count",
                    "stat_type": "growthRate"
                  },
                  "slots": [],
                  "entities": {
                    "observationAbout": [
                      "country/KEN"
                    ]
                  },
                  "requested_window": {
                    "kind": "range",
                    "start_year": 2020,
                    "end_year": 2020
                  }
                }
              }
            },
            {
              "stat_var": {
                "dcid": "LifeExpectancy_Person",
                "label": "Life Expectancy"
              },
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_fad6bc0156bb9e2474c4bf216c8803c9",
                "identity": {
                  "identity_version": "spec1",
                  "shape": {
                    "kind": "statvar_schema",
                    "population_type": "Person",
                    "measured_property": "lifeExpectancy",
                    "stat_type": "measuredValue"
                  },
                  "slots": [],
                  "entities": {
                    "observationAbout": [
                      "country/KEN"
                    ]
                  },
                  "requested_window": {
                    "kind": "range",
                    "start_year": 2020,
                    "end_year": 2020
                  }
                }
              }
            }
          ]
        }
      }
    }
  ],
  "rendered_sentence": "Kenya's total population in 2020. World Development Indicators.",
  "sentence_plan": [
    {
      "kind": "slot",
      "text": "Kenya",
      "axis": "where",
      "segment": "heading",
      "binding_ref": "where:",
      "entity_refs": [],
      "states": [
        "where:"
      ],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": "'s",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": " ",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "total population",
      "axis": "what",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "age",
      "binding_ref": "how:age",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "employment",
      "binding_ref": "how:employment",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "employmentStatus",
      "binding_ref": "how:employmentStatus",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "gender",
      "binding_ref": "how:gender",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "maritalStatus",
      "binding_ref": "how:maritalStatus",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "nativity",
      "binding_ref": "how:nativity",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "placeOfBirth",
      "binding_ref": "how:placeOfBirth",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": " ",
      "segment": "heading",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "slot",
      "text": "in 2020",
      "axis": "when",
      "segment": "heading",
      "binding_ref": "when:",
      "entity_refs": [],
      "states": [
        "when:"
      ]
    },
    {
      "kind": "text",
      "text": ".",
      "segment": "heading",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "text",
      "text": " ",
      "segment": "byline",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "slot",
      "text": "World Development Indicators",
      "axis": "source",
      "segment": "byline",
      "entity_refs": [],
      "states": [
        "source:"
      ]
    },
    {
      "kind": "text",
      "text": ".",
      "segment": "byline",
      "entity_refs": [],
      "states": []
    }
  ],
  "status": "definite"
};
