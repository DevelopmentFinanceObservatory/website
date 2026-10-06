/**
 * Real `/api/search/resolve` response from dfo-apis branch
 * feat/answer-edit-routes (commit b14dbb031), captured 2026-10-04 from a
 * local server with observations on: query "ODA for malaria control to
 * Kenya since 2015".
 *
 * A `definite` answer that binds the hierarchical `crsPurpose` slot to
 * "malaria control", a leaf of the CRS purpose code taxonomy:
 * `resolved.slot_options` carries a `crsPurpose` entry with exactly one
 * option, `relation: "parent"` ("basic health"), and no `child` or `root`
 * entries: the current value plus a way up, no way down.
 *
 * Trimmed for size; each body still validates against the API's models
 * (scripts/check-search-fixtures.mts). `slot_values` and
 * `open_axis_facts[].values` keep two, the specs' own `sentence_plan` is
 * dropped (the envelope's stays), `trace.slot_filters` is empty, and
 * timings keep their totals. The server omits a `unit_conversion` currency's
 * `current_years` when it is null, which its own model requires; this
 * file writes the null.
 * Every `slot_options` entry but `crsPurpose` is removed, and the spec's
 * `observations` are dropped.
 * Option and alternative-measure counts (`served_rows`, `served_rows_exact`)
 * were read with the same requests.
 *
 * The capture's StatVar lists are folded into the current wire: each
 * `stat_vars` carries counts and a date range (`served_count` is the listed members'
 * count, or `member_count` where the list was cut and exact, and
 * `data_date_range` spans the listed members), each related measure its
 * StatVar as `stat_var`, and `trace.resolved_stat_vars` is gone.
 */

export const crsHierarchicalPurpose: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "ODA for malaria control to Kenya since 2015",
    "normalized_query": "ODA for malaria control to Kenya since 2015",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "be96b82f5b6e4ebb858659e6aef8417b",
    "warnings": [],
    "timing_ms": {
      "total": 2490
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
      "variable_text": "ODA for malaria control",
      "warnings": [
        {
          "code": "retrieval_score_weak",
          "severity": "info",
          "message": "the chosen reading's match to the query is weak; treat it with less confidence than a strong match."
        },
        {
          "code": "role_scope_defaulted",
          "severity": "warn",
          "message": "no provider was named; the answer was resolved across every provider with data."
        }
      ],
      "timing_ms": {
        "total": 2460
      },
      "restatement": {
        "variable_text": "ODA for malaria control",
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
      "status": "definite",
      "spec": {
        "spec_id": "spec_8cf3214933343bf6235e098da8c15028",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_8cf3214933343bf6235e098da8c15028",
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
                  "state": "value",
                  "ref": "CRSPurposeCode12262"
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
            "label": "gross disbursements (malaria control, official development assistance, standard grant)",
            "population_type": {
              "dcid": "FinancialFlow",
              "label": "financial flow"
            },
            "measured_property": {
              "dcid": "amount",
              "label": "amount"
            },
            "stat_type": {
              "dcid": "measuredValue",
              "label": "measuredValue"
            },
            "measurement_qualifier": {
              "dcid": "Nominal",
              "label": "Nominal"
            },
            "measurement_denominator_unresolved": false,
            "slot_keys": [
              {
                "axis": "how",
                "property": {
                  "dcid": "crsCooperationModality",
                  "label": "CRS cooperation modality"
                },
                "label": "modality"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "crsPurpose",
                  "label": "CRS purpose"
                },
                "label": "sector"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "crsTypeOfFinance",
                  "label": "CRS type of finance"
                },
                "label": "instrument"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "crsTypeOfFlow",
                  "label": "CRS type of flow"
                },
                "label": "flow"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "financialFlowType",
                  "label": "financial flow type"
                },
                "label": "financial flow type"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "nettingBasis",
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
            "member_count": 13,
            "member_digest": "9892890a8558746402d43c476cf6dc0620aca678081897eb4e49cf648a20e65a",
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
                  "dcid": "crsCooperationModality",
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
                  "dcid": "crsPurpose",
                  "label": "CRS purpose"
                },
                "label": "sector"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "dcid": "CRSPurposeCode12262",
                    "label": "malaria control"
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
                  "dcid": "crsTypeOfFinance",
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
                  "dcid": "crsTypeOfFlow",
                  "label": "CRS type of flow"
                },
                "label": "flow"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "dcid": "CRSTypeOfFlow10",
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
                  "dcid": "financialFlowType",
                  "label": "financial flow type"
                },
                "label": "financial flow type"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "dcid": "Disbursement",
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
                  "dcid": "nettingBasis",
                  "label": "netting basis"
                },
                "label": "netting basis"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "dcid": "Gross",
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
            "member_count": 5,
            "member_count_exact": true,
            "served_count": 5,
            "data_date_range": {
              "start": "2015",
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
            "observation_count": 74,
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
                "count": 5
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
            "observations": 9,
            "series": 9,
            "role_counts": {
              "financingProvider": 9,
              "financingRecipient": 1
            }
          },
          "download": {
            "rows": 74,
            "rows_exact": true,
            "series": 18,
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
                  "dcid": "crsPurpose",
                  "label": "CRS purpose"
                },
                "label": "sector"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode122",
                      "label": "basic health"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "parent",
                  "parent": "CRSPurposeCode120",
                  "member_count": 4,
                  "served_rows": 1111,
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
          "rendered_sentence": "Gross ODA disbursements to Kenya from 15 donors for malaria control, 2015 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
          "trace": {
            "resolved_entities": [
              {
                "dcid": "country/KEN",
                "label": "Kenya"
              }
            ],
            "resolved_sources": [
              {
                "dcid": "provenance/OECDCreditorReportingSystem",
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
                    "dcid": "CRSTypeOfFlow10",
                    "label": "official development assistance"
                  }
                ],
                "slot": "crsTypeOfFlow",
                "disposition": "bound"
              },
              {
                "text": "malaria control",
                "named": [
                  {
                    "dcid": "CRSPurposeCode12262",
                    "label": "malaria control"
                  }
                ],
                "slot": "crsPurpose",
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
                "spec_id": "spec_cec2970f04a9901ebffd45c569c4762e",
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
                        "state": "value",
                        "ref": "CRSPurposeCode12262"
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
                    "dcid": "FinancialFlow",
                    "label": "financial flow"
                  }
                },
                {
                  "axis": "measuredProperty",
                  "value": {
                    "dcid": "amount",
                    "label": "amount"
                  }
                },
                {
                  "axis": "measurementQualifier",
                  "value": {
                    "dcid": "Nominal",
                    "label": "nominal"
                  }
                },
                {
                  "axis": "financialFlowType",
                  "value": {
                    "dcid": "Disbursement",
                    "label": "disbursement"
                  }
                },
                {
                  "axis": "nettingBasis",
                  "value": {
                    "dcid": "Net",
                    "label": "net"
                  }
                }
              ],
              "served_rows": 74,
              "served_rows_exact": true
            },
            {
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_4ac70ebea34e3d461f2506c205fb3f46",
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
                        "state": "value",
                        "ref": "CRSPurposeCode12262"
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
                    "dcid": "FinancialObligation",
                    "label": "financial obligation"
                  }
                },
                {
                  "axis": "measuredProperty",
                  "value": {
                    "dcid": "amount",
                    "label": "amount"
                  }
                },
                {
                  "axis": "measurementQualifier",
                  "value": {
                    "dcid": "Nominal",
                    "label": "nominal"
                  }
                },
                {
                  "axis": "financialObligationType",
                  "value": {
                    "dcid": "Commitment",
                    "label": "commitment"
                  }
                }
              ],
              "served_rows": 56,
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
                "dcid": "FinancialFlow",
                "label": "financial flow"
              }
            },
            {
              "axis": "measuredProperty",
              "value": {
                "dcid": "amount",
                "label": "amount"
              }
            },
            {
              "axis": "measurementQualifier",
              "value": {
                "dcid": "Nominal",
                "label": "nominal"
              }
            },
            {
              "axis": "financialFlowType",
              "value": {
                "dcid": "Disbursement",
                "label": "disbursement"
              }
            },
            {
              "axis": "nettingBasis",
              "value": {
                "dcid": "Gross",
                "label": "gross"
              }
            }
          ],
          "open_axis_facts": [
            {
              "property": "crsCooperationModality",
              "varies": true,
              "distinct_count": 5,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "dcid": "CRSCooperationModalityB01",
                    "label": "core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes"
                  },
                  "count": 1
                },
                {
                  "value": {
                    "dcid": "CRSCooperationModalityB03",
                    "label": "contribution to specific-purpose programme and fund managed by an international organisation"
                  },
                  "count": 1
                }
              ]
            },
            {
              "property": "crsTypeOfFinance",
              "varies": false,
              "value": {
                "dcid": "CRSTypeOfFinance110",
                "label": "standard grant"
              },
              "distinct_count": 1,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "dcid": "CRSTypeOfFinance110",
                    "label": "standard grant"
                  },
                  "count": 5
                }
              ]
            }
          ],
          "role_axis_facts": [
            {
              "role": "origin",
              "member_count": 15,
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
  "rendered_sentence": "Gross ODA disbursements to Kenya from 15 donors for malaria control, 2015 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
  "sentence_plan": [
    {
      "kind": "slot",
      "text": "Gross ODA disbursements",
      "axis": "what",
      "segment": "heading",
      "entity_refs": [],
      "states": [
        "how:crsTypeOfFinance",
        "how:crsTypeOfFlow",
        "how:financialFlowType",
        "how:nettingBasis",
        "axis:populationType",
        "axis:measuredProperty"
      ],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": " to ",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 0
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
      ],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": " from ",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "15 donors",
      "segment": "heading",
      "role": "origin",
      "binding_ref": "origin:",
      "entity_refs": [],
      "states": [
        "origin:"
      ],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": " for ",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "malaria control",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "crsPurpose",
      "binding_ref": "how:crsPurpose",
      "entity_refs": [],
      "states": [
        "how:crsPurpose"
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
    }
  ],
  "status": "definite"
};
