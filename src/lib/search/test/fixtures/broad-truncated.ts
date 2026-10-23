/**
 * Real `/api/search/resolve` response from dfo-apis branch
 * feat/answer-edit-routes (commit b14dbb031), captured 2026-10-04 from a
 * local server with observations on: query "ODA to Kenya since 2015".
 *
 * A single-part `definite` answer over a broad StatVar set: it serves all
 * 1106 members (`served_count: 1106`). The part carries the
 * `role_scope_defaulted` and `observations_series_truncated` warnings.
 * Its open provider role, the one assumption, was added to the part's
 * `assumptions` and as the envelope sentence's closing clause (" Assumed:
 * every donor."), in the shape dfo-apis' render/assumptions.py writes.
 *
 * Trimmed for size; each body still validates against the API's models
 * (scripts/check-search-fixtures.mts). `slot_values` and
 * `open_axis_facts[].values` keep two, the specs' own `sentence_plan` is
 * dropped (the envelope's stays), `trace.slot_filters` is empty, and
 * timings keep their totals. The server omits a `unit_conversion` currency's
 * `current_years` when it is null, which its own model requires; this
 * file writes the null.
 * The spec's `observations` are dropped.
 * Option and alternative-measure counts (`served_rows`, `served_rows_exact`)
 * were read with the same requests.
 *
 * The capture's StatVar lists are folded into the current wire: each
 * `stat_vars` carries counts and a date range (`served_count` is the listed members'
 * count, or `member_count` where the list was cut and exact, and
 * `data_date_range` spans the listed members), each related measure its
 * StatVar as `stat_var`, and `trace.resolved_stat_vars` is gone.
 *
 * Each `headline.recent_years` was added later: its first entry restates the
 * headline's own counts, and the two years before it come from the same
 * identity resubmitted (`dataset_resubmit`) to the dev API at commit
 * 0f4b6e04e on 2026-10-12, whose headline matched this one.
 */

export const broadTruncated: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "ODA to Kenya since 2015",
    "normalized_query": "ODA to Kenya since 2015",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "aa6527fa98784b238a8a6a56a1274573",
    "warnings": [],
    "timing_ms": {
      "total": 3457
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
      "variable_text": "ODA",
      "warnings": [
        {
          "code": "role_scope_defaulted",
          "severity": "warn",
          "message": "no provider was named; the answer was resolved across every provider with data."
        },
        {
          "code": "observations_series_truncated",
          "severity": "warn",
          "message": "showing 20 of 4270 confirmed series (a stable, identity-ordered selection, not ranked by value); the rest are not shown.",
          "spec_id": "spec_7c8a3bcf9c627393f5b9c2177d96174f",
          "params": {
            "shown": 20,
            "total": 4270
          }
        }
      ],
      "timing_ms": {
        "total": 2895
      },
      "restatement": {
        "variable_text": "ODA",
        "entities": [
          {
            "text": "Kenya",
            "role_text": "to"
          }
        ],
        "time_text": "since 2015",
        "operations": []
      },
      "operations": [],
      "departures": [],
      "assumptions": [
        {
          "kind": "open_role",
          "binding_ref": "origin:",
          "refs": [],
          "text": "every donor"
        }
      ],
      "status": "definite",
      "spec": {
        "spec_id": "spec_7c8a3bcf9c627393f5b9c2177d96174f",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_7c8a3bcf9c627393f5b9c2177d96174f",
          "identity": {
            "identity_version": "spec1",
            "shape": {
              "kind": "statvar_schema",
              "population_type": "FinancialFlow",
              "measured_property": "amount",
              "stat_type": "measuredValue",
              "measurement_qualifier": "Nominal"
            },
            "slots": [
              {
                "property": "crsCooperationModality",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "crsPurpose",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "crsTypeOfFinance",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "crsTypeOfFlow",
                "binding": {
                  "state": "value",
                  "ref": "CRSTypeOfFlow10"
                }
              },
              {
                "property": "financialFlowType",
                "binding": {
                  "state": "value",
                  "ref": "Disbursement"
                }
              },
              {
                "property": "nettingBasis",
                "binding": {
                  "state": "value",
                  "ref": "Gross"
                }
              }
            ],
            "entities": {
              "destination": [
                "country/KEN"
              ]
            },
            "requested_window": {
              "kind": "range",
              "start_year": 2015
            }
          }
        },
        "resolved": {
          "shape": {
            "shape_id": "financialflow_amount_measuredvalue_nominal",
            "label": "gross disbursements (official development assistance)",
            "population_type": {
              "ref": "FinancialFlow",
              "label": "financial flow"
            },
            "measured_property": {
              "ref": "amount",
              "label": "amount"
            },
            "stat_type": {
              "ref": "measuredValue",
              "label": "measuredValue"
            },
            "measurement_qualifier": {
              "ref": "Nominal",
              "label": "Nominal"
            },
            "measurement_denominator_unresolved": false,
            "slot_keys": [
              {
                "axis": "how",
                "property": {
                  "ref": "crsCooperationModality",
                  "label": "CRS cooperation modality"
                },
                "label": "modality"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "crsPurpose",
                  "label": "CRS purpose"
                },
                "label": "sector"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "crsTypeOfFinance",
                  "label": "CRS type of finance"
                },
                "label": "instrument"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "crsTypeOfFlow",
                  "label": "CRS type of flow"
                },
                "label": "flow"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "financialFlowType",
                  "label": "financial flow type"
                },
                "label": "financial flow type"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "nettingBasis",
                  "label": "netting basis"
                },
                "label": "netting basis"
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
            "member_count": 3687,
            "member_digest": "a7115fa9b30afef48979db31549005a0cd84c73758f339a615ef3ff98aa37930",
            "refine_supported": true,
            "data_commons": [
              {
                "id": "dfo",
                "label": "Development Finance Observatory"
              }
            ]
          },
          "slots": [
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "crsCooperationModality",
                  "label": "CRS cooperation modality"
                },
                "label": "modality"
              },
              "binding": {
                "kind": "unbound"
              },
              "summable": true
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "crsPurpose",
                  "label": "CRS purpose"
                },
                "label": "sector"
              },
              "binding": {
                "kind": "unbound"
              },
              "summable": true
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "crsTypeOfFinance",
                  "label": "CRS type of finance"
                },
                "label": "instrument"
              },
              "binding": {
                "kind": "unbound"
              },
              "summable": true
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "crsTypeOfFlow",
                  "label": "CRS type of flow"
                },
                "label": "flow"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "ref": "CRSTypeOfFlow10",
                    "label": "official development assistance"
                  },
                  "value_kind": "enum_value"
                }
              },
              "summable": true
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "financialFlowType",
                  "label": "financial flow type"
                },
                "label": "financial flow type"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "ref": "Disbursement",
                    "label": "disbursement"
                  },
                  "value_kind": "enum_value"
                }
              },
              "summable": false
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "nettingBasis",
                  "label": "netting basis"
                },
                "label": "netting basis"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "ref": "Gross",
                    "label": "gross"
                  },
                  "value_kind": "enum_value"
                }
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
                    "ref": "country/KEN",
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
                    "start_year": 2015,
                    "end_year": 2024
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
            "financialObligationType"
          ],
          "unresolved_slots": [],
          "stat_vars": {
            "member_count": 1106,
            "member_count_exact": true,
            "served_count": 1106,
            "data_date_range": {
              "start": "2024",
              "end": "2024"
            }
          },
          "entities": [
            {
              "ref": "country/KEN",
              "label": "Kenya",
              "entity_type": "Country",
              "role": "destination"
            }
          ],
          "coverage": {
            "kind": "exact",
            "has_data": true,
            "observation_count": 15640,
            "evidence": "observed",
            "dimensions": [
              {
                "label": "sources",
                "count": 1
              },
              {
                "label": "observations",
                "count": 10
              },
              {
                "label": "variables",
                "count": 1106
              }
            ],
            "window": {
              "start_year": 2015,
              "end_year": 2024
            }
          },
          "headline": {
            "year": 2024,
            "year_named": true,
            "named_window": {
              "start_year": 2015
            },
            "observations": 1852,
            "series": 1852,
            "role_counts": {
              "financingProvider": 75,
              "financingRecipient": 1
            },
            "recent_years": [
              {
                "year": 2024,
                "observations": 1852,
                "series": 1852,
                "role_counts": {
                  "financingProvider": 75,
                  "financingRecipient": 1
                }
              },
              {
                "year": 2023,
                "observations": 1748,
                "series": 1748,
                "role_counts": {
                  "financingProvider": 76,
                  "financingRecipient": 1
                }
              },
              {
                "year": 2022,
                "observations": 1709,
                "series": 1709,
                "role_counts": {
                  "financingProvider": 74,
                  "financingRecipient": 1
                }
              }
            ]
          },
          "download": {
            "rows": 15640,
            "rows_exact": true,
            "series": 4270,
            "window": {
              "start_year": 2015,
              "end_year": 2024
            },
            "licence": {
              "label": "OECD Terms and Conditions"
            }
          },
          "coverage_stamp": "7a081f21b36a988a91ddfa2d9a9df700",
          "facets": {
            "provenance": {
              "basis": "fallback",
              "ref": "provenance/OECDCreditorReportingSystem",
              "label": "OECD Creditor Reporting System (CRS)",
              "source": {
                "ref": "dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd",
                "label": "Organisation for Economic Co-operation and Development (OECD)"
              },
              "data_commons": {
                "id": "dfo",
                "label": "Development Finance Observatory"
              }
            },
            "unit": {
              "basis": "fallback",
              "ref": "CurrencyUSD",
              "label": "US Dollar",
              "currency": "USD"
            }
          },
          "slot_options": [
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "crsCooperationModality",
                  "label": "CRS cooperation modality"
                },
                "label": "modality"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityA",
                      "label": "budget support"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 294,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityA02",
                      "label": "sector budget support"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityA",
                  "member_count": 1658,
                  "served_rows": 275,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityA01",
                      "label": "general budget support"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityA",
                  "member_count": 289,
                  "served_rows": 19,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityB",
                      "label": "core contribution and pooled programme and fund"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 2310,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityB03",
                      "label": "contribution to specific-purpose programme and fund managed by an international organisation"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityB",
                  "member_count": 1606,
                  "served_rows": 870,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityB01",
                      "label": "core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityB",
                  "member_count": 1331,
                  "served_rows": 1310,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityB04",
                      "label": "basket fund and pooled funding"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityB",
                  "member_count": 709,
                  "served_rows": 130,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityC",
                      "label": "project-type intervention (group)"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 9912,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityC01",
                      "label": "project-type intervention"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityC",
                  "member_count": 7005,
                  "served_rows": 9912,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityD",
                      "label": "expert and other technical assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 2364,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityD02",
                      "label": "other technical assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityD",
                  "member_count": 1600,
                  "served_rows": 1385,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityD01",
                      "label": "donor country personnel"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityD",
                  "member_count": 976,
                  "served_rows": 979,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityE",
                      "label": "scholarship and student cost in donor country"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 607,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityE01",
                      "label": "scholarship and training in donor country"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityE",
                  "member_count": 819,
                  "served_rows": 543,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityE02",
                      "label": "imputed student cost"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityE",
                  "member_count": 315,
                  "served_rows": 64,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityF",
                      "label": "debt relief (group)"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 19,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityF01",
                      "label": "debt relief"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityF",
                  "member_count": 210,
                  "served_rows": 19,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityG",
                      "label": "other administrative cost (group)"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 103,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityG01",
                      "label": "other administrative cost"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityG",
                  "member_count": 454,
                  "served_rows": 103,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityH",
                      "label": "other in-donor expenditure"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 18,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityH01",
                      "label": "development awareness"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityH",
                  "member_count": 373,
                  "served_rows": 13,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSCooperationModalityH02",
                      "label": "refugee and asylum seeker in donor country"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityH",
                  "member_count": 48,
                  "served_rows": 5,
                  "served_rows_exact": true
                }
              ],
              "truncated": false,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "crsPurpose",
                  "label": "CRS purpose"
                },
                "label": "sector"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode998",
                      "label": "unallocated and unspecified"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 76,
                  "served_rows": 292,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode99810",
                      "label": "sectors not specified"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode998",
                  "member_count": 255,
                  "served_rows": 264,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode99820",
                      "label": "non-sector allocable promotion of development awareness"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode998",
                  "member_count": 77,
                  "served_rows": 28,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode600",
                      "label": "action relating to debt"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 21,
                  "served_rows": 18,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode60020",
                      "label": "debt forgiveness"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode600",
                  "member_count": 75,
                  "served_rows": 11,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode60040",
                      "label": "rescheduling and refinancing"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode600",
                  "member_count": 54,
                  "served_rows": 4,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode60062",
                      "label": "other debt swap"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode600",
                  "member_count": 21,
                  "served_rows": 3,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode100",
                      "label": "social infrastructure and services"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 13,
                  "served_rows": 8427,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode140",
                      "label": "water supply and sanitation"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 10,
                  "served_rows": 1037,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode110",
                      "label": "education"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 9,
                  "served_rows": 2049,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode160",
                      "label": "other social infrastructure and services"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 7,
                  "served_rows": 842,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode120",
                      "label": "health"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 6,
                  "served_rows": 1668,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode130",
                      "label": "population policy, programme, and reproductive health"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 5,
                  "served_rows": 618,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode150",
                      "label": "government and civil society"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 4,
                  "served_rows": 2213,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode200",
                      "label": "economic infrastructure and services"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 13,
                  "served_rows": 1742,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode240",
                      "label": "banking and financial services"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode200",
                  "member_count": 16,
                  "served_rows": 203,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode220",
                      "label": "communication system and technology"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode200",
                  "member_count": 13,
                  "served_rows": 214,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode250",
                      "label": "business environment and governance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode200",
                  "member_count": 13,
                  "served_rows": 292,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode210",
                      "label": "transport and storage"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode200",
                  "member_count": 7,
                  "served_rows": 360,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode230",
                      "label": "energy"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode200",
                  "member_count": 7,
                  "served_rows": 673,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode300",
                      "label": "productive sector"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 13,
                  "served_rows": 2780,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode310",
                      "label": "agriculture, forestry and fishing"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode300",
                  "member_count": 12,
                  "served_rows": 2044,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode320",
                      "label": "industry, mining and construction"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode300",
                  "member_count": 9,
                  "served_rows": 512,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode332",
                      "label": "tourism"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode300",
                  "member_count": 9,
                  "served_rows": 54,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode331",
                      "label": "trade policies and regulations"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode300",
                  "member_count": 7,
                  "served_rows": 170,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode400",
                      "label": "multisector"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 7,
                  "served_rows": 1505,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode430",
                      "label": "other multisector"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode400",
                  "member_count": 10,
                  "served_rows": 871,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode410",
                      "label": "general environment protection"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode400",
                  "member_count": 7,
                  "served_rows": 634,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode500",
                      "label": "commodity aid and general programme assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 5,
                  "served_rows": 109,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode510",
                      "label": "budget support"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode500",
                  "member_count": 3,
                  "served_rows": 20,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode520",
                      "label": "food assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode500",
                  "member_count": 3,
                  "served_rows": 76,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode530",
                      "label": "other commodity assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode500",
                  "member_count": 3,
                  "served_rows": 13,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode700",
                      "label": "humanitarian aid"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 5,
                  "served_rows": 671,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode720",
                      "label": "emergency response"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode700",
                  "member_count": 6,
                  "served_rows": 492,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode730",
                      "label": "reconstruction and rehabilitation"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode700",
                  "member_count": 3,
                  "served_rows": 54,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode740",
                      "label": "disaster preparedness"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode700",
                  "member_count": 0,
                  "served_rows": 125,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode910",
                      "label": "administrative costs of donors"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 4,
                  "served_rows": 91,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode91010",
                      "label": "non-sector allocable administrative costs"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode910",
                  "member_count": 77,
                  "served_rows": 91,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode930",
                      "label": "support for refugees and asylum seekers in donor countries"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 3,
                  "served_rows": 5,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSPurposeCode93010",
                      "label": "general support for refugees and asylum seekers in donor countries"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode930",
                  "member_count": 57,
                  "served_rows": 5,
                  "served_rows_exact": true
                }
              ],
              "truncated": false,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "crsTypeOfFinance",
                  "label": "CRS type of finance"
                },
                "label": "instrument"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance100",
                      "label": "grant"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 13583,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance110",
                      "label": "standard grant"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance100",
                  "member_count": 12672,
                  "served_rows": 13497,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance210",
                      "label": "interest subsidy"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance100",
                  "member_count": 430,
                  "served_rows": 86,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance420",
                      "label": "debt instrument"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 1986,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance421",
                      "label": "standard loan"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance420",
                  "member_count": 4620,
                  "served_rows": 1985,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance422",
                      "label": "reimbursable grant"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance420",
                  "member_count": 310,
                  "served_rows": 1,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance500",
                      "label": "equity and share in collective investment vehicle"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 53,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance510",
                      "label": "common equity"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance500",
                  "member_count": 1537,
                  "served_rows": 45,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance520",
                      "label": "share in collective investment vehicle"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance500",
                  "member_count": 916,
                  "served_rows": 8,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance600",
                      "label": "debt relief"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 18,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance610",
                      "label": "debt forgiveness of official development assistance claim on principal"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance600",
                  "member_count": 32,
                  "served_rows": 10,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance611",
                      "label": "debt forgiveness of official development assistance claim on interest"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance600",
                  "member_count": 32,
                  "served_rows": 4,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance620",
                      "label": "debt rescheduling of official development assistance claim on principal"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance600",
                  "member_count": 27,
                  "served_rows": 1,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFinance621",
                      "label": "debt rescheduling of official development assistance claim on interest"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance600",
                  "member_count": 22,
                  "served_rows": 3,
                  "served_rows_exact": true
                }
              ],
              "truncated": false,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "crsTypeOfFlow",
                  "label": "CRS type of flow"
                },
                "label": "flow"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFlow10",
                      "label": "official development assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 14098,
                  "served_rows": 15640,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFlow21",
                      "label": "non-export credit official flow"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 3798,
                  "served_rows": 594,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFlow30",
                      "label": "private development finance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 2711,
                  "served_rows": 1864,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "CRSTypeOfFlow60",
                      "label": "private sector instrument"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 1601,
                  "served_rows": 113,
                  "served_rows_exact": true
                }
              ],
              "truncated": false,
              "source": "observed"
            }
          ],
          "entity_options": [
            {
              "role": "origin",
              "options": [],
              "truncated": true,
              "source": "observed"
            }
          ],
          "facet_options": [],
          "rendered_sentence": "Gross ODA disbursements to Kenya from 86 donors, 2015 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
          "trace": {
            "resolved_entities": [
              {
                "ref": "country/KEN",
                "label": "Kenya"
              }
            ],
            "resolved_sources": [
              {
                "ref": "provenance/OECDCreditorReportingSystem",
                "label": "OECD Creditor Reporting System (CRS)",
                "source": {
                  "ref": "dc/s/OrganisationForEconomicCo-operationAndDevelopmentOecd",
                  "label": "Organisation for Economic Co-operation and Development (OECD)"
                },
                "data_commons": {
                  "id": "dfo",
                  "label": "Development Finance Observatory"
                }
              }
            ],
            "slot_filters": [],
            "query_qualifiers": [
              {
                "text": "ODA",
                "named": [
                  {
                    "ref": "CRSTypeOfFlow10",
                    "label": "official development assistance"
                  }
                ],
                "slot": "crsTypeOfFlow",
                "disposition": "bound"
              }
            ],
            "requested_window": {
              "start_year": 2015
            },
            "capability_version": "cap_cbe83b130f0e8d02",
            "default_reading": {
              "applied": true,
              "removed_stat_vars": []
            }
          },
          "confidence": "medium",
          "available_at_place": true,
          "alternative_measures": [
            {
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_9586df83a12af56d05a9c5718b42b12d",
                "identity": {
                  "identity_version": "spec1",
                  "shape": {
                    "kind": "statvar_schema",
                    "population_type": "FinancialFlow",
                    "measured_property": "amount",
                    "stat_type": "measuredValue",
                    "measurement_qualifier": "Nominal"
                  },
                  "slots": [
                    {
                      "property": "crsCooperationModality",
                      "binding": {
                        "state": "unbound"
                      }
                    },
                    {
                      "property": "crsPurpose",
                      "binding": {
                        "state": "unbound"
                      }
                    },
                    {
                      "property": "crsTypeOfFinance",
                      "binding": {
                        "state": "unbound"
                      }
                    },
                    {
                      "property": "crsTypeOfFlow",
                      "binding": {
                        "state": "value",
                        "ref": "CRSTypeOfFlow10"
                      }
                    },
                    {
                      "property": "financialFlowType",
                      "binding": {
                        "state": "value",
                        "ref": "Disbursement"
                      }
                    },
                    {
                      "property": "nettingBasis",
                      "binding": {
                        "state": "value",
                        "ref": "Net"
                      }
                    }
                  ],
                  "entities": {
                    "destination": [
                      "country/KEN"
                    ]
                  },
                  "requested_window": {
                    "kind": "range",
                    "start_year": 2015
                  }
                }
              },
              "label": "net disbursements",
              "axis": "what",
              "measure_axis_values": [
                {
                  "axis": "populationType",
                  "value": {
                    "ref": "FinancialFlow",
                    "label": "financial flow"
                  }
                },
                {
                  "axis": "measuredProperty",
                  "value": {
                    "ref": "amount",
                    "label": "amount"
                  }
                },
                {
                  "axis": "measurementQualifier",
                  "value": {
                    "ref": "Nominal",
                    "label": "nominal"
                  }
                },
                {
                  "axis": "financialFlowType",
                  "value": {
                    "ref": "Disbursement",
                    "label": "disbursement"
                  }
                },
                {
                  "axis": "nettingBasis",
                  "value": {
                    "ref": "Net",
                    "label": "net"
                  }
                }
              ],
              "served_rows": 16040,
              "served_rows_exact": true
            },
            {
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_6cae178b4f74dbef7a8581698cab835a",
                "identity": {
                  "identity_version": "spec1",
                  "shape": {
                    "kind": "statvar_schema",
                    "population_type": "FinancialObligation",
                    "measured_property": "amount",
                    "stat_type": "measuredValue",
                    "measurement_qualifier": "Nominal"
                  },
                  "slots": [
                    {
                      "property": "crsCooperationModality",
                      "binding": {
                        "state": "unbound"
                      }
                    },
                    {
                      "property": "crsPurpose",
                      "binding": {
                        "state": "unbound"
                      }
                    },
                    {
                      "property": "crsTypeOfFinance",
                      "binding": {
                        "state": "unbound"
                      }
                    },
                    {
                      "property": "crsTypeOfFlow",
                      "binding": {
                        "state": "value",
                        "ref": "CRSTypeOfFlow10"
                      }
                    },
                    {
                      "property": "financialObligationType",
                      "binding": {
                        "state": "value",
                        "ref": "Commitment"
                      }
                    }
                  ],
                  "entities": {
                    "destination": [
                      "country/KEN"
                    ]
                  },
                  "requested_window": {
                    "kind": "range",
                    "start_year": 2015
                  }
                }
              },
              "label": "commitments",
              "axis": "what",
              "measure_axis_values": [
                {
                  "axis": "populationType",
                  "value": {
                    "ref": "FinancialObligation",
                    "label": "financial obligation"
                  }
                },
                {
                  "axis": "measuredProperty",
                  "value": {
                    "ref": "amount",
                    "label": "amount"
                  }
                },
                {
                  "axis": "measurementQualifier",
                  "value": {
                    "ref": "Nominal",
                    "label": "nominal"
                  }
                },
                {
                  "axis": "financialObligationType",
                  "value": {
                    "ref": "Commitment",
                    "label": "commitment"
                  }
                }
              ],
              "served_rows": 13611,
              "served_rows_exact": true
            }
          ],
          "measure_label": "gross disbursements",
          "measure_label_axes": [
            "populationType",
            "measuredProperty",
            "measurementQualifier",
            "financialFlowType",
            "nettingBasis"
          ],
          "measure_axis_values": [
            {
              "axis": "populationType",
              "value": {
                "ref": "FinancialFlow",
                "label": "financial flow"
              }
            },
            {
              "axis": "measuredProperty",
              "value": {
                "ref": "amount",
                "label": "amount"
              }
            },
            {
              "axis": "measurementQualifier",
              "value": {
                "ref": "Nominal",
                "label": "nominal"
              }
            },
            {
              "axis": "financialFlowType",
              "value": {
                "ref": "Disbursement",
                "label": "disbursement"
              }
            },
            {
              "axis": "nettingBasis",
              "value": {
                "ref": "Gross",
                "label": "gross"
              }
            }
          ],
          "open_axis_facts": [
            {
              "property": "crsPurpose",
              "varies": true,
              "distinct_count": 217,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "ref": "CRSPurposeCode16010",
                    "label": "social protection"
                  },
                  "count": 12
                },
                {
                  "value": {
                    "ref": "CRSPurposeCode43030",
                    "label": "urban development and management"
                  },
                  "count": 12
                }
              ]
            },
            {
              "property": "crsTypeOfFinance",
              "varies": true,
              "distinct_count": 10,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "ref": "CRSTypeOfFinance110",
                    "label": "standard grant"
                  },
                  "count": 892
                },
                {
                  "value": {
                    "ref": "CRSTypeOfFinance421",
                    "label": "standard loan"
                  },
                  "count": 169
                }
              ]
            },
            {
              "property": "crsCooperationModality",
              "varies": true,
              "distinct_count": 17,
              "undeclared_count": 5,
              "values": [
                {
                  "value": {
                    "ref": "CRSCooperationModalityC01",
                    "label": "project-type intervention"
                  },
                  "count": 354
                },
                {
                  "value": {
                    "ref": "CRSCooperationModalityD02",
                    "label": "other technical assistance"
                  },
                  "count": 151
                }
              ]
            }
          ],
          "role_axis_facts": [
            {
              "role": "origin",
              "member_count": 86,
              "members_available": true
            }
          ],
          "unit_conversion": {
            "currencies": [
              {
                "code": "AED",
                "noun": "UAE dirhams",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2021
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "AFN",
                "noun": "Afghan afghanis",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2002,
                "base_year_max": 2025
              },
              {
                "code": "ALL",
                "noun": "Albanian leks",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AMD",
                "noun": "Armenian drams",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "AOA",
                "noun": "Angolan kwanzas",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "ARS",
                "noun": "Argentine pesos",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AUD",
                "noun": "Australian dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "AWG",
                "noun": "Aruban florins",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2025
              },
              {
                "code": "AZN",
                "noun": "Azerbaijani manats",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "BAM",
                "noun": "Bosnia-Herzegovina convertible marks",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1996,
                "base_year_max": 2025
              },
              {
                "code": "BBD",
                "noun": "Barbadian dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BDT",
                "noun": "Bangladeshi taka",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BHD",
                "noun": "Bahraini dinars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BIF",
                "noun": "Burundian francs",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BND",
                "noun": "Brunei dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1985,
                "base_year_max": 2025
              },
              {
                "code": "BOB",
                "noun": "Bolivian bolivianos",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BRL",
                "noun": "Brazilian reais",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "BSD",
                "noun": "Bahamian dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BTN",
                "noun": "Bhutanese ngultrums",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BWP",
                "noun": "Botswana pula",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BYN",
                "noun": "Belarusian rubles",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "BZD",
                "noun": "Belize dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CAD",
                "noun": "Canadian dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CDF",
                "noun": "Congolese francs",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "CHF",
                "noun": "Swiss francs",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CLP",
                "noun": "Chilean pesos",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CNY",
                "noun": "Chinese yuan",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "COP",
                "noun": "Colombian pesos",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CRC",
                "noun": "Costa Rican colones",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CVE",
                "noun": "Cape Verdean escudos",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CZK",
                "noun": "Czech korunas",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "DJF",
                "noun": "Djiboutian francs",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "DKK",
                "noun": "Danish kroner",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "DOP",
                "noun": "Dominican pesos",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "DZD",
                "noun": "Algerian dinars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EGP",
                "noun": "Egyptian pounds",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ERN",
                "noun": "Eritrean nakfas",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2019
              },
              {
                "code": "ETB",
                "noun": "Ethiopian birr",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EUR",
                "noun": "euros",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1973,
                "base_year_max": 2025
              },
              {
                "code": "FJD",
                "noun": "Fijian dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GBP",
                "noun": "British pounds",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "GEL",
                "noun": "Georgian lari",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1994,
                "base_year_max": 2025
              },
              {
                "code": "GHS",
                "noun": "Ghanaian cedis",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GMD",
                "noun": "Gambian dalasis",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GNF",
                "noun": "Guinean francs",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GTQ",
                "noun": "Guatemalan quetzales",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GYD",
                "noun": "Guyanese dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HKD",
                "noun": "Hong Kong dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HNL",
                "noun": "Honduran lempiras",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HTG",
                "noun": "Haitian gourdes",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HUF",
                "noun": "Hungarian forints",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2003,
                "base_year_max": 2025
              },
              {
                "code": "IDR",
                "noun": "Indonesian rupiahs",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ILS",
                "noun": "Israeli new shekels",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "INR",
                "noun": "Indian rupees",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "IQD",
                "noun": "Iraqi dinars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2025
              },
              {
                "code": "IRR",
                "noun": "Iranian rials",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ISK",
                "noun": "Icelandic krónur",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "JMD",
                "noun": "Jamaican dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JOD",
                "noun": "Jordanian dinars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JPY",
                "noun": "Japanese yen",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "KES",
                "noun": "Kenyan shillings",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KGS",
                "noun": "Kyrgyz soms",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "KHR",
                "noun": "Cambodian riels",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "KMF",
                "noun": "Comorian francs",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KRW",
                "noun": "South Korean won",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "KWD",
                "noun": "Kuwaiti dinars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2024
              },
              {
                "code": "KZT",
                "noun": "Kazakh tenge",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2013,
                "base_year_max": 2024
              },
              {
                "code": "LAK",
                "noun": "Lao kip",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LBP",
                "noun": "Lebanese pounds",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LKR",
                "noun": "Sri Lankan rupees",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2024
              },
              {
                "code": "LSL",
                "noun": "Lesotho maloti",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LYD",
                "noun": "Libyan dinars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MAD",
                "noun": "Moroccan dirhams",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MDL",
                "noun": "Moldovan lei",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MGA",
                "noun": "Malagasy ariary",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MKD",
                "noun": "Macedonian denars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MMK",
                "noun": "Myanmar kyats",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "MNT",
                "noun": "Mongolian tugriks",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MOP",
                "noun": "Macanese patacas",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2001,
                "base_year_max": 2025
              },
              {
                "code": "MRU",
                "noun": "Mauritanian ouguiyas",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "MUR",
                "noun": "Mauritian rupees",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MVR",
                "noun": "Maldivian rufiyaa",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MWK",
                "noun": "Malawian kwachas",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MXN",
                "noun": "Mexican pesos",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MYR",
                "noun": "Malaysian ringgits",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MZN",
                "noun": "Mozambican meticais",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NAD",
                "noun": "Namibian dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1989,
                "base_year_max": 2025
              },
              {
                "code": "NGN",
                "noun": "Nigerian naira",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "NIO",
                "noun": "Nicaraguan córdobas",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "NOK",
                "noun": "Norwegian kroner",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "NPR",
                "noun": "Nepalese rupees",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NZD",
                "noun": "New Zealand dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1961,
                "base_year_max": 2025
              },
              {
                "code": "OMR",
                "noun": "Omani rials",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PEN",
                "noun": "Peruvian soles",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PGK",
                "noun": "Papua New Guinean kina",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PHP",
                "noun": "Philippine pesos",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PKR",
                "noun": "Pakistani rupees",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PLN",
                "noun": "Polish zlotys",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "PYG",
                "noun": "Paraguayan guaranís",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "QAR",
                "noun": "Qatari riyals",
                "current_years": {
                  "start_year": 2023,
                  "end_year": 2023
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "RON",
                "noun": "Romanian lei",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2013,
                "base_year_max": 2025
              },
              {
                "code": "RSD",
                "noun": "Serbian dinars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "RUB",
                "noun": "Russian rubles",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2020
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2010,
                "base_year_max": 2020
              },
              {
                "code": "RWF",
                "noun": "Rwandan francs",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SAR",
                "noun": "Saudi riyals",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2023
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2023
              },
              {
                "code": "SBD",
                "noun": "Solomon Islands dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SCR",
                "noun": "Seychellois rupees",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SDG",
                "noun": "Sudanese pounds",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SEK",
                "noun": "Swedish kronor",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "SGD",
                "noun": "Singapore dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SLE",
                "noun": "Sierra Leonean leones",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SRD",
                "noun": "Surinamese dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SSP",
                "noun": "South Sudanese pounds",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2011,
                "base_year_max": 2025
              },
              {
                "code": "STN",
                "noun": "São Tomé and Príncipe dobras",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SYP",
                "noun": "Syrian pounds",
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2010,
                "current_years": null
              },
              {
                "code": "SZL",
                "noun": "Swazi emalangeni",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "THB",
                "noun": "Thai baht",
                "current_years": {
                  "start_year": 2018,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2018,
                "base_year_max": 2024
              },
              {
                "code": "TJS",
                "noun": "Tajikistani somonis",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TMT",
                "noun": "Turkmenistani manat",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TND",
                "noun": "Tunisian dinars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TOP",
                "noun": "Tongan paʻanga",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TRY",
                "noun": "Turkish lira",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "TTD",
                "noun": "Trinidad and Tobago dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TWD",
                "noun": "New Taiwan dollars",
                "current_years": {
                  "start_year": 2018,
                  "end_year": 2021
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2024
              },
              {
                "code": "TZS",
                "noun": "Tanzanian shillings",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UAH",
                "noun": "Ukrainian hryvnias",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "UGX",
                "noun": "Ugandan shillings",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "USD",
                "noun": "US dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "UYU",
                "noun": "Uruguayan pesos",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UZS",
                "noun": "Uzbekistani soms",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "VES",
                "noun": "Venezuelan bolívares",
                "current_years": {
                  "start_year": 2017,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2017,
                "base_year_max": 2025
              },
              {
                "code": "VND",
                "noun": "Vietnamese dong",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "VUV",
                "noun": "Vanuatu vatu",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "WST",
                "noun": "Samoan tala",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XAF",
                "noun": "Central African CFA francs",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XCD",
                "noun": "East Caribbean dollars",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XOF",
                "noun": "West African CFA francs",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "YER",
                "noun": "Yemeni rials",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 2014,
                "base_year_max": 2025
              },
              {
                "code": "ZAR",
                "noun": "South African rand",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ZMW",
                "noun": "Zambian kwachas",
                "current_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 2015,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              }
            ],
            "default_base_year": 2024,
            "role_currencies": {
              "destination": "KES"
            }
          }
        }
      }
    }
  ],
  "rendered_sentence": "Gross ODA disbursements to Kenya from 86 donors, 2015 to 2024. Current US dollars · OECD Creditor Reporting System (CRS). Assumed: every donor.",
  "sentence_plan": [
    {
      "kind": "slot",
      "text": "Gross ODA disbursements",
      "axis": "what",
      "segment": "heading",
      "entity_refs": [],
      "states": [
        "how:crsTypeOfFlow",
        "how:financialFlowType",
        "how:nettingBasis",
        "axis:populationType",
        "axis:measuredProperty"
      ],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "crsCooperationModality",
      "binding_ref": "how:crsCooperationModality",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "crsPurpose",
      "binding_ref": "how:crsPurpose",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "crsTypeOfFinance",
      "binding_ref": "how:crsTypeOfFinance",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "crsTypeOfFlow",
      "binding_ref": "how:crsTypeOfFlow",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "financialFlowType",
      "binding_ref": "how:financialFlowType",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "nettingBasis",
      "binding_ref": "how:nettingBasis",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": " to ",
      "segment": "heading",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "slot",
      "text": "Kenya",
      "axis": "where",
      "segment": "heading",
      "role": "destination",
      "binding_ref": "where:",
      "entity_refs": [
        "country/KEN"
      ],
      "states": [
        "where:"
      ]
    },
    {
      "kind": "text",
      "text": " from ",
      "segment": "heading",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "slot",
      "text": "86 donors",
      "segment": "heading",
      "role": "origin",
      "binding_ref": "origin:",
      "entity_refs": [],
      "states": [
        "origin:"
      ]
    },
    {
      "kind": "text",
      "text": ", ",
      "segment": "heading",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "slot",
      "text": "2015 to 2024",
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
      "text": "Current US dollars",
      "axis": "unit",
      "segment": "byline",
      "binding_ref": "unit:",
      "entity_refs": [],
      "states": [
        "unit:",
        "axis:measurementQualifier"
      ]
    },
    {
      "kind": "text",
      "text": " · ",
      "segment": "byline",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "slot",
      "text": "OECD Creditor Reporting System (CRS)",
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
    },
    {
      "kind": "text",
      "text": " ",
      "segment": "assumption",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "text",
      "text": "Assumed: ",
      "segment": "assumption",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "text",
      "text": "every donor",
      "segment": "assumption",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "text",
      "text": ".",
      "segment": "assumption",
      "entity_refs": [],
      "states": []
    }
  ],
  "status": "definite"
};
