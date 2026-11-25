/**
 * Real `/api/search/resolve` responses from dfo-apis branch
 * feat/answer-edit-routes (commit b14dbb031), captured 2026-10-04 from a
 * local server without option coverage. `Spec.unit_conversion` lists each
 * currency an answer converts to with its noun, the years each price basis
 * converts and the base years constant prices take, and the byline unit
 * token states every currency and price basis.
 *
 * - unitAid: "aid from Germany to Guatemala" (CRS)
 * - unitAidEuroConstant: unitAid resubmitted with facets.unit
 *   {currency: "EUR", prices: "constant", base_year: 2024}
 * - unitDebt: "external debt service of Ghana" (IDS)
 * - unitHealth: "health expenditure in Kenya" (WDI; unit_conversion null)
 * - unitAidLoans: "aid and loans from Germany to Kenya" (CRS), two parts
 *   whose shared unit token hoists to the envelope plan (part_index null)
 *
 * Trimmed for size; each body still validates against the API's models
 * (scripts/check-search-fixtures.mts). `slot_values` and
 * `open_axis_facts[].values` keep two, the specs' own `sentence_plan` is
 * dropped (the envelope's stays), `trace.slot_filters` is empty, and
 * timings keep their totals. The server omits a `unit_conversion` currency's
 * `current_years` when it is null, which its own model requires; this
 * file writes the null. Slot option
 * lists keep two entries, and the specs' `observations` are dropped.
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

export const unitAid: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "aid from Germany to Guatemala",
    "normalized_query": "aid from Germany to Guatemala",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "91f1cd766c3445ec88920781932d8019",
    "warnings": [],
    "timing_ms": {
      "total": 1538
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
      "variable_text": "aid",
      "warnings": [
        {
          "code": "observations_series_truncated",
          "severity": "warn",
          "message": "showing 20 of 279 confirmed series (a stable, identity-ordered selection, not ranked by value); the rest are not shown.",
          "spec_id": "spec_263883d07f171c3723f665335d888229",
          "params": {
            "shown": 20,
            "total": 279
          }
        }
      ],
      "timing_ms": {
        "total": 1058
      },
      "restatement": {
        "variable_text": "aid",
        "entities": [
          {
            "text": "Germany",
            "role_text": "from"
          },
          {
            "text": "Guatemala",
            "role_text": "to"
          }
        ],
        "operations": []
      },
      "operations": [],
      "departures": [],
      "status": "definite",
      "spec": {
        "spec_id": "spec_263883d07f171c3723f665335d888229",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_263883d07f171c3723f665335d888229",
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
                "country/GTM"
              ],
              "origin": [
                "country/DEU"
              ]
            },
            "requested_window": {
              "kind": "all"
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
                    "ref": "country/GTM",
                    "label": "Guatemala"
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
                "kind": "unbound"
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
            "member_count": 279,
            "member_count_exact": true,
            "served_count": 279,
            "data_date_range": {
              "start": "1999",
              "end": "2009"
            }
          },
          "entities": [
            {
              "ref": "country/GTM",
              "label": "Guatemala",
              "entity_type": "Country",
              "role": "destination"
            },
            {
              "ref": "country/DEU",
              "label": "Germany",
              "entity_type": "Country",
              "role": "origin"
            }
          ],
          "coverage": {
            "kind": "exact",
            "has_data": true,
            "observation_count": 1284,
            "evidence": "observed",
            "dimensions": [
              {
                "label": "sources",
                "count": 1
              },
              {
                "label": "observations",
                "count": 21
              },
              {
                "label": "variables",
                "count": 279
              }
            ]
          },
          "headline": {
            "year": 2024,
            "year_named": false,
            "observations": 63,
            "series": 63,
            "role_counts": {
              "financingProvider": 1,
              "financingRecipient": 1
            },
            "recent_years": [
              {
                "year": 2024,
                "observations": 63,
                "series": 63,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              },
              {
                "year": 2023,
                "observations": 54,
                "series": 54,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              },
              {
                "year": 2022,
                "observations": 51,
                "series": 51,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              }
            ]
          },
          "download": {
            "rows": 1284,
            "rows_exact": true,
            "series": 279,
            "window": {
              "start_year": 1976,
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
                      "ref": "CRSCooperationModalityB",
                      "label": "core contribution and pooled programme and fund"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 255,
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
                  "served_rows": 44,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
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
                  "served_rows": 48,
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
                  "served_rows": 47,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
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
                  "served_rows": 1083,
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
                  "served_rows": 1083,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
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
                  "served_rows": 1284,
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
                  "served_rows": 21,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
              "source": "observed"
            }
          ],
          "entity_options": [],
          "facet_options": [],
          "rendered_sentence": "Germany's gross ODA disbursements to Guatemala, 1976 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
          "trace": {
            "resolved_entities": [
              {
                "ref": "country/GTM",
                "label": "Guatemala"
              },
              {
                "ref": "country/DEU",
                "label": "Germany"
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
            "query_qualifiers": [],
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
                "spec_id": "spec_4fb14681fb020b22ab608bbc55aa9c8b",
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
                      "country/GTM"
                    ],
                    "origin": [
                      "country/DEU"
                    ]
                  },
                  "requested_window": {
                    "kind": "all"
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
              "served_rows": 1284,
              "served_rows_exact": true
            },
            {
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_70b6b6447d6f50572726c6e50a5edeba",
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
                      "country/GTM"
                    ],
                    "origin": [
                      "country/DEU"
                    ]
                  },
                  "requested_window": {
                    "kind": "all"
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
              "served_rows": 1172,
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
              "distinct_count": 98,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "ref": "CRSPurposeCode11420",
                    "label": "higher education"
                  },
                  "count": 8
                },
                {
                  "value": {
                    "ref": "CRSPurposeCode11120",
                    "label": "education facility and training"
                  },
                  "count": 6
                }
              ]
            },
            {
              "property": "crsTypeOfFinance",
              "varies": true,
              "distinct_count": 3,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "ref": "CRSTypeOfFinance110",
                    "label": "standard grant"
                  },
                  "count": 261
                },
                {
                  "value": {
                    "ref": "CRSTypeOfFinance421",
                    "label": "standard loan"
                  },
                  "count": 17
                }
              ]
            },
            {
              "property": "crsCooperationModality",
              "varies": true,
              "distinct_count": 8,
              "undeclared_count": 72,
              "values": [
                {
                  "value": {
                    "ref": "CRSCooperationModalityC01",
                    "label": "project-type intervention"
                  },
                  "count": 75
                },
                {
                  "value": {
                    "ref": "CRSCooperationModalityB01",
                    "label": "core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes"
                  },
                  "count": 43
                }
              ]
            }
          ],
          "unit_conversion": {
            "currencies": [
              {
                "code": "AED",
                "noun": "UAE dirhams",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2021
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "AFN",
                "noun": "Afghan afghanis",
                "current_years": {
                  "start_year": 2002,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2002,
                "base_year_max": 2025
              },
              {
                "code": "ALL",
                "noun": "Albanian leks",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AMD",
                "noun": "Armenian drams",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "AOA",
                "noun": "Angolan kwanzas",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "ARS",
                "noun": "Argentine pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AUD",
                "noun": "Australian dollars",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "AWG",
                "noun": "Aruban florins",
                "current_years": {
                  "start_year": 1995,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2025
              },
              {
                "code": "AZN",
                "noun": "Azerbaijani manats",
                "current_years": {
                  "start_year": 2014,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "BAM",
                "noun": "Bosnia-Herzegovina convertible marks",
                "current_years": {
                  "start_year": 1996,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1996,
                "base_year_max": 2025
              },
              {
                "code": "BBD",
                "noun": "Barbadian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BDT",
                "noun": "Bangladeshi taka",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BHD",
                "noun": "Bahraini dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BIF",
                "noun": "Burundian francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BND",
                "noun": "Brunei dollars",
                "current_years": {
                  "start_year": 1985,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1985,
                "base_year_max": 2025
              },
              {
                "code": "BOB",
                "noun": "Bolivian bolivianos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BRL",
                "noun": "Brazilian reais",
                "current_years": {
                  "start_year": 1986,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "BSD",
                "noun": "Bahamian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BTN",
                "noun": "Bhutanese ngultrums",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BWP",
                "noun": "Botswana pula",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BYN",
                "noun": "Belarusian rubles",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "BZD",
                "noun": "Belize dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CAD",
                "noun": "Canadian dollars",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CDF",
                "noun": "Congolese francs",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "CHF",
                "noun": "Swiss francs",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CLP",
                "noun": "Chilean pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CNY",
                "noun": "Chinese yuan",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "COP",
                "noun": "Colombian pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CRC",
                "noun": "Costa Rican colones",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CVE",
                "noun": "Cape Verdean escudos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CZK",
                "noun": "Czech korunas",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "DJF",
                "noun": "Djiboutian francs",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "DKK",
                "noun": "Danish kroner",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "DOP",
                "noun": "Dominican pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "DZD",
                "noun": "Algerian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EGP",
                "noun": "Egyptian pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ERN",
                "noun": "Eritrean nakfas",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2019
              },
              {
                "code": "ETB",
                "noun": "Ethiopian birr",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EUR",
                "noun": "euros",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1973,
                "base_year_max": 2025
              },
              {
                "code": "FJD",
                "noun": "Fijian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GBP",
                "noun": "British pounds",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "GEL",
                "noun": "Georgian lari",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1994,
                "base_year_max": 2025
              },
              {
                "code": "GHS",
                "noun": "Ghanaian cedis",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GMD",
                "noun": "Gambian dalasis",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GNF",
                "noun": "Guinean francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GTQ",
                "noun": "Guatemalan quetzales",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GYD",
                "noun": "Guyanese dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HKD",
                "noun": "Hong Kong dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HNL",
                "noun": "Honduran lempiras",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HTG",
                "noun": "Haitian gourdes",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HUF",
                "noun": "Hungarian forints",
                "current_years": {
                  "start_year": 2003,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2003,
                "base_year_max": 2025
              },
              {
                "code": "IDR",
                "noun": "Indonesian rupiahs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ILS",
                "noun": "Israeli new shekels",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "INR",
                "noun": "Indian rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "IQD",
                "noun": "Iraqi dinars",
                "current_years": {
                  "start_year": 2000,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2025
              },
              {
                "code": "IRR",
                "noun": "Iranian rials",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ISK",
                "noun": "Icelandic krónur",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "JMD",
                "noun": "Jamaican dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JOD",
                "noun": "Jordanian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JPY",
                "noun": "Japanese yen",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "KES",
                "noun": "Kenyan shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KGS",
                "noun": "Kyrgyz soms",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "KHR",
                "noun": "Cambodian riels",
                "current_years": {
                  "start_year": 1986,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "KMF",
                "noun": "Comorian francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KRW",
                "noun": "South Korean won",
                "current_years": {
                  "start_year": 1987,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "KWD",
                "noun": "Kuwaiti dinars",
                "current_years": {
                  "start_year": 1995,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2024
              },
              {
                "code": "KZT",
                "noun": "Kazakh tenge",
                "current_years": {
                  "start_year": 2013,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2013,
                "base_year_max": 2024
              },
              {
                "code": "LAK",
                "noun": "Lao kip",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LBP",
                "noun": "Lebanese pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LKR",
                "noun": "Sri Lankan rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2024
              },
              {
                "code": "LSL",
                "noun": "Lesotho maloti",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LYD",
                "noun": "Libyan dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MAD",
                "noun": "Moroccan dirhams",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MDL",
                "noun": "Moldovan lei",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MGA",
                "noun": "Malagasy ariary",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MKD",
                "noun": "Macedonian denars",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MMK",
                "noun": "Myanmar kyats",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "MNT",
                "noun": "Mongolian tugriks",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MOP",
                "noun": "Macanese patacas",
                "current_years": {
                  "start_year": 2001,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2001,
                "base_year_max": 2025
              },
              {
                "code": "MRU",
                "noun": "Mauritanian ouguiyas",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "MUR",
                "noun": "Mauritian rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MVR",
                "noun": "Maldivian rufiyaa",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MWK",
                "noun": "Malawian kwachas",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MXN",
                "noun": "Mexican pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MYR",
                "noun": "Malaysian ringgits",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MZN",
                "noun": "Mozambican meticais",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NAD",
                "noun": "Namibian dollars",
                "current_years": {
                  "start_year": 1989,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1989,
                "base_year_max": 2025
              },
              {
                "code": "NGN",
                "noun": "Nigerian naira",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "NIO",
                "noun": "Nicaraguan córdobas",
                "current_years": {
                  "start_year": 1987,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "NOK",
                "noun": "Norwegian kroner",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "NPR",
                "noun": "Nepalese rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NZD",
                "noun": "New Zealand dollars",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1961,
                "base_year_max": 2025
              },
              {
                "code": "OMR",
                "noun": "Omani rials",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PEN",
                "noun": "Peruvian soles",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PGK",
                "noun": "Papua New Guinean kina",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PHP",
                "noun": "Philippine pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PKR",
                "noun": "Pakistani rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PLN",
                "noun": "Polish zlotys",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "PYG",
                "noun": "Paraguayan guaranís",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "QAR",
                "noun": "Qatari riyals",
                "current_years": {
                  "start_year": 1985,
                  "end_year": 1990
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "RON",
                "noun": "Romanian lei",
                "current_years": {
                  "start_year": 2013,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2013,
                "base_year_max": 2025
              },
              {
                "code": "RSD",
                "noun": "Serbian dinars",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "RUB",
                "noun": "Russian rubles",
                "current_years": {
                  "start_year": 2010,
                  "end_year": 2020
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2010,
                "base_year_max": 2020
              },
              {
                "code": "RWF",
                "noun": "Rwandan francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SAR",
                "noun": "Saudi riyals",
                "current_years": {
                  "start_year": 2000,
                  "end_year": 2023
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2023
              },
              {
                "code": "SBD",
                "noun": "Solomon Islands dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SCR",
                "noun": "Seychellois rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SDG",
                "noun": "Sudanese pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SEK",
                "noun": "Swedish kronor",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "SGD",
                "noun": "Singapore dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SLE",
                "noun": "Sierra Leonean leones",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SRD",
                "noun": "Surinamese dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SSP",
                "noun": "South Sudanese pounds",
                "current_years": {
                  "start_year": 2011,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2011,
                "base_year_max": 2025
              },
              {
                "code": "STN",
                "noun": "São Tomé and Príncipe dobras",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SYP",
                "noun": "Syrian pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2010
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2010
              },
              {
                "code": "SZL",
                "noun": "Swazi emalangeni",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "THB",
                "noun": "Thai baht",
                "current_years": {
                  "start_year": 2006,
                  "end_year": 2016
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2018,
                "base_year_max": 2024
              },
              {
                "code": "TJS",
                "noun": "Tajikistani somonis",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TMT",
                "noun": "Turkmenistani manat",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TND",
                "noun": "Tunisian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TOP",
                "noun": "Tongan paʻanga",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TRY",
                "noun": "Turkish lira",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "TTD",
                "noun": "Trinidad and Tobago dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TWD",
                "noun": "New Taiwan dollars",
                "current_years": {
                  "start_year": 2006,
                  "end_year": 2016
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2024
              },
              {
                "code": "TZS",
                "noun": "Tanzanian shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UAH",
                "noun": "Ukrainian hryvnias",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "UGX",
                "noun": "Ugandan shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "USD",
                "noun": "US dollars",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "UYU",
                "noun": "Uruguayan pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UZS",
                "noun": "Uzbekistani soms",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
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
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2017,
                "base_year_max": 2025
              },
              {
                "code": "VND",
                "noun": "Vietnamese dong",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "VUV",
                "noun": "Vanuatu vatu",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "WST",
                "noun": "Samoan tala",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XAF",
                "noun": "Central African CFA francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XCD",
                "noun": "East Caribbean dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XOF",
                "noun": "West African CFA francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "YER",
                "noun": "Yemeni rials",
                "current_years": {
                  "start_year": 2014,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2014,
                "base_year_max": 2025
              },
              {
                "code": "ZAR",
                "noun": "South African rand",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ZMW",
                "noun": "Zambian kwachas",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              }
            ],
            "default_base_year": 2024,
            "role_currencies": {
              "destination": "GTQ",
              "origin": "EUR"
            }
          }
        }
      }
    }
  ],
  "rendered_sentence": "Germany's gross ODA disbursements to Guatemala, 1976 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
  "sentence_plan": [
    {
      "kind": "slot",
      "text": "Germany",
      "segment": "heading",
      "role": "origin",
      "binding_ref": "origin:",
      "entity_refs": [
        "country/DEU"
      ],
      "states": [
        "origin:"
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
      "text": "gross ODA disbursements",
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
      "text": "Guatemala",
      "axis": "where",
      "segment": "heading",
      "role": "destination",
      "binding_ref": "where:",
      "entity_refs": [
        "country/GTM"
      ],
      "states": [
        "where:"
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
      "text": "1976 to 2024",
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
    }
  ],
  "status": "definite"
};

export const unitAidEuroConstant: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "dataset_resubmit",
    "extract_skipped": true
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "d9813132920144d7b94072fed2837017",
    "warnings": [],
    "timing_ms": {
      "total": 3603
    },
    "timed_out": false
  },
  "kind": "resolution",
  "parts": [
    {
      "variable_text": "aid",
      "warnings": [
        {
          "code": "observations_series_truncated",
          "severity": "warn",
          "message": "showing 20 of 279 confirmed series (a stable, identity-ordered selection, not ranked by value); the rest are not shown.",
          "spec_id": "spec_f642ff57e45a2da29e244edf5a53b8e7",
          "params": {
            "shown": 20,
            "total": 279
          }
        }
      ],
      "timing_ms": {
        "total": 1100
      },
      "operations": [],
      "departures": [],
      "status": "definite",
      "spec": {
        "spec_id": "spec_f642ff57e45a2da29e244edf5a53b8e7",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_f642ff57e45a2da29e244edf5a53b8e7",
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
                "country/GTM"
              ],
              "origin": [
                "country/DEU"
              ]
            },
            "requested_window": {
              "kind": "all"
            },
            "facets": {
              "unit": {
                "state": "value",
                "request": {
                  "currency": "EUR",
                  "prices": "constant",
                  "base_year": 2024
                }
              }
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
                    "ref": "country/GTM",
                    "label": "Guatemala"
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
                "kind": "unbound"
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
          "inapplicable_slots": [],
          "unresolved_slots": [],
          "stat_vars": {
            "member_count": 279,
            "member_count_exact": true,
            "served_count": 279,
            "data_date_range": {
              "start": "1999",
              "end": "2009"
            }
          },
          "entities": [
            {
              "ref": "country/GTM",
              "label": "Guatemala",
              "entity_type": "Country",
              "role": "destination"
            },
            {
              "ref": "country/DEU",
              "label": "Germany",
              "entity_type": "Country",
              "role": "origin"
            }
          ],
          "coverage": {
            "kind": "exact",
            "has_data": true,
            "observation_count": 1284,
            "evidence": "observed",
            "dimensions": [
              {
                "label": "sources",
                "count": 1
              },
              {
                "label": "observations",
                "count": 21
              },
              {
                "label": "variables",
                "count": 279
              }
            ]
          },
          "headline": {
            "year": 2024,
            "year_named": false,
            "observations": 63,
            "series": 63,
            "role_counts": {
              "financingProvider": 1,
              "financingRecipient": 1
            },
            "recent_years": [
              {
                "year": 2024,
                "observations": 63,
                "series": 63,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              },
              {
                "year": 2023,
                "observations": 54,
                "series": 54,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              },
              {
                "year": 2022,
                "observations": 51,
                "series": 51,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              }
            ]
          },
          "download": {
            "rows": 1284,
            "rows_exact": false,
            "series": 279,
            "window": {
              "start_year": 1976,
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
              "basis": "bound",
              "ref": "CurrencyEUR",
              "label": "Euro",
              "currency": "EUR",
              "request_basis": {
                "currency": "bound",
                "prices": "bound",
                "base_year": "bound"
              }
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
                      "ref": "CRSCooperationModalityB",
                      "label": "core contribution and pooled programme and fund"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 255,
                  "served_rows_exact": false
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
                  "served_rows": 44,
                  "served_rows_exact": false
                }
              ],
              "truncated": true,
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
                  "served_rows": 48,
                  "served_rows_exact": false
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
                  "served_rows": 47,
                  "served_rows_exact": false
                }
              ],
              "truncated": true,
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
                  "served_rows": 1083,
                  "served_rows_exact": false
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
                  "served_rows": 1083,
                  "served_rows_exact": false
                }
              ],
              "truncated": true,
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
                  "served_rows": 1284,
                  "served_rows_exact": false
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
                  "served_rows": 21,
                  "served_rows_exact": false
                }
              ],
              "truncated": true,
              "source": "observed"
            }
          ],
          "entity_options": [],
          "facet_options": [],
          "rendered_sentence": "Germany's gross ODA disbursements to Guatemala, 1976 to 2024. Constant 2024 euros · OECD Creditor Reporting System (CRS).",
          "trace": {
            "resolved_entities": [
              {
                "ref": "country/GTM",
                "label": "Guatemala"
              },
              {
                "ref": "country/DEU",
                "label": "Germany"
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
            "query_qualifiers": [],
            "capability_version": "cap_cbe83b130f0e8d02"
          },
          "confidence": "high",
          "available_at_place": true,
          "alternative_measures": [
            {
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_568dff1ca9ae430b2601b216427a7ea0",
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
                      "country/GTM"
                    ],
                    "origin": [
                      "country/DEU"
                    ]
                  },
                  "requested_window": {
                    "kind": "all"
                  },
                  "facets": {
                    "unit": {
                      "state": "value",
                      "request": {
                        "currency": "EUR",
                        "prices": "constant",
                        "base_year": 2024
                      }
                    }
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
              "served_rows": 1284,
              "served_rows_exact": false
            },
            {
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_e73a1db69d0986c9074ca962f1130432",
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
                      "country/GTM"
                    ],
                    "origin": [
                      "country/DEU"
                    ]
                  },
                  "requested_window": {
                    "kind": "all"
                  },
                  "facets": {
                    "unit": {
                      "state": "value",
                      "request": {
                        "currency": "EUR",
                        "prices": "constant",
                        "base_year": 2024
                      }
                    }
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
              "served_rows": 1172,
              "served_rows_exact": false
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
              "property": "crsCooperationModality",
              "varies": true,
              "distinct_count": 21,
              "undeclared_count": 422,
              "values": [
                {
                  "value": {
                    "ref": "CRSCooperationModalityC01",
                    "label": "project-type intervention"
                  },
                  "count": 749
                },
                {
                  "value": {
                    "ref": "CRSCooperationModalityA02",
                    "label": "sector budget support"
                  },
                  "count": 316
                }
              ]
            },
            {
              "property": "crsPurpose",
              "varies": true,
              "distinct_count": 235,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "ref": "CRSPurposeCode99810",
                    "label": "sectors not specified"
                  },
                  "count": 36
                },
                {
                  "value": {
                    "ref": "CRSPurposeCode23210",
                    "label": "renewable energy generation using multiple technologies"
                  },
                  "count": 34
                }
              ]
            },
            {
              "property": "crsTypeOfFinance",
              "varies": true,
              "distinct_count": 27,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "ref": "CRSTypeOfFinance110",
                    "label": "standard grant"
                  },
                  "count": 2570
                },
                {
                  "value": {
                    "ref": "CRSTypeOfFinance421",
                    "label": "standard loan"
                  },
                  "count": 611
                }
              ]
            }
          ],
          "unit_conversion": {
            "currencies": [
              {
                "code": "AED",
                "noun": "UAE dirhams",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2021
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "AFN",
                "noun": "Afghan afghanis",
                "current_years": {
                  "start_year": 2002,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2002,
                "base_year_max": 2025
              },
              {
                "code": "ALL",
                "noun": "Albanian leks",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AMD",
                "noun": "Armenian drams",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "AOA",
                "noun": "Angolan kwanzas",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "ARS",
                "noun": "Argentine pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AUD",
                "noun": "Australian dollars",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "AWG",
                "noun": "Aruban florins",
                "current_years": {
                  "start_year": 1995,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2025
              },
              {
                "code": "AZN",
                "noun": "Azerbaijani manats",
                "current_years": {
                  "start_year": 2014,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "BAM",
                "noun": "Bosnia-Herzegovina convertible marks",
                "current_years": {
                  "start_year": 1996,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1996,
                "base_year_max": 2025
              },
              {
                "code": "BBD",
                "noun": "Barbadian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BDT",
                "noun": "Bangladeshi taka",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BHD",
                "noun": "Bahraini dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BIF",
                "noun": "Burundian francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BND",
                "noun": "Brunei dollars",
                "current_years": {
                  "start_year": 1985,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1985,
                "base_year_max": 2025
              },
              {
                "code": "BOB",
                "noun": "Bolivian bolivianos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BRL",
                "noun": "Brazilian reais",
                "current_years": {
                  "start_year": 1986,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "BSD",
                "noun": "Bahamian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BTN",
                "noun": "Bhutanese ngultrums",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BWP",
                "noun": "Botswana pula",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BYN",
                "noun": "Belarusian rubles",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "BZD",
                "noun": "Belize dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CAD",
                "noun": "Canadian dollars",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CDF",
                "noun": "Congolese francs",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "CHF",
                "noun": "Swiss francs",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CLP",
                "noun": "Chilean pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CNY",
                "noun": "Chinese yuan",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "COP",
                "noun": "Colombian pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CRC",
                "noun": "Costa Rican colones",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CVE",
                "noun": "Cape Verdean escudos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CZK",
                "noun": "Czech korunas",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "DJF",
                "noun": "Djiboutian francs",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "DKK",
                "noun": "Danish kroner",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "DOP",
                "noun": "Dominican pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "DZD",
                "noun": "Algerian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EGP",
                "noun": "Egyptian pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ERN",
                "noun": "Eritrean nakfas",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2019
              },
              {
                "code": "ETB",
                "noun": "Ethiopian birr",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EUR",
                "noun": "euros",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1973,
                "base_year_max": 2025
              },
              {
                "code": "FJD",
                "noun": "Fijian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GBP",
                "noun": "British pounds",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "GEL",
                "noun": "Georgian lari",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1994,
                "base_year_max": 2025
              },
              {
                "code": "GHS",
                "noun": "Ghanaian cedis",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GMD",
                "noun": "Gambian dalasis",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GNF",
                "noun": "Guinean francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GTQ",
                "noun": "Guatemalan quetzales",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GYD",
                "noun": "Guyanese dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HKD",
                "noun": "Hong Kong dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HNL",
                "noun": "Honduran lempiras",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HTG",
                "noun": "Haitian gourdes",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HUF",
                "noun": "Hungarian forints",
                "current_years": {
                  "start_year": 2003,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2003,
                "base_year_max": 2025
              },
              {
                "code": "IDR",
                "noun": "Indonesian rupiahs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ILS",
                "noun": "Israeli new shekels",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "INR",
                "noun": "Indian rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "IQD",
                "noun": "Iraqi dinars",
                "current_years": {
                  "start_year": 2000,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2025
              },
              {
                "code": "IRR",
                "noun": "Iranian rials",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ISK",
                "noun": "Icelandic krónur",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "JMD",
                "noun": "Jamaican dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JOD",
                "noun": "Jordanian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JPY",
                "noun": "Japanese yen",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "KES",
                "noun": "Kenyan shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KGS",
                "noun": "Kyrgyz soms",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "KHR",
                "noun": "Cambodian riels",
                "current_years": {
                  "start_year": 1986,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "KMF",
                "noun": "Comorian francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KRW",
                "noun": "South Korean won",
                "current_years": {
                  "start_year": 1987,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "KWD",
                "noun": "Kuwaiti dinars",
                "current_years": {
                  "start_year": 1995,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2024
              },
              {
                "code": "KZT",
                "noun": "Kazakh tenge",
                "current_years": {
                  "start_year": 2013,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2013,
                "base_year_max": 2024
              },
              {
                "code": "LAK",
                "noun": "Lao kip",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LBP",
                "noun": "Lebanese pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LKR",
                "noun": "Sri Lankan rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2024
              },
              {
                "code": "LSL",
                "noun": "Lesotho maloti",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LYD",
                "noun": "Libyan dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MAD",
                "noun": "Moroccan dirhams",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MDL",
                "noun": "Moldovan lei",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MGA",
                "noun": "Malagasy ariary",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MKD",
                "noun": "Macedonian denars",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MMK",
                "noun": "Myanmar kyats",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "MNT",
                "noun": "Mongolian tugriks",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MOP",
                "noun": "Macanese patacas",
                "current_years": {
                  "start_year": 2001,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2001,
                "base_year_max": 2025
              },
              {
                "code": "MRU",
                "noun": "Mauritanian ouguiyas",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "MUR",
                "noun": "Mauritian rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MVR",
                "noun": "Maldivian rufiyaa",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MWK",
                "noun": "Malawian kwachas",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MXN",
                "noun": "Mexican pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MYR",
                "noun": "Malaysian ringgits",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MZN",
                "noun": "Mozambican meticais",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NAD",
                "noun": "Namibian dollars",
                "current_years": {
                  "start_year": 1989,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1989,
                "base_year_max": 2025
              },
              {
                "code": "NGN",
                "noun": "Nigerian naira",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "NIO",
                "noun": "Nicaraguan córdobas",
                "current_years": {
                  "start_year": 1987,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "NOK",
                "noun": "Norwegian kroner",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "NPR",
                "noun": "Nepalese rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NZD",
                "noun": "New Zealand dollars",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1961,
                "base_year_max": 2025
              },
              {
                "code": "OMR",
                "noun": "Omani rials",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PEN",
                "noun": "Peruvian soles",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PGK",
                "noun": "Papua New Guinean kina",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PHP",
                "noun": "Philippine pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PKR",
                "noun": "Pakistani rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PLN",
                "noun": "Polish zlotys",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "PYG",
                "noun": "Paraguayan guaranís",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "QAR",
                "noun": "Qatari riyals",
                "current_years": {
                  "start_year": 1985,
                  "end_year": 1990
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "RON",
                "noun": "Romanian lei",
                "current_years": {
                  "start_year": 2013,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2013,
                "base_year_max": 2025
              },
              {
                "code": "RSD",
                "noun": "Serbian dinars",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "RUB",
                "noun": "Russian rubles",
                "current_years": {
                  "start_year": 2010,
                  "end_year": 2020
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2010,
                "base_year_max": 2020
              },
              {
                "code": "RWF",
                "noun": "Rwandan francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SAR",
                "noun": "Saudi riyals",
                "current_years": {
                  "start_year": 2000,
                  "end_year": 2023
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2023
              },
              {
                "code": "SBD",
                "noun": "Solomon Islands dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SCR",
                "noun": "Seychellois rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SDG",
                "noun": "Sudanese pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SEK",
                "noun": "Swedish kronor",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "SGD",
                "noun": "Singapore dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SLE",
                "noun": "Sierra Leonean leones",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SRD",
                "noun": "Surinamese dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SSP",
                "noun": "South Sudanese pounds",
                "current_years": {
                  "start_year": 2011,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2011,
                "base_year_max": 2025
              },
              {
                "code": "STN",
                "noun": "São Tomé and Príncipe dobras",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SYP",
                "noun": "Syrian pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2010
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2010
              },
              {
                "code": "SZL",
                "noun": "Swazi emalangeni",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "THB",
                "noun": "Thai baht",
                "current_years": {
                  "start_year": 2006,
                  "end_year": 2016
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2018,
                "base_year_max": 2024
              },
              {
                "code": "TJS",
                "noun": "Tajikistani somonis",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TMT",
                "noun": "Turkmenistani manat",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TND",
                "noun": "Tunisian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TOP",
                "noun": "Tongan paʻanga",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TRY",
                "noun": "Turkish lira",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "TTD",
                "noun": "Trinidad and Tobago dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TWD",
                "noun": "New Taiwan dollars",
                "current_years": {
                  "start_year": 2006,
                  "end_year": 2016
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2024
              },
              {
                "code": "TZS",
                "noun": "Tanzanian shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UAH",
                "noun": "Ukrainian hryvnias",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "UGX",
                "noun": "Ugandan shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "USD",
                "noun": "US dollars",
                "current_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "UYU",
                "noun": "Uruguayan pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UZS",
                "noun": "Uzbekistani soms",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
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
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2017,
                "base_year_max": 2025
              },
              {
                "code": "VND",
                "noun": "Vietnamese dong",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "VUV",
                "noun": "Vanuatu vatu",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "WST",
                "noun": "Samoan tala",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XAF",
                "noun": "Central African CFA francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XCD",
                "noun": "East Caribbean dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XOF",
                "noun": "West African CFA francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "YER",
                "noun": "Yemeni rials",
                "current_years": {
                  "start_year": 2014,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 2014,
                "base_year_max": 2025
              },
              {
                "code": "ZAR",
                "noun": "South African rand",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ZMW",
                "noun": "Zambian kwachas",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1976,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              }
            ],
            "default_base_year": 2024,
            "role_currencies": {
              "destination": "GTQ",
              "origin": "EUR"
            }
          }
        }
      }
    }
  ],
  "rendered_sentence": "Germany's gross ODA disbursements to Guatemala, 1976 to 2024. Constant 2024 euros · OECD Creditor Reporting System (CRS).",
  "sentence_plan": [
    {
      "kind": "slot",
      "text": "Germany",
      "segment": "heading",
      "role": "origin",
      "binding_ref": "origin:",
      "entity_refs": [
        "country/DEU"
      ],
      "states": [
        "origin:"
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
      "text": "gross ODA disbursements",
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
      "text": "Guatemala",
      "axis": "where",
      "segment": "heading",
      "role": "destination",
      "binding_ref": "where:",
      "entity_refs": [
        "country/GTM"
      ],
      "states": [
        "where:"
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
      "text": "1976 to 2024",
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
      "text": "Constant 2024 euros",
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
    }
  ],
  "status": "definite"
};

export const unitDebt: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "external debt service of Ghana",
    "normalized_query": "external debt service of Ghana",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "8bc7fe52f78c4be59c27181a17d2b30a",
    "warnings": [],
    "timing_ms": {
      "total": 2637
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
      "variable_text": "external debt service",
      "warnings": [],
      "timing_ms": {
        "total": 277
      },
      "restatement": {
        "variable_text": "external debt service",
        "entities": [
          {
            "text": "Ghana"
          }
        ],
        "operations": []
      },
      "operations": [],
      "departures": [],
      "status": "definite",
      "spec": {
        "spec_id": "spec_065cdb39893ee708825658b2af961c78",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_065cdb39893ee708825658b2af961c78",
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
                "property": "financialFlowType",
                "binding": {
                  "state": "value",
                  "ref": "ServicingPayment"
                }
              },
              {
                "property": "financingResource",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "guaranteeStatus",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "idsConcessionality",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "idsCreditorType",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "idsDebtorType",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "includesIMFCredit",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "maturityBand",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "netOf",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "nettingBasis",
                "binding": {
                  "state": "unbound"
                }
              }
            ],
            "entities": {
              "destination": [
                "country/GHA"
              ]
            },
            "requested_window": {
              "kind": "all"
            }
          }
        },
        "resolved": {
          "shape": {
            "shape_id": "financialflow_amount_measuredvalue_nominal_by_role",
            "label": "Debt service on external debt (current US$)",
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
                  "ref": "financialFlowType",
                  "label": "financial flow type"
                },
                "label": "financial flow type"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "financingResource",
                  "label": "financing resource"
                },
                "label": "financing resource"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "guaranteeStatus",
                  "label": "guarantee status"
                },
                "label": "guarantee status"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "idsCreditorType",
                  "label": "IDS creditor type"
                },
                "label": "IDS creditor type"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "idsDebtorType",
                  "label": "IDS debtor type"
                },
                "label": "IDS debtor type"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "idsConcessionality",
                  "label": "IDS concessionality"
                },
                "label": "IDS concessionality"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "includesIMFCredit",
                  "label": "includes IMF credit"
                },
                "label": "includes IMF credit"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "maturityBand",
                  "label": "maturity band"
                },
                "label": "maturity band"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "netOf",
                  "label": "net of"
                },
                "label": "net of"
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
            "member_count": 65,
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
                  "ref": "financialFlowType",
                  "label": "financial flow type"
                },
                "label": "financial flow type"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "ref": "ServicingPayment",
                    "label": "servicing payment"
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
                  "ref": "financingResource",
                  "label": "financing resource"
                },
                "label": "financing resource"
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
                  "ref": "guaranteeStatus",
                  "label": "guarantee status"
                },
                "label": "guarantee status"
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
                  "ref": "idsCreditorType",
                  "label": "IDS creditor type"
                },
                "label": "IDS creditor type"
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
                  "ref": "idsDebtorType",
                  "label": "IDS debtor type"
                },
                "label": "IDS debtor type"
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
                  "ref": "idsConcessionality",
                  "label": "IDS concessionality"
                },
                "label": "IDS concessionality"
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
                  "ref": "includesIMFCredit",
                  "label": "includes IMF credit"
                },
                "label": "includes IMF credit"
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
                  "ref": "maturityBand",
                  "label": "maturity band"
                },
                "label": "maturity band"
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
                  "ref": "netOf",
                  "label": "net of"
                },
                "label": "net of"
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
                  "ref": "nettingBasis",
                  "label": "netting basis"
                },
                "label": "netting basis"
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
                    "ref": "country/GHA",
                    "label": "Ghana"
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
                "kind": "unbound"
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
            "financingResource",
            "guaranteeStatus",
            "idsCreditorType",
            "idsDebtorType",
            "idsConcessionality",
            "includesIMFCredit",
            "maturityBand",
            "netOf",
            "nettingBasis"
          ],
          "unresolved_slots": [],
          "stat_vars": {
            "member_count": 1,
            "member_count_exact": false,
            "served_count": 1,
            "data_date_range": {
              "start": "1970",
              "end": "2024"
            }
          },
          "entities": [
            {
              "ref": "country/GHA",
              "label": "Ghana",
              "entity_type": "Country",
              "role": "destination"
            }
          ],
          "coverage": {
            "kind": "exact",
            "has_data": true,
            "observation_count": 55,
            "evidence": "observed",
            "dimensions": [
              {
                "label": "sources",
                "count": 1
              },
              {
                "label": "observations",
                "count": 55
              },
              {
                "label": "variables",
                "count": 1
              }
            ]
          },
          "headline": {
            "year": 2024,
            "year_named": false,
            "observations": 1,
            "series": 1,
            "role_counts": {
              "financingRecipient": 1
            },
            "recent_years": [
              {
                "year": 2024,
                "observations": 1,
                "series": 1,
                "role_counts": {
                  "financingRecipient": 1
                }
              },
              {
                "year": 2023,
                "observations": 1,
                "series": 1,
                "role_counts": {
                  "financingRecipient": 1
                }
              },
              {
                "year": 2022,
                "observations": 1,
                "series": 1,
                "role_counts": {
                  "financingRecipient": 1
                }
              }
            ]
          },
          "download": {
            "rows": 55,
            "rows_exact": true,
            "series": 1,
            "window": {
              "start_year": 1970,
              "end_year": 2024
            },
            "licence": {
              "label": "Creative Commons Attribution License"
            }
          },
          "coverage_stamp": "7a081f21b36a988a91ddfa2d9a9df700",
          "facets": {
            "provenance": {
              "basis": "fallback",
              "ref": "provenance/WorldBankInternationalDebtStatistics",
              "label": "World Bank International Debt Statistics (IDS)",
              "source": {
                "ref": "dc/s/WorldBank",
                "label": "World Bank"
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
                  "ref": "financialFlowType",
                  "label": "financial flow type"
                },
                "label": "financial flow type"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "ServicingPayment",
                      "label": "servicing payment"
                    },
                    "value_kind": "enum_value"
                  }
                },
                {
                  "value": {
                    "ref": {
                      "ref": "Disbursement",
                      "label": "disbursement"
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
                  "ref": "guaranteeStatus",
                  "label": "guarantee status"
                },
                "label": "guarantee status"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "PublicOrPubliclyGuaranteed",
                      "label": "public or publicly guaranteed"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 63,
                  "served_rows_exact": false
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "idsCreditorType",
                  "label": "IDS creditor type"
                },
                "label": "IDS creditor type"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "IDSCreditorTypePROP",
                      "label": "other private creditors (IDS creditor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 55,
                  "served_rows_exact": true
                },
                {
                  "value": {
                    "ref": {
                      "ref": "IDSCreditorTypeOFFT",
                      "label": "official creditors (IDS creditor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 55,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "idsDebtorType",
                  "label": "IDS debtor type"
                },
                "label": "IDS debtor type"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "IDSDebtorTypeOPS",
                      "label": "other public sector (IDS debtor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 365,
                  "served_rows_exact": false
                },
                {
                  "value": {
                    "ref": {
                      "ref": "IDSDebtorTypePS",
                      "label": "public sector (IDS debtor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 453,
                  "served_rows_exact": false
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "includesIMFCredit",
                  "label": "includes IMF credit"
                },
                "label": "includes IMF credit"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "WithoutIMFCredit",
                      "label": "without IMF credit"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 63,
                  "served_rows_exact": false
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "maturityBand",
                  "label": "maturity band"
                },
                "label": "maturity band"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "LongTermMaturity",
                      "label": "long-term maturity"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 63,
                  "served_rows_exact": false
                }
              ],
              "truncated": true,
              "source": "observed"
            }
          ],
          "entity_options": [],
          "facet_options": [],
          "rendered_sentence": "Ghana's external debt service owed to all creditors, 1970 to 2024. Current US dollars · World Bank International Debt Statistics (IDS).",
          "trace": {
            "resolved_entities": [
              {
                "ref": "country/GHA",
                "label": "Ghana"
              }
            ],
            "resolved_sources": [
              {
                "ref": "provenance/WorldBankInternationalDebtStatistics",
                "label": "World Bank International Debt Statistics (IDS)",
                "source": {
                  "ref": "dc/s/WorldBank",
                  "label": "World Bank"
                },
                "data_commons": {
                  "id": "dfo",
                  "label": "Development Finance Observatory"
                }
              }
            ],
            "slot_filters": [],
            "query_qualifiers": [],
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
          "unit_conversion": {
            "currencies": [
              {
                "code": "AED",
                "noun": "UAE dirhams",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AFN",
                "noun": "Afghan afghanis",
                "current_years": {
                  "start_year": 2002,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 2002,
                "base_year_max": 2025
              },
              {
                "code": "ALL",
                "noun": "Albanian leks",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AMD",
                "noun": "Armenian drams",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "AOA",
                "noun": "Angolan kwanzas",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "ARS",
                "noun": "Argentine pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AUD",
                "noun": "Australian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AWG",
                "noun": "Aruban florins",
                "current_years": {
                  "start_year": 1995,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2025
              },
              {
                "code": "AZN",
                "noun": "Azerbaijani manats",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "BAM",
                "noun": "Bosnia-Herzegovina convertible marks",
                "current_years": {
                  "start_year": 1996,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1996,
                "base_year_max": 2025
              },
              {
                "code": "BBD",
                "noun": "Barbadian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BDT",
                "noun": "Bangladeshi taka",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BHD",
                "noun": "Bahraini dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BIF",
                "noun": "Burundian francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BND",
                "noun": "Brunei dollars",
                "current_years": {
                  "start_year": 1985,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1985,
                "base_year_max": 2025
              },
              {
                "code": "BOB",
                "noun": "Bolivian bolivianos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BRL",
                "noun": "Brazilian reais",
                "current_years": {
                  "start_year": 1986,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "BSD",
                "noun": "Bahamian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BTN",
                "noun": "Bhutanese ngultrums",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BWP",
                "noun": "Botswana pula",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BYN",
                "noun": "Belarusian rubles",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "BZD",
                "noun": "Belize dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CAD",
                "noun": "Canadian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CDF",
                "noun": "Congolese francs",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "CHF",
                "noun": "Swiss francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CLP",
                "noun": "Chilean pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CNY",
                "noun": "Chinese yuan",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "COP",
                "noun": "Colombian pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CRC",
                "noun": "Costa Rican colones",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CVE",
                "noun": "Cape Verdean escudos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CZK",
                "noun": "Czech korunas",
                "current_years": {
                  "start_year": 1995,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2025
              },
              {
                "code": "DJF",
                "noun": "Djiboutian francs",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "DKK",
                "noun": "Danish kroner",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "DOP",
                "noun": "Dominican pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "DZD",
                "noun": "Algerian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EGP",
                "noun": "Egyptian pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ERN",
                "noun": "Eritrean nakfas",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2019
              },
              {
                "code": "ETB",
                "noun": "Ethiopian birr",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EUR",
                "noun": "euros",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "FJD",
                "noun": "Fijian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GBP",
                "noun": "British pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GEL",
                "noun": "Georgian lari",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1994,
                "base_year_max": 2025
              },
              {
                "code": "GHS",
                "noun": "Ghanaian cedis",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GMD",
                "noun": "Gambian dalasis",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GNF",
                "noun": "Guinean francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GTQ",
                "noun": "Guatemalan quetzales",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GYD",
                "noun": "Guyanese dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HKD",
                "noun": "Hong Kong dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HNL",
                "noun": "Honduran lempiras",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HTG",
                "noun": "Haitian gourdes",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HUF",
                "noun": "Hungarian forints",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "IDR",
                "noun": "Indonesian rupiahs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ILS",
                "noun": "Israeli new shekels",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "INR",
                "noun": "Indian rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "IQD",
                "noun": "Iraqi dinars",
                "current_years": {
                  "start_year": 2000,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2025
              },
              {
                "code": "IRR",
                "noun": "Iranian rials",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ISK",
                "noun": "Icelandic krónur",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JMD",
                "noun": "Jamaican dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JOD",
                "noun": "Jordanian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JPY",
                "noun": "Japanese yen",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KES",
                "noun": "Kenyan shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KGS",
                "noun": "Kyrgyz soms",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "KHR",
                "noun": "Cambodian riels",
                "current_years": {
                  "start_year": 1986,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "KMF",
                "noun": "Comorian francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KRW",
                "noun": "South Korean won",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KWD",
                "noun": "Kuwaiti dinars",
                "current_years": {
                  "start_year": 1981,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1981,
                "base_year_max": 2025
              },
              {
                "code": "KZT",
                "noun": "Kazakh tenge",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "LAK",
                "noun": "Lao kip",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LBP",
                "noun": "Lebanese pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LKR",
                "noun": "Sri Lankan rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2024
              },
              {
                "code": "LSL",
                "noun": "Lesotho maloti",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LYD",
                "noun": "Libyan dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MAD",
                "noun": "Moroccan dirhams",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MDL",
                "noun": "Moldovan lei",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MGA",
                "noun": "Malagasy ariary",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MKD",
                "noun": "Macedonian denars",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MMK",
                "noun": "Myanmar kyats",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "MNT",
                "noun": "Mongolian tugriks",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MOP",
                "noun": "Macanese patacas",
                "current_years": {
                  "start_year": 2001,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 2001,
                "base_year_max": 2025
              },
              {
                "code": "MRU",
                "noun": "Mauritanian ouguiyas",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "MUR",
                "noun": "Mauritian rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MVR",
                "noun": "Maldivian rufiyaa",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MWK",
                "noun": "Malawian kwachas",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MXN",
                "noun": "Mexican pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MYR",
                "noun": "Malaysian ringgits",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MZN",
                "noun": "Mozambican meticais",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NAD",
                "noun": "Namibian dollars",
                "current_years": {
                  "start_year": 1989,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1989,
                "base_year_max": 2025
              },
              {
                "code": "NGN",
                "noun": "Nigerian naira",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "NIO",
                "noun": "Nicaraguan córdobas",
                "current_years": {
                  "start_year": 1987,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "NOK",
                "noun": "Norwegian kroner",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NPR",
                "noun": "Nepalese rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NZD",
                "noun": "New Zealand dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "OMR",
                "noun": "Omani rials",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PEN",
                "noun": "Peruvian soles",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PGK",
                "noun": "Papua New Guinean kina",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PHP",
                "noun": "Philippine pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PKR",
                "noun": "Pakistani rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PLN",
                "noun": "Polish zlotys",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PYG",
                "noun": "Paraguayan guaranís",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "QAR",
                "noun": "Qatari riyals",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "RON",
                "noun": "Romanian lei",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "RSD",
                "noun": "Serbian dinars",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "RUB",
                "noun": "Russian rubles",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "RWF",
                "noun": "Rwandan francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SAR",
                "noun": "Saudi riyals",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SBD",
                "noun": "Solomon Islands dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SCR",
                "noun": "Seychellois rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SDG",
                "noun": "Sudanese pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SEK",
                "noun": "Swedish kronor",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SGD",
                "noun": "Singapore dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SLE",
                "noun": "Sierra Leonean leones",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SRD",
                "noun": "Surinamese dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SSP",
                "noun": "South Sudanese pounds",
                "current_years": {
                  "start_year": 2011,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 2011,
                "base_year_max": 2025
              },
              {
                "code": "STN",
                "noun": "São Tomé and Príncipe dobras",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SYP",
                "noun": "Syrian pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2010
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2010
              },
              {
                "code": "SZL",
                "noun": "Swazi emalangeni",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "THB",
                "noun": "Thai baht",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TJS",
                "noun": "Tajikistani somonis",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TMT",
                "noun": "Turkmenistani manat",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TND",
                "noun": "Tunisian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TOP",
                "noun": "Tongan paʻanga",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TRY",
                "noun": "Turkish lira",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TTD",
                "noun": "Trinidad and Tobago dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TWD",
                "noun": "New Taiwan dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TZS",
                "noun": "Tanzanian shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UAH",
                "noun": "Ukrainian hryvnias",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "UGX",
                "noun": "Ugandan shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "USD",
                "noun": "US dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UYU",
                "noun": "Uruguayan pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UZS",
                "noun": "Uzbekistani soms",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
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
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 2017,
                "base_year_max": 2025
              },
              {
                "code": "VND",
                "noun": "Vietnamese dong",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "VUV",
                "noun": "Vanuatu vatu",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "WST",
                "noun": "Samoan tala",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XAF",
                "noun": "Central African CFA francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XCD",
                "noun": "East Caribbean dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XOF",
                "noun": "West African CFA francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "YER",
                "noun": "Yemeni rials",
                "current_years": {
                  "start_year": 2014,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 2014,
                "base_year_max": 2025
              },
              {
                "code": "ZAR",
                "noun": "South African rand",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ZMW",
                "noun": "Zambian kwachas",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              }
            ],
            "default_base_year": 2024,
            "role_currencies": {
              "destination": "GHS"
            }
          }
        }
      }
    }
  ],
  "rendered_sentence": "Ghana's external debt service owed to all creditors, 1970 to 2024. Current US dollars · World Bank International Debt Statistics (IDS).",
  "sentence_plan": [
    {
      "kind": "slot",
      "text": "Ghana",
      "axis": "where",
      "segment": "heading",
      "role": "destination",
      "binding_ref": "where:",
      "entity_refs": [
        "country/GHA"
      ],
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
      "text": "external debt service",
      "axis": "what",
      "segment": "heading",
      "entity_refs": [],
      "states": [
        "how:financialFlowType",
        "axis:populationType",
        "axis:measuredProperty",
        "axis:statType"
      ],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "financingResource",
      "binding_ref": "how:financingResource",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "guaranteeStatus",
      "binding_ref": "how:guaranteeStatus",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "idsConcessionality",
      "binding_ref": "how:idsConcessionality",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "idsCreditorType",
      "binding_ref": "how:idsCreditorType",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "idsDebtorType",
      "binding_ref": "how:idsDebtorType",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "includesIMFCredit",
      "binding_ref": "how:includesIMFCredit",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "maturityBand",
      "binding_ref": "how:maturityBand",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "netOf",
      "binding_ref": "how:netOf",
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
      "kind": "text",
      "text": " owed to ",
      "segment": "heading",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "slot",
      "text": "all creditors",
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
      "text": "1970 to 2024",
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
      "text": "World Bank International Debt Statistics (IDS)",
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

export const unitHealth: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "health expenditure in Kenya",
    "normalized_query": "health expenditure in Kenya",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "4a56f6e1696f47a4b01802b258c93baa",
    "warnings": [],
    "timing_ms": {
      "total": 2833
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
      "variable_text": "health expenditure",
      "warnings": [],
      "timing_ms": {
        "total": 1782
      },
      "restatement": {
        "variable_text": "health expenditure",
        "entities": [
          {
            "text": "Kenya"
          }
        ],
        "operations": []
      },
      "operations": [],
      "departures": [],
      "status": "definite",
      "spec": {
        "spec_id": "spec_0002907ee44bf25fc98f343372614a84",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_0002907ee44bf25fc98f343372614a84",
          "identity": {
            "identity_version": "spec1",
            "shape": {
              "kind": "statvar_schema",
              "population_type": "EconomicActivity",
              "measured_property": "amount",
              "stat_type": "measuredValue",
              "measurement_denominator": {
                "ref": "Count_Person"
              }
            },
            "slots": [
              {
                "property": "activitySource",
                "binding": {
                  "state": "value",
                  "ref": "ExpenditureActivity"
                }
              },
              {
                "property": "expenditureType",
                "binding": {
                  "state": "value",
                  "ref": "HealthcareExpenditure"
                }
              }
            ],
            "entities": {
              "observationAbout": [
                "country/KEN"
              ]
            },
            "requested_window": {
              "kind": "all"
            }
          }
        },
        "resolved": {
          "shape": {
            "shape_id": "economicactivity_amount_measuredvalue_per_count_person",
            "label": "Healthcare expenditure per person",
            "population_type": {
              "ref": "EconomicActivity",
              "label": "EconomicActivity"
            },
            "measured_property": {
              "ref": "amount",
              "label": "amount"
            },
            "stat_type": {
              "ref": "measuredValue",
              "label": "measuredValue"
            },
            "measurement_denominator": {
              "ref": "Count_Person",
              "label": "Total population"
            },
            "measurement_denominator_unresolved": false,
            "slot_keys": [
              {
                "axis": "how",
                "property": {
                  "ref": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              {
                "axis": "how",
                "property": {
                  "ref": "expenditureType",
                  "label": "expenditureType"
                },
                "label": "expenditure type"
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
            "member_count": 1,
            "refine_supported": true,
            "data_commons": [
              {
                "id": "base",
                "label": "Data Commons by Google"
              }
            ],
            "upstream": {
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
          "slots": [
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "ref": "ExpenditureActivity",
                    "label": "ExpenditureActivity"
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
                  "ref": "expenditureType",
                  "label": "expenditureType"
                },
                "label": "expenditure type"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "ref": "HealthcareExpenditure",
                    "label": "HealthcareExpenditure"
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
                "kind": "unbound"
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
          "inapplicable_slots": [],
          "unresolved_slots": [],
          "stat_vars": {
            "member_count": 1,
            "member_count_exact": false,
            "served_count": 1,
            "data_date_range": {
              "start": "2000",
              "end": "2023"
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
            "observation_count": 24,
            "evidence": "observed",
            "dimensions": [
              {
                "label": "sources",
                "count": 1
              },
              {
                "label": "observations",
                "count": 24
              },
              {
                "label": "variables",
                "count": 1
              }
            ]
          },
          "download": {
            "rows": 24,
            "rows_exact": true,
            "series": 1,
            "window": {
              "start_year": 2000,
              "end_year": 2023
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
            },
            "unit": {
              "basis": "fallback",
              "ref": "InternationalDollar",
              "label": "InternationalDollar"
            }
          },
          "slot_options": [
            {
              "key": {
                "axis": "how",
                "property": {
                  "ref": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "ExpenditureActivity",
                      "label": "ExpenditureActivity"
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
                  "ref": "expenditureType",
                  "label": "expenditureType"
                },
                "label": "expenditure type"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "HealthcareExpenditure",
                      "label": "HealthcareExpenditure"
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
          "rendered_sentence": "Kenya's health expenditure per capita in international dollars, 2000 to 2023. World Development Indicators.",
          "trace": {
            "resolved_entities": [
              {
                "ref": "country/KEN",
                "label": "Kenya"
              }
            ],
            "resolved_sources": [
              {
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
            ],
            "slot_filters": [],
            "query_qualifiers": [],
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
            "ref": "dc/g/EconomicActivity_ActivitySource-ExpenditureActivity_ExpenditureType",
            "label": "Economic Activity With Activity Source = Expenditure Activity, Expenditure Type"
          },
          "related_measures": [
            {
              "stat_var": {
                "ref": "Amount_EconomicActivity_ExpenditureActivity_TertiaryEducationExpenditure_Government_AsFractionOf_Amount_EconomicActivity_ExpenditureActivity_EducationExpenditure_Government",
                "label": "Fraction of Government Expenditure on Tertiary Education"
              },
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_d672fed8d022cb7e1f9bf84fd9da292e",
                "identity": {
                  "identity_version": "spec1",
                  "shape": {
                    "kind": "statvar_schema",
                    "population_type": "EconomicActivity",
                    "measured_property": "amount",
                    "stat_type": "measuredValue",
                    "measurement_denominator": {
                      "ref": "Amount_EconomicActivity_ExpenditureActivity_EducationExpenditure_Government"
                    }
                  },
                  "slots": [
                    {
                      "property": "activitySource",
                      "binding": {
                        "state": "value",
                        "ref": "ExpenditureActivity"
                      }
                    },
                    {
                      "property": "expenditureType",
                      "binding": {
                        "state": "value",
                        "ref": "TertiaryEducationExpenditure"
                      }
                    },
                    {
                      "property": "remunerator",
                      "binding": {
                        "state": "value",
                        "ref": "Government"
                      }
                    }
                  ],
                  "entities": {
                    "observationAbout": [
                      "country/KEN"
                    ]
                  },
                  "requested_window": {
                    "kind": "all"
                  }
                }
              }
            }
          ]
        }
      }
    }
  ],
  "rendered_sentence": "Kenya's health expenditure per capita in international dollars, 2000 to 2023. World Development Indicators.",
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
      "text": "health expenditure",
      "axis": "what",
      "segment": "heading",
      "entity_refs": [],
      "states": [
        "how:activitySource",
        "how:expenditureType",
        "axis:populationType",
        "axis:measuredProperty",
        "axis:statType"
      ],
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
      "text": "per capita in international dollars",
      "axis": "unit",
      "segment": "heading",
      "binding_ref": "unit:",
      "entity_refs": [],
      "states": [
        "unit:"
      ],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "activitySource",
      "binding_ref": "how:activitySource",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "expenditureType",
      "binding_ref": "how:expenditureType",
      "entity_refs": [],
      "states": [],
      "part_index": 0
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
      "text": "2000 to 2023",
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

export const unitAidLoans: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "aid and loans from Germany to Kenya",
    "normalized_query": "aid and loans from Germany to Kenya",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "eade1f25047d489d95a518d7034b9e03",
    "warnings": [],
    "timing_ms": {
      "total": 3178
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
      "variable_text": "aid",
      "warnings": [
        {
          "code": "observations_series_truncated",
          "severity": "warn",
          "message": "showing 20 of 486 confirmed series (a stable, identity-ordered selection, not ranked by value); the rest are not shown.",
          "spec_id": "spec_9922487e367b03ff16093bdf35cbb946",
          "params": {
            "shown": 20,
            "total": 486
          }
        }
      ],
      "timing_ms": {
        "total": 2174
      },
      "restatement": {
        "variable_text": "aid",
        "entities": [
          {
            "text": "Germany",
            "role_text": "from"
          },
          {
            "text": "Kenya",
            "role_text": "to"
          }
        ],
        "operations": []
      },
      "operations": [],
      "departures": [],
      "status": "definite",
      "spec": {
        "spec_id": "spec_9922487e367b03ff16093bdf35cbb946",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_9922487e367b03ff16093bdf35cbb946",
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
              ],
              "origin": [
                "country/DEU"
              ]
            },
            "requested_window": {
              "kind": "all"
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
                "kind": "unbound"
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
            "member_count": 486,
            "member_count_exact": true,
            "served_count": 486,
            "data_date_range": {
              "start": "2001",
              "end": "2009"
            }
          },
          "entities": [
            {
              "ref": "country/KEN",
              "label": "Kenya",
              "entity_type": "Country",
              "role": "destination"
            },
            {
              "ref": "country/DEU",
              "label": "Germany",
              "entity_type": "Country",
              "role": "origin"
            }
          ],
          "coverage": {
            "kind": "exact",
            "has_data": true,
            "observation_count": 2426,
            "evidence": "observed",
            "dimensions": [
              {
                "label": "sources",
                "count": 1
              },
              {
                "label": "observations",
                "count": 33
              },
              {
                "label": "variables",
                "count": 486
              }
            ]
          },
          "headline": {
            "year": 2024,
            "year_named": false,
            "observations": 152,
            "series": 152,
            "role_counts": {
              "financingProvider": 1,
              "financingRecipient": 1
            },
            "recent_years": [
              {
                "year": 2024,
                "observations": 152,
                "series": 152,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              },
              {
                "year": 2023,
                "observations": 119,
                "series": 119,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              },
              {
                "year": 2022,
                "observations": 112,
                "series": 112,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              }
            ]
          },
          "download": {
            "rows": 2426,
            "rows_exact": true,
            "series": 486,
            "window": {
              "start_year": 1973,
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
                  "served_rows": 10,
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
                  "served_rows": 1,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
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
                  "served_rows": 74,
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
                  "served_rows": 71,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
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
                  "served_rows": 1811,
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
                  "served_rows": 1811,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
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
                  "served_rows": 2426,
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
                  "served_rows": 33,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
              "source": "observed"
            }
          ],
          "entity_options": [],
          "facet_options": [],
          "rendered_sentence": "Germany's gross ODA disbursements to Kenya, 1973 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
          "trace": {
            "resolved_entities": [
              {
                "ref": "country/KEN",
                "label": "Kenya"
              },
              {
                "ref": "country/DEU",
                "label": "Germany"
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
            "query_qualifiers": [],
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
                "spec_id": "spec_e46e3d84b6a1a75a10881a42faf18df7",
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
                    ],
                    "origin": [
                      "country/DEU"
                    ]
                  },
                  "requested_window": {
                    "kind": "all"
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
              "served_rows": 2428,
              "served_rows_exact": true
            },
            {
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_6a08ae07984846bcd8043142a34510af",
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
                    ],
                    "origin": [
                      "country/DEU"
                    ]
                  },
                  "requested_window": {
                    "kind": "all"
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
              "served_rows": 2154,
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
              "distinct_count": 159,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "ref": "CRSPurposeCode14030",
                    "label": "basic drinking water supply and basic sanitation"
                  },
                  "count": 8
                },
                {
                  "value": {
                    "ref": "CRSPurposeCode31120",
                    "label": "agricultural development"
                  },
                  "count": 8
                }
              ]
            },
            {
              "property": "crsTypeOfFinance",
              "varies": true,
              "distinct_count": 6,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "ref": "CRSTypeOfFinance110",
                    "label": "standard grant"
                  },
                  "count": 429
                },
                {
                  "value": {
                    "ref": "CRSTypeOfFinance421",
                    "label": "standard loan"
                  },
                  "count": 48
                }
              ]
            },
            {
              "property": "crsCooperationModality",
              "varies": true,
              "distinct_count": 13,
              "undeclared_count": 123,
              "values": [
                {
                  "value": {
                    "ref": "CRSCooperationModalityC01",
                    "label": "project-type intervention"
                  },
                  "count": 128
                },
                {
                  "value": {
                    "ref": "CRSCooperationModalityB03",
                    "label": "contribution to specific-purpose programme and fund managed by an international organisation"
                  },
                  "count": 74
                }
              ]
            }
          ],
          "unit_conversion": {
            "currencies": [
              {
                "code": "AED",
                "noun": "UAE dirhams",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2021
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "AFN",
                "noun": "Afghan afghanis",
                "current_years": {
                  "start_year": 2002,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2002,
                "base_year_max": 2025
              },
              {
                "code": "ALL",
                "noun": "Albanian leks",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AMD",
                "noun": "Armenian drams",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "AOA",
                "noun": "Angolan kwanzas",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "ARS",
                "noun": "Argentine pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AUD",
                "noun": "Australian dollars",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "AWG",
                "noun": "Aruban florins",
                "current_years": {
                  "start_year": 1995,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2025
              },
              {
                "code": "AZN",
                "noun": "Azerbaijani manats",
                "current_years": {
                  "start_year": 2014,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "BAM",
                "noun": "Bosnia-Herzegovina convertible marks",
                "current_years": {
                  "start_year": 1996,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1996,
                "base_year_max": 2025
              },
              {
                "code": "BBD",
                "noun": "Barbadian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BDT",
                "noun": "Bangladeshi taka",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BHD",
                "noun": "Bahraini dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BIF",
                "noun": "Burundian francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BND",
                "noun": "Brunei dollars",
                "current_years": {
                  "start_year": 1985,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1985,
                "base_year_max": 2025
              },
              {
                "code": "BOB",
                "noun": "Bolivian bolivianos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BRL",
                "noun": "Brazilian reais",
                "current_years": {
                  "start_year": 1986,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "BSD",
                "noun": "Bahamian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BTN",
                "noun": "Bhutanese ngultrums",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BWP",
                "noun": "Botswana pula",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BYN",
                "noun": "Belarusian rubles",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "BZD",
                "noun": "Belize dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CAD",
                "noun": "Canadian dollars",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CDF",
                "noun": "Congolese francs",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "CHF",
                "noun": "Swiss francs",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CLP",
                "noun": "Chilean pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CNY",
                "noun": "Chinese yuan",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "COP",
                "noun": "Colombian pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CRC",
                "noun": "Costa Rican colones",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CVE",
                "noun": "Cape Verdean escudos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CZK",
                "noun": "Czech korunas",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "DJF",
                "noun": "Djiboutian francs",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "DKK",
                "noun": "Danish kroner",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "DOP",
                "noun": "Dominican pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "DZD",
                "noun": "Algerian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EGP",
                "noun": "Egyptian pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ERN",
                "noun": "Eritrean nakfas",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2019
              },
              {
                "code": "ETB",
                "noun": "Ethiopian birr",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EUR",
                "noun": "euros",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1973,
                "base_year_max": 2025
              },
              {
                "code": "FJD",
                "noun": "Fijian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GBP",
                "noun": "British pounds",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "GEL",
                "noun": "Georgian lari",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1994,
                "base_year_max": 2025
              },
              {
                "code": "GHS",
                "noun": "Ghanaian cedis",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GMD",
                "noun": "Gambian dalasis",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GNF",
                "noun": "Guinean francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GTQ",
                "noun": "Guatemalan quetzales",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GYD",
                "noun": "Guyanese dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HKD",
                "noun": "Hong Kong dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HNL",
                "noun": "Honduran lempiras",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HTG",
                "noun": "Haitian gourdes",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HUF",
                "noun": "Hungarian forints",
                "current_years": {
                  "start_year": 2003,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2003,
                "base_year_max": 2025
              },
              {
                "code": "IDR",
                "noun": "Indonesian rupiahs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ILS",
                "noun": "Israeli new shekels",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "INR",
                "noun": "Indian rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "IQD",
                "noun": "Iraqi dinars",
                "current_years": {
                  "start_year": 2000,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2025
              },
              {
                "code": "IRR",
                "noun": "Iranian rials",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ISK",
                "noun": "Icelandic krónur",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "JMD",
                "noun": "Jamaican dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JOD",
                "noun": "Jordanian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JPY",
                "noun": "Japanese yen",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "KES",
                "noun": "Kenyan shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KGS",
                "noun": "Kyrgyz soms",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "KHR",
                "noun": "Cambodian riels",
                "current_years": {
                  "start_year": 1986,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "KMF",
                "noun": "Comorian francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KRW",
                "noun": "South Korean won",
                "current_years": {
                  "start_year": 1987,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "KWD",
                "noun": "Kuwaiti dinars",
                "current_years": {
                  "start_year": 1995,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2024
              },
              {
                "code": "KZT",
                "noun": "Kazakh tenge",
                "current_years": {
                  "start_year": 2013,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2013,
                "base_year_max": 2024
              },
              {
                "code": "LAK",
                "noun": "Lao kip",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LBP",
                "noun": "Lebanese pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LKR",
                "noun": "Sri Lankan rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2024
              },
              {
                "code": "LSL",
                "noun": "Lesotho maloti",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LYD",
                "noun": "Libyan dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MAD",
                "noun": "Moroccan dirhams",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MDL",
                "noun": "Moldovan lei",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MGA",
                "noun": "Malagasy ariary",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MKD",
                "noun": "Macedonian denars",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MMK",
                "noun": "Myanmar kyats",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "MNT",
                "noun": "Mongolian tugriks",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MOP",
                "noun": "Macanese patacas",
                "current_years": {
                  "start_year": 2001,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2001,
                "base_year_max": 2025
              },
              {
                "code": "MRU",
                "noun": "Mauritanian ouguiyas",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "MUR",
                "noun": "Mauritian rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MVR",
                "noun": "Maldivian rufiyaa",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MWK",
                "noun": "Malawian kwachas",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MXN",
                "noun": "Mexican pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MYR",
                "noun": "Malaysian ringgits",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MZN",
                "noun": "Mozambican meticais",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NAD",
                "noun": "Namibian dollars",
                "current_years": {
                  "start_year": 1989,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1989,
                "base_year_max": 2025
              },
              {
                "code": "NGN",
                "noun": "Nigerian naira",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "NIO",
                "noun": "Nicaraguan córdobas",
                "current_years": {
                  "start_year": 1987,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "NOK",
                "noun": "Norwegian kroner",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "NPR",
                "noun": "Nepalese rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NZD",
                "noun": "New Zealand dollars",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1961,
                "base_year_max": 2025
              },
              {
                "code": "OMR",
                "noun": "Omani rials",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PEN",
                "noun": "Peruvian soles",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PGK",
                "noun": "Papua New Guinean kina",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PHP",
                "noun": "Philippine pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PKR",
                "noun": "Pakistani rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PLN",
                "noun": "Polish zlotys",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "PYG",
                "noun": "Paraguayan guaranís",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "QAR",
                "noun": "Qatari riyals",
                "current_years": {
                  "start_year": 1985,
                  "end_year": 1990
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "RON",
                "noun": "Romanian lei",
                "current_years": {
                  "start_year": 2013,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2013,
                "base_year_max": 2025
              },
              {
                "code": "RSD",
                "noun": "Serbian dinars",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "RUB",
                "noun": "Russian rubles",
                "current_years": {
                  "start_year": 2010,
                  "end_year": 2020
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2010,
                "base_year_max": 2020
              },
              {
                "code": "RWF",
                "noun": "Rwandan francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SAR",
                "noun": "Saudi riyals",
                "current_years": {
                  "start_year": 2000,
                  "end_year": 2023
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2023
              },
              {
                "code": "SBD",
                "noun": "Solomon Islands dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SCR",
                "noun": "Seychellois rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SDG",
                "noun": "Sudanese pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SEK",
                "noun": "Swedish kronor",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "SGD",
                "noun": "Singapore dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SLE",
                "noun": "Sierra Leonean leones",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SRD",
                "noun": "Surinamese dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SSP",
                "noun": "South Sudanese pounds",
                "current_years": {
                  "start_year": 2011,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2011,
                "base_year_max": 2025
              },
              {
                "code": "STN",
                "noun": "São Tomé and Príncipe dobras",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SYP",
                "noun": "Syrian pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2010
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2010
              },
              {
                "code": "SZL",
                "noun": "Swazi emalangeni",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "THB",
                "noun": "Thai baht",
                "current_years": {
                  "start_year": 2006,
                  "end_year": 2016
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2018,
                "base_year_max": 2024
              },
              {
                "code": "TJS",
                "noun": "Tajikistani somonis",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TMT",
                "noun": "Turkmenistani manat",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TND",
                "noun": "Tunisian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TOP",
                "noun": "Tongan paʻanga",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TRY",
                "noun": "Turkish lira",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "TTD",
                "noun": "Trinidad and Tobago dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TWD",
                "noun": "New Taiwan dollars",
                "current_years": {
                  "start_year": 2006,
                  "end_year": 2016
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2024
              },
              {
                "code": "TZS",
                "noun": "Tanzanian shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UAH",
                "noun": "Ukrainian hryvnias",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "UGX",
                "noun": "Ugandan shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "USD",
                "noun": "US dollars",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "UYU",
                "noun": "Uruguayan pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UZS",
                "noun": "Uzbekistani soms",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
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
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2017,
                "base_year_max": 2025
              },
              {
                "code": "VND",
                "noun": "Vietnamese dong",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "VUV",
                "noun": "Vanuatu vatu",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "WST",
                "noun": "Samoan tala",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XAF",
                "noun": "Central African CFA francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XCD",
                "noun": "East Caribbean dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XOF",
                "noun": "West African CFA francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "YER",
                "noun": "Yemeni rials",
                "current_years": {
                  "start_year": 2014,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2014,
                "base_year_max": 2025
              },
              {
                "code": "ZAR",
                "noun": "South African rand",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ZMW",
                "noun": "Zambian kwachas",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              }
            ],
            "default_base_year": 2024,
            "role_currencies": {
              "destination": "KES",
              "origin": "EUR"
            }
          }
        }
      }
    },
    {
      "variable_text": "loans",
      "warnings": [
        {
          "code": "role_declaration_unverified",
          "severity": "warn",
          "message": "the graph read confirming which entity roles these members declare was not completed, so the answer stands on the role declarations frozen in the packaged code index."
        },
        {
          "code": "observations_series_truncated",
          "severity": "warn",
          "message": "showing 20 of 510 confirmed series (a stable, identity-ordered selection, not ranked by value); the rest are not shown.",
          "spec_id": "spec_515fe76b585ece91957c7d1d1bc60846",
          "params": {
            "shown": 20,
            "total": 510
          }
        }
      ],
      "timing_ms": {
        "total": 2840
      },
      "restatement": {
        "variable_text": "loans",
        "entities": [
          {
            "text": "Germany",
            "role_text": "from"
          },
          {
            "text": "Kenya",
            "role_text": "to"
          }
        ],
        "operations": []
      },
      "operations": [],
      "departures": [],
      "status": "definite",
      "spec": {
        "spec_id": "spec_515fe76b585ece91957c7d1d1bc60846",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_515fe76b585ece91957c7d1d1bc60846",
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
                  "state": "unbound"
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
              ],
              "origin": [
                "country/DEU"
              ]
            },
            "requested_window": {
              "kind": "all"
            }
          }
        },
        "resolved": {
          "shape": {
            "shape_id": "financialflow_amount_measuredvalue_nominal",
            "label": "gross disbursements",
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
                "axis": "how",
                "property": {
                  "ref": "crsCooperationModality",
                  "label": "CRS cooperation modality"
                },
                "label": "modality"
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
            "member_count": 6310,
            "member_digest": "377d206a9dd44b96b41e1e6701d594ceef898f8737bb81c1afcb8616fd9d7570",
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
                "kind": "unbound"
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
                "kind": "unbound"
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
            "member_count": 510,
            "member_count_exact": true,
            "served_count": 510,
            "data_date_range": {
              "start": "2001",
              "end": "2009"
            }
          },
          "entities": [
            {
              "ref": "country/KEN",
              "label": "Kenya",
              "entity_type": "Country",
              "role": "destination"
            },
            {
              "ref": "country/DEU",
              "label": "Germany",
              "entity_type": "Country",
              "role": "origin"
            }
          ],
          "coverage": {
            "kind": "exact",
            "has_data": true,
            "observation_count": 2463,
            "evidence": "observed",
            "dimensions": [
              {
                "label": "sources",
                "count": 1
              },
              {
                "label": "observations",
                "count": 33
              },
              {
                "label": "variables",
                "count": 510
              }
            ]
          },
          "headline": {
            "year": 2024,
            "year_named": false,
            "observations": 155,
            "series": 155,
            "role_counts": {
              "financingProvider": 1,
              "financingRecipient": 1
            },
            "recent_years": [
              {
                "year": 2024,
                "observations": 155,
                "series": 155,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              },
              {
                "year": 2023,
                "observations": 122,
                "series": 122,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              },
              {
                "year": 2022,
                "observations": 118,
                "series": 118,
                "role_counts": {
                  "financingProvider": 1,
                  "financingRecipient": 1
                }
              }
            ]
          },
          "download": {
            "rows": 2463,
            "rows_exact": true,
            "series": 510,
            "window": {
              "start_year": 1973,
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
                  "served_rows": 76,
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
                  "served_rows": 72,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
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
                  "served_rows": 1811,
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
                  "served_rows": 1811,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
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
                  "served_rows": 2426,
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
                  "served_rows": 33,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
              "source": "observed"
            },
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
                  "served_rows": 10,
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
                  "served_rows": 1,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
              "source": "observed"
            }
          ],
          "entity_options": [],
          "facet_options": [],
          "rendered_sentence": "Germany's gross disbursements to Kenya, 1973 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
          "trace": {
            "resolved_entities": [
              {
                "ref": "country/KEN",
                "label": "Kenya"
              },
              {
                "ref": "country/DEU",
                "label": "Germany"
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
            "query_qualifiers": [],
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
                "spec_id": "spec_e186fd09205423eb659c998c5d808b83",
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
                        "state": "unbound"
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
                    ],
                    "origin": [
                      "country/DEU"
                    ]
                  },
                  "requested_window": {
                    "kind": "all"
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
              "served_rows": 2471,
              "served_rows_exact": true
            },
            {
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_544845de358832d79991ada9334126a5",
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
                        "state": "unbound"
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
                    ],
                    "origin": [
                      "country/DEU"
                    ]
                  },
                  "requested_window": {
                    "kind": "all"
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
              "served_rows": 2198,
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
              "distinct_count": 161,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "ref": "CRSPurposeCode99810",
                    "label": "sectors not specified"
                  },
                  "count": 9
                },
                {
                  "value": {
                    "ref": "CRSPurposeCode14030",
                    "label": "basic drinking water supply and basic sanitation"
                  },
                  "count": 8
                }
              ]
            },
            {
              "property": "crsTypeOfFinance",
              "varies": true,
              "distinct_count": 8,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "ref": "CRSTypeOfFinance110",
                    "label": "standard grant"
                  },
                  "count": 429
                },
                {
                  "value": {
                    "ref": "CRSTypeOfFinance421",
                    "label": "standard loan"
                  },
                  "count": 68
                }
              ]
            },
            {
              "property": "crsTypeOfFlow",
              "varies": true,
              "distinct_count": 3,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "ref": "CRSTypeOfFlow10",
                    "label": "official development assistance"
                  },
                  "count": 486
                },
                {
                  "value": {
                    "ref": "CRSTypeOfFlow21",
                    "label": "non-export credit official flow"
                  },
                  "count": 21
                }
              ]
            },
            {
              "property": "crsCooperationModality",
              "varies": true,
              "distinct_count": 13,
              "undeclared_count": 134,
              "values": [
                {
                  "value": {
                    "ref": "CRSCooperationModalityC01",
                    "label": "project-type intervention"
                  },
                  "count": 141
                },
                {
                  "value": {
                    "ref": "CRSCooperationModalityB03",
                    "label": "contribution to specific-purpose programme and fund managed by an international organisation"
                  },
                  "count": 74
                }
              ]
            }
          ],
          "unit_conversion": {
            "currencies": [
              {
                "code": "AED",
                "noun": "UAE dirhams",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2021
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "AFN",
                "noun": "Afghan afghanis",
                "current_years": {
                  "start_year": 2002,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2002,
                "base_year_max": 2025
              },
              {
                "code": "ALL",
                "noun": "Albanian leks",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AMD",
                "noun": "Armenian drams",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "AOA",
                "noun": "Angolan kwanzas",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "ARS",
                "noun": "Argentine pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AUD",
                "noun": "Australian dollars",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "AWG",
                "noun": "Aruban florins",
                "current_years": {
                  "start_year": 1995,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2025
              },
              {
                "code": "AZN",
                "noun": "Azerbaijani manats",
                "current_years": {
                  "start_year": 2014,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "BAM",
                "noun": "Bosnia-Herzegovina convertible marks",
                "current_years": {
                  "start_year": 1996,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1996,
                "base_year_max": 2025
              },
              {
                "code": "BBD",
                "noun": "Barbadian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BDT",
                "noun": "Bangladeshi taka",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BHD",
                "noun": "Bahraini dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BIF",
                "noun": "Burundian francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BND",
                "noun": "Brunei dollars",
                "current_years": {
                  "start_year": 1985,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1985,
                "base_year_max": 2025
              },
              {
                "code": "BOB",
                "noun": "Bolivian bolivianos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BRL",
                "noun": "Brazilian reais",
                "current_years": {
                  "start_year": 1986,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "BSD",
                "noun": "Bahamian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BTN",
                "noun": "Bhutanese ngultrums",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BWP",
                "noun": "Botswana pula",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BYN",
                "noun": "Belarusian rubles",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "BZD",
                "noun": "Belize dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CAD",
                "noun": "Canadian dollars",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CDF",
                "noun": "Congolese francs",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "CHF",
                "noun": "Swiss francs",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CLP",
                "noun": "Chilean pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CNY",
                "noun": "Chinese yuan",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "COP",
                "noun": "Colombian pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CRC",
                "noun": "Costa Rican colones",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CVE",
                "noun": "Cape Verdean escudos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CZK",
                "noun": "Czech korunas",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "DJF",
                "noun": "Djiboutian francs",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "DKK",
                "noun": "Danish kroner",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "DOP",
                "noun": "Dominican pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "DZD",
                "noun": "Algerian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EGP",
                "noun": "Egyptian pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ERN",
                "noun": "Eritrean nakfas",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2019
              },
              {
                "code": "ETB",
                "noun": "Ethiopian birr",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EUR",
                "noun": "euros",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1973,
                "base_year_max": 2025
              },
              {
                "code": "FJD",
                "noun": "Fijian dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GBP",
                "noun": "British pounds",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "GEL",
                "noun": "Georgian lari",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1994,
                "base_year_max": 2025
              },
              {
                "code": "GHS",
                "noun": "Ghanaian cedis",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GMD",
                "noun": "Gambian dalasis",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GNF",
                "noun": "Guinean francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GTQ",
                "noun": "Guatemalan quetzales",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GYD",
                "noun": "Guyanese dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HKD",
                "noun": "Hong Kong dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HNL",
                "noun": "Honduran lempiras",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HTG",
                "noun": "Haitian gourdes",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HUF",
                "noun": "Hungarian forints",
                "current_years": {
                  "start_year": 2003,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2003,
                "base_year_max": 2025
              },
              {
                "code": "IDR",
                "noun": "Indonesian rupiahs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ILS",
                "noun": "Israeli new shekels",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "INR",
                "noun": "Indian rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "IQD",
                "noun": "Iraqi dinars",
                "current_years": {
                  "start_year": 2000,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2025
              },
              {
                "code": "IRR",
                "noun": "Iranian rials",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ISK",
                "noun": "Icelandic krónur",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "JMD",
                "noun": "Jamaican dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JOD",
                "noun": "Jordanian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JPY",
                "noun": "Japanese yen",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "KES",
                "noun": "Kenyan shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KGS",
                "noun": "Kyrgyz soms",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "KHR",
                "noun": "Cambodian riels",
                "current_years": {
                  "start_year": 1986,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "KMF",
                "noun": "Comorian francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KRW",
                "noun": "South Korean won",
                "current_years": {
                  "start_year": 1987,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "KWD",
                "noun": "Kuwaiti dinars",
                "current_years": {
                  "start_year": 1995,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1995,
                "base_year_max": 2024
              },
              {
                "code": "KZT",
                "noun": "Kazakh tenge",
                "current_years": {
                  "start_year": 2013,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2013,
                "base_year_max": 2024
              },
              {
                "code": "LAK",
                "noun": "Lao kip",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LBP",
                "noun": "Lebanese pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LKR",
                "noun": "Sri Lankan rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2024
              },
              {
                "code": "LSL",
                "noun": "Lesotho maloti",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LYD",
                "noun": "Libyan dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MAD",
                "noun": "Moroccan dirhams",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MDL",
                "noun": "Moldovan lei",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MGA",
                "noun": "Malagasy ariary",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MKD",
                "noun": "Macedonian denars",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MMK",
                "noun": "Myanmar kyats",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "MNT",
                "noun": "Mongolian tugriks",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MOP",
                "noun": "Macanese patacas",
                "current_years": {
                  "start_year": 2001,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2001,
                "base_year_max": 2025
              },
              {
                "code": "MRU",
                "noun": "Mauritanian ouguiyas",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "MUR",
                "noun": "Mauritian rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MVR",
                "noun": "Maldivian rufiyaa",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MWK",
                "noun": "Malawian kwachas",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MXN",
                "noun": "Mexican pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MYR",
                "noun": "Malaysian ringgits",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MZN",
                "noun": "Mozambican meticais",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NAD",
                "noun": "Namibian dollars",
                "current_years": {
                  "start_year": 1989,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1989,
                "base_year_max": 2025
              },
              {
                "code": "NGN",
                "noun": "Nigerian naira",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "NIO",
                "noun": "Nicaraguan córdobas",
                "current_years": {
                  "start_year": 1987,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "NOK",
                "noun": "Norwegian kroner",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "NPR",
                "noun": "Nepalese rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NZD",
                "noun": "New Zealand dollars",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1961,
                "base_year_max": 2025
              },
              {
                "code": "OMR",
                "noun": "Omani rials",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PEN",
                "noun": "Peruvian soles",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PGK",
                "noun": "Papua New Guinean kina",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PHP",
                "noun": "Philippine pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PKR",
                "noun": "Pakistani rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PLN",
                "noun": "Polish zlotys",
                "current_years": {
                  "start_year": 1998,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "PYG",
                "noun": "Paraguayan guaranís",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "QAR",
                "noun": "Qatari riyals",
                "current_years": {
                  "start_year": 1985,
                  "end_year": 1990
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2023
              },
              {
                "code": "RON",
                "noun": "Romanian lei",
                "current_years": {
                  "start_year": 2013,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2013,
                "base_year_max": 2025
              },
              {
                "code": "RSD",
                "noun": "Serbian dinars",
                "current_years": {
                  "start_year": 1997,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "RUB",
                "noun": "Russian rubles",
                "current_years": {
                  "start_year": 2010,
                  "end_year": 2020
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2010,
                "base_year_max": 2020
              },
              {
                "code": "RWF",
                "noun": "Rwandan francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SAR",
                "noun": "Saudi riyals",
                "current_years": {
                  "start_year": 2000,
                  "end_year": 2023
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2023
              },
              {
                "code": "SBD",
                "noun": "Solomon Islands dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SCR",
                "noun": "Seychellois rupees",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SDG",
                "noun": "Sudanese pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SEK",
                "noun": "Swedish kronor",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "SGD",
                "noun": "Singapore dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SLE",
                "noun": "Sierra Leonean leones",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SRD",
                "noun": "Surinamese dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SSP",
                "noun": "South Sudanese pounds",
                "current_years": {
                  "start_year": 2011,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2011,
                "base_year_max": 2025
              },
              {
                "code": "STN",
                "noun": "São Tomé and Príncipe dobras",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SYP",
                "noun": "Syrian pounds",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2010
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2010
              },
              {
                "code": "SZL",
                "noun": "Swazi emalangeni",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "THB",
                "noun": "Thai baht",
                "current_years": {
                  "start_year": 2006,
                  "end_year": 2016
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2018,
                "base_year_max": 2024
              },
              {
                "code": "TJS",
                "noun": "Tajikistani somonis",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TMT",
                "noun": "Turkmenistani manat",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TND",
                "noun": "Tunisian dinars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TOP",
                "noun": "Tongan paʻanga",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TRY",
                "noun": "Turkish lira",
                "current_years": {
                  "start_year": 1990,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "TTD",
                "noun": "Trinidad and Tobago dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TWD",
                "noun": "New Taiwan dollars",
                "current_years": {
                  "start_year": 2006,
                  "end_year": 2016
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2024
              },
              {
                "code": "TZS",
                "noun": "Tanzanian shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UAH",
                "noun": "Ukrainian hryvnias",
                "current_years": {
                  "start_year": 1991,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "UGX",
                "noun": "Ugandan shillings",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "USD",
                "noun": "US dollars",
                "current_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "UYU",
                "noun": "Uruguayan pesos",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UZS",
                "noun": "Uzbekistani soms",
                "current_years": {
                  "start_year": 1992,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
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
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2017,
                "base_year_max": 2025
              },
              {
                "code": "VND",
                "noun": "Vietnamese dong",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "VUV",
                "noun": "Vanuatu vatu",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "WST",
                "noun": "Samoan tala",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XAF",
                "noun": "Central African CFA francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XCD",
                "noun": "East Caribbean dollars",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XOF",
                "noun": "West African CFA francs",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "YER",
                "noun": "Yemeni rials",
                "current_years": {
                  "start_year": 2014,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 2014,
                "base_year_max": 2025
              },
              {
                "code": "ZAR",
                "noun": "South African rand",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ZMW",
                "noun": "Zambian kwachas",
                "current_years": {
                  "start_year": 1980,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1973,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              }
            ],
            "default_base_year": 2024,
            "role_currencies": {
              "destination": "KES",
              "origin": "EUR"
            }
          }
        }
      }
    }
  ],
  "rendered_sentence": "Germany's gross ODA disbursements and gross disbursements to Kenya, 1973 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
  "sentence_plan": [
    {
      "kind": "slot",
      "text": "Germany",
      "segment": "heading",
      "role": "origin",
      "binding_ref": "origin:",
      "entity_refs": [
        "country/DEU"
      ],
      "states": [
        "origin:"
      ]
    },
    {
      "kind": "text",
      "text": "'s",
      "segment": "heading",
      "entity_refs": [],
      "states": []
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
      "text": "gross ODA disbursements",
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
      "text": " and ",
      "segment": "heading",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "slot",
      "text": "gross disbursements",
      "axis": "what",
      "segment": "heading",
      "entity_refs": [],
      "states": [
        "how:financialFlowType",
        "how:nettingBasis",
        "axis:populationType",
        "axis:measuredProperty"
      ],
      "part_index": 1
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
      "part_index": 1
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
      "part_index": 1
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
      "part_index": 1
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
      "part_index": 1
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
      "part_index": 1
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
      "part_index": 1
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
      "text": ", ",
      "segment": "heading",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "slot",
      "text": "1973 to 2024",
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
    }
  ],
  "status": "definite"
};
