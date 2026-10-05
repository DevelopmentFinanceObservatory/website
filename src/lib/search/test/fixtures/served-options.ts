/**
 * Real `/api/search/resolve` responses from dfo-apis branch
 * feat/answer-edit-routes (commit b14dbb031), captured 2026-10-04 from a
 * local server over SSE with option coverage and observations on. Each body is
 * the stream's `response` event; each `*Events` array holds the trailing
 * `slot_options` events of the same run.
 *
 * This wire carries `SentenceToken.states` (the refs a token states, with
 * "source:" on the byline source token), `SlotOption.served_rows` and
 * `SpecAlternativeMeasure.served_rows`, and drops options that would serve
 * nothing.
 *
 * - servedAid: "aid from Germany to Guatemala" (CRS)
 * - servedAidSector: servedAid resubmitted with crsPurpose bound to
 *   agriculture, forestry and fishing (CRSPurposeCode310)
 * - servedDebt: "external debt service of Ghana" (IDS)
 * - servedGdp: "GDP of Kenya", its answer resubmitted unchanged (WDI)
 * - servedHealth: "health expenditure in Kenya" (WDI)
 * - servedMulti: "aid to Kenya and health expenditure in Kenya" (two parts)
 *
 * Trimmed for size; each body still validates against the API's models
 * (scripts/check-search-fixtures.mts). `stat_vars.items` and
 * `trace.resolved_stat_vars` keep two entries and are marked truncated
 * where that cut them, `slot_values` and `open_axis_facts[].values` keep
 * two, the specs' own `sentence_plan` is dropped (the envelope's stays),
 * `trace.pipeline_trace` and `trace.slot_filters` are empty, and timings
 * keep their totals. The server omits a `unit_conversion` currency's
 * `current_years` when it is null, which its own model requires; this
 * file writes the null. Option lists
 * are complete except servedGdp's and servedGdpEvents' (four options each)
 * and servedMulti's first part (three each), which are marked truncated.
 * Option and alternative-measure counts (`served_rows`, `served_rows_exact`)
 * were read with the same requests.
 */

export const servedAid: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "aid from Germany to Guatemala",
    "normalized_query": "aid from Germany to Guatemala",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "c2208bbff12e4f5289148cd669610016",
    "warnings": [],
    "timing_ms": {
      "total": 1762
    },
    "llm_usage": {
      "input_tokens": 0,
      "output_tokens": 0,
      "cached_tokens": 0
    }
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
        "total": 1498
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
                "kind": "unbound"
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
                    "dcid": "country/GTM",
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
            "items": [
              {
                "ref": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode11110_Nominal",
                "label": "Official development assistance gross disbursements for education policy and administrative management (standard grant)",
                "slot_values": [
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "crsTypeOfFlow",
                        "label": "CRS type of flow"
                      },
                      "label": "flow"
                    },
                    "value": {
                      "ref": {
                        "dcid": "CRSTypeOfFlow10",
                        "label": "official development assistance"
                      },
                      "value_kind": "enum_value"
                    }
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
                    "value": {
                      "ref": {
                        "dcid": "Disbursement",
                        "label": "disbursement"
                      },
                      "value_kind": "enum_value"
                    }
                  }
                ],
                "constraint_properties": [
                  "crsPurpose",
                  "crsTypeOfFinance",
                  "crsTypeOfFlow",
                  "financialFlowType",
                  "nettingBasis"
                ],
                "data_date_range": {
                  "start": "2003",
                  "end": "2009"
                },
                "data_confirmed_at_destination": true
              },
              {
                "ref": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode11120_Nominal",
                "label": "Official development assistance gross disbursements for education facility and training (standard grant)",
                "slot_values": [
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "crsTypeOfFlow",
                        "label": "CRS type of flow"
                      },
                      "label": "flow"
                    },
                    "value": {
                      "ref": {
                        "dcid": "CRSTypeOfFlow10",
                        "label": "official development assistance"
                      },
                      "value_kind": "enum_value"
                    }
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
                    "value": {
                      "ref": {
                        "dcid": "Disbursement",
                        "label": "disbursement"
                      },
                      "value_kind": "enum_value"
                    }
                  }
                ],
                "constraint_properties": [
                  "crsPurpose",
                  "crsTypeOfFinance",
                  "crsTypeOfFlow",
                  "financialFlowType",
                  "nettingBasis"
                ],
                "data_date_range": {
                  "start": "1999",
                  "end": "2009"
                },
                "data_confirmed_at_destination": true
              }
            ],
            "member_count": 279,
            "member_count_exact": true,
            "truncated": true
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
            "evidence": "facet_metadata",
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
            }
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
                  "dcid": "crsCooperationModality",
                  "label": "CRS cooperation modality"
                },
                "label": "modality"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityB",
                      "label": "core contribution and pooled programme and fund"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 255,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityB03",
                      "label": "contribution to specific-purpose programme and fund managed by an international organisation"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityB",
                  "member_count": 1606,
                  "served_rows": 44,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityB01",
                      "label": "core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityB",
                  "member_count": 1331,
                  "served_rows": 211,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityC",
                      "label": "project-type intervention (group)"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 425,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityC01",
                      "label": "project-type intervention"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityC",
                  "member_count": 7005,
                  "served_rows": 425,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityD",
                      "label": "expert and other technical assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 125,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityD02",
                      "label": "other technical assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityD",
                  "member_count": 1600,
                  "served_rows": 89,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityD01",
                      "label": "donor country personnel"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityD",
                  "member_count": 976,
                  "served_rows": 36,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityE",
                      "label": "scholarship and student cost in donor country"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 36,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityE01",
                      "label": "scholarship and training in donor country"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityE",
                  "member_count": 819,
                  "served_rows": 17,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityE02",
                      "label": "imputed student cost"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityE",
                  "member_count": 315,
                  "served_rows": 19,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityH",
                      "label": "other in-donor expenditure"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 1,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityH01",
                      "label": "development awareness"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityH",
                  "member_count": 373,
                  "served_rows": 1,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": false,
              "source": "observed"
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
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode998",
                      "label": "unallocated and unspecified"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 76,
                  "served_rows": 48,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode99810",
                      "label": "sectors not specified"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode998",
                  "member_count": 255,
                  "served_rows": 47,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode99820",
                      "label": "non-sector allocable promotion of development awareness"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode998",
                  "member_count": 77,
                  "served_rows": 1,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode100",
                      "label": "social infrastructure and services"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 13,
                  "served_rows": 751,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode140",
                      "label": "water supply and sanitation"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 10,
                  "served_rows": 68,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode110",
                      "label": "education"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 9,
                  "served_rows": 255,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode160",
                      "label": "other social infrastructure and services"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 7,
                  "served_rows": 71,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode120",
                      "label": "health"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 6,
                  "served_rows": 106,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode130",
                      "label": "population policy, programme, and reproductive health"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 5,
                  "served_rows": 35,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode150",
                      "label": "government and civil society"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode100",
                  "member_count": 4,
                  "served_rows": 216,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode200",
                      "label": "economic infrastructure and services"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 13,
                  "served_rows": 53,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode240",
                      "label": "banking and financial services"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode200",
                  "member_count": 16,
                  "served_rows": 5,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode220",
                      "label": "communication system and technology"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode200",
                  "member_count": 13,
                  "served_rows": 1,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode250",
                      "label": "business environment and governance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode200",
                  "member_count": 13,
                  "served_rows": 13,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode210",
                      "label": "transport and storage"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode200",
                  "member_count": 7,
                  "served_rows": 30,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode230",
                      "label": "energy"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode200",
                  "member_count": 7,
                  "served_rows": 4,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode300",
                      "label": "productive sector"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 13,
                  "served_rows": 191,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode310",
                      "label": "agriculture, forestry and fishing"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode300",
                  "member_count": 12,
                  "served_rows": 163,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode320",
                      "label": "industry, mining and construction"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode300",
                  "member_count": 9,
                  "served_rows": 28,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode400",
                      "label": "multisector"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 7,
                  "served_rows": 182,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode430",
                      "label": "other multisector"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode400",
                  "member_count": 10,
                  "served_rows": 97,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode410",
                      "label": "general environment protection"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode400",
                  "member_count": 7,
                  "served_rows": 85,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode500",
                      "label": "commodity aid and general programme assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 5,
                  "served_rows": 33,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode520",
                      "label": "food assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode500",
                  "member_count": 3,
                  "served_rows": 5,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode530",
                      "label": "other commodity assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode500",
                  "member_count": 3,
                  "served_rows": 28,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode700",
                      "label": "humanitarian aid"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 5,
                  "served_rows": 26,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode720",
                      "label": "emergency response"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode700",
                  "member_count": 6,
                  "served_rows": 15,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode730",
                      "label": "reconstruction and rehabilitation"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode700",
                  "member_count": 3,
                  "served_rows": 2,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode740",
                      "label": "disaster preparedness"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode700",
                  "member_count": 0,
                  "served_rows": 9,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": false,
              "source": "observed"
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
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance100",
                      "label": "grant"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 1083,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance110",
                      "label": "standard grant"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance100",
                  "member_count": 12672,
                  "served_rows": 1083,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance420",
                      "label": "debt instrument"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 193,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance421",
                      "label": "standard loan"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance420",
                  "member_count": 4620,
                  "served_rows": 193,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance500",
                      "label": "equity and share in collective investment vehicle"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 8,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance510",
                      "label": "common equity"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance500",
                  "member_count": 1537,
                  "served_rows": 8,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": false,
              "source": "observed"
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
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFlow10",
                      "label": "official development assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 14098,
                  "served_rows": 1284,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFlow21",
                      "label": "non-export credit official flow"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 3798,
                  "served_rows": 21,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFlow60",
                      "label": "private sector instrument"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 1601,
                  "served_rows": 4,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": false,
              "source": "observed"
            }
          ],
          "entity_options": [],
          "facet_options": [],
          "rendered_sentence": "Germany's gross ODA disbursements to Guatemala, 1976 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
          "trace": {
            "resolved_stat_vars": [
              {
                "dcid": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode11110_Nominal",
                "label": "Official development assistance gross disbursements for education policy and administrative management (standard grant)"
              },
              {
                "dcid": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode11120_Nominal",
                "label": "Official development assistance gross disbursements for education facility and training (standard grant)"
              }
            ],
            "resolved_stat_vars_truncated": true,
            "resolved_entities": [
              {
                "dcid": "country/GTM",
                "label": "Guatemala"
              },
              {
                "dcid": "country/DEU",
                "label": "Germany"
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
            "query_qualifiers": [],
            "pipeline_trace": [],
            "n_recalled": 51,
            "capability_version": "cap_cbe83b130f0e8d02",
            "declaration_version": "29967a15833349bbe4446023f170f5b77b21aa45963894a1b589848c3196d623",
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
          "measure_label_named_values": [],
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
              "property": "crsPurpose",
              "varies": true,
              "distinct_count": 98,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "dcid": "CRSPurposeCode11420",
                    "label": "higher education"
                  },
                  "count": 8
                },
                {
                  "value": {
                    "dcid": "CRSPurposeCode11120",
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
                    "dcid": "CRSTypeOfFinance110",
                    "label": "standard grant"
                  },
                  "count": 261
                },
                {
                  "value": {
                    "dcid": "CRSTypeOfFinance421",
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
                    "dcid": "CRSCooperationModalityC01",
                    "label": "project-type intervention"
                  },
                  "count": 75
                },
                {
                  "value": {
                    "dcid": "CRSCooperationModalityB01",
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

export const servedAidSector: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "dataset_resubmit",
    "extract_skipped": true
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "9bcbcb42b53a441aaf34b26372b0f8dd",
    "warnings": [],
    "timing_ms": {
      "total": 2780
    }
  },
  "kind": "resolution",
  "parts": [
    {
      "variable_text": "aid",
      "warnings": [],
      "timing_ms": {
        "total": 769
      },
      "restatement_reason": "no_phrase_inputs",
      "operations": [],
      "departures": [],
      "status": "definite",
      "spec": {
        "spec_id": "spec_b6efd9fab357673dc619663be5adc509",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_b6efd9fab357673dc619663be5adc509",
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
                  "ref": "CRSPurposeCode310"
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
            "label": "gross disbursements (agriculture, forestry and fishing, official development assistance)",
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
            "member_count": 481,
            "member_digest": "606dd38db3eb2d22f56d34f63a055a070d3f16e2ed5dccd344bc4f6a6cbda46f",
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
                    "dcid": "CRSPurposeCode310",
                    "label": "agriculture, forestry and fishing"
                  },
                  "value_kind": "enum_value"
                }
              },
              "expansion": {
                "added": [
                  {
                    "dcid": "CRSPurposeCode311",
                    "label": "agriculture"
                  },
                  {
                    "dcid": "CRSPurposeCode312",
                    "label": "forestry"
                  },
                  {
                    "dcid": "CRSPurposeCode313",
                    "label": "fishing"
                  },
                  {
                    "dcid": "CRSPurposeCode31110",
                    "label": "agricultural policy and administrative management"
                  },
                  {
                    "dcid": "CRSPurposeCode31120",
                    "label": "agricultural development"
                  },
                  {
                    "dcid": "CRSPurposeCode31130",
                    "label": "agricultural land resource"
                  },
                  {
                    "dcid": "CRSPurposeCode31140",
                    "label": "agricultural water resource"
                  },
                  {
                    "dcid": "CRSPurposeCode31150",
                    "label": "agricultural input"
                  },
                  {
                    "dcid": "CRSPurposeCode31161",
                    "label": "food crop production"
                  },
                  {
                    "dcid": "CRSPurposeCode31162",
                    "label": "industrial and export crop production"
                  },
                  {
                    "dcid": "CRSPurposeCode31163",
                    "label": "livestock"
                  },
                  {
                    "dcid": "CRSPurposeCode31164",
                    "label": "agrarian reform"
                  },
                  {
                    "dcid": "CRSPurposeCode31165",
                    "label": "agricultural alternative development"
                  },
                  {
                    "dcid": "CRSPurposeCode31166",
                    "label": "agricultural extension"
                  },
                  {
                    "dcid": "CRSPurposeCode31181",
                    "label": "agricultural education and training"
                  },
                  {
                    "dcid": "CRSPurposeCode31182",
                    "label": "agricultural research"
                  },
                  {
                    "dcid": "CRSPurposeCode31191",
                    "label": "agricultural service"
                  },
                  {
                    "dcid": "CRSPurposeCode31192",
                    "label": "plant and post-harvest protection and pest control"
                  },
                  {
                    "dcid": "CRSPurposeCode31193",
                    "label": "agricultural financial service"
                  },
                  {
                    "dcid": "CRSPurposeCode31194",
                    "label": "agricultural co-operative"
                  },
                  {
                    "dcid": "CRSPurposeCode31195",
                    "label": "livestock and veterinary service"
                  },
                  {
                    "dcid": "CRSPurposeCode31210",
                    "label": "forestry policy and administrative management"
                  },
                  {
                    "dcid": "CRSPurposeCode31220",
                    "label": "forestry development"
                  },
                  {
                    "dcid": "CRSPurposeCode31261",
                    "label": "fuelwood and charcoal"
                  },
                  {
                    "dcid": "CRSPurposeCode31281",
                    "label": "forestry education and training"
                  },
                  {
                    "dcid": "CRSPurposeCode31282",
                    "label": "forestry research"
                  },
                  {
                    "dcid": "CRSPurposeCode31291",
                    "label": "forestry service"
                  },
                  {
                    "dcid": "CRSPurposeCode31310",
                    "label": "fishing policy and administrative management"
                  },
                  {
                    "dcid": "CRSPurposeCode31320",
                    "label": "fishery development"
                  },
                  {
                    "dcid": "CRSPurposeCode31381",
                    "label": "fishery education and training"
                  },
                  {
                    "dcid": "CRSPurposeCode31382",
                    "label": "fishery research"
                  },
                  {
                    "dcid": "CRSPurposeCode31391",
                    "label": "fishery service"
                  }
                ]
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
                    "dcid": "country/GTM",
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
            "items": [
              {
                "ref": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode31110_Nominal",
                "label": "Official development assistance gross disbursements for agricultural policy and administrative management (standard grant)",
                "slot_values": [
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "crsTypeOfFlow",
                        "label": "CRS type of flow"
                      },
                      "label": "flow"
                    },
                    "value": {
                      "ref": {
                        "dcid": "CRSTypeOfFlow10",
                        "label": "official development assistance"
                      },
                      "value_kind": "enum_value"
                    }
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
                    "value": {
                      "ref": {
                        "dcid": "Disbursement",
                        "label": "disbursement"
                      },
                      "value_kind": "enum_value"
                    }
                  }
                ],
                "constraint_properties": [
                  "crsPurpose",
                  "crsTypeOfFinance",
                  "crsTypeOfFlow",
                  "financialFlowType",
                  "nettingBasis"
                ],
                "data_date_range": {
                  "start": "2002",
                  "end": "2002"
                },
                "data_confirmed_at_destination": true
              },
              {
                "ref": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode31120_Nominal",
                "label": "Official development assistance gross disbursements for agricultural development (standard grant)",
                "slot_values": [
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "crsTypeOfFlow",
                        "label": "CRS type of flow"
                      },
                      "label": "flow"
                    },
                    "value": {
                      "ref": {
                        "dcid": "CRSTypeOfFlow10",
                        "label": "official development assistance"
                      },
                      "value_kind": "enum_value"
                    }
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
                    "value": {
                      "ref": {
                        "dcid": "Disbursement",
                        "label": "disbursement"
                      },
                      "value_kind": "enum_value"
                    }
                  }
                ],
                "constraint_properties": [
                  "crsPurpose",
                  "crsTypeOfFinance",
                  "crsTypeOfFlow",
                  "financialFlowType",
                  "nettingBasis"
                ],
                "data_date_range": {
                  "start": "2002",
                  "end": "2009"
                },
                "data_confirmed_at_destination": true
              }
            ],
            "member_count": 45,
            "member_count_exact": true,
            "truncated": true
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
            "observation_count": 163,
            "evidence": "facet_metadata",
            "dimensions": [
              {
                "label": "sources",
                "count": 1
              },
              {
                "label": "observations",
                "count": 11
              },
              {
                "label": "variables",
                "count": 45
              }
            ]
          },
          "headline": {
            "year": 2024,
            "year_named": false,
            "observations": 10,
            "series": 10,
            "role_counts": {
              "financingProvider": 1,
              "financingRecipient": 1
            }
          },
          "download": {
            "rows": 163,
            "rows_exact": true,
            "series": 45,
            "window": {
              "start_year": 1994,
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
                  "dcid": "crsCooperationModality",
                  "label": "CRS cooperation modality"
                },
                "label": "modality"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityB",
                      "label": "core contribution and pooled programme and fund"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 42,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityB03",
                      "label": "contribution to specific-purpose programme and fund managed by an international organisation"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityB",
                  "member_count": 1606,
                  "served_rows": 9,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityB01",
                      "label": "core support to non-governmental organisations, other private bodies, public-private partnerships, and research institutes"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityB",
                  "member_count": 1331,
                  "served_rows": 33,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityC",
                      "label": "project-type intervention (group)"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 59,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityC01",
                      "label": "project-type intervention"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityC",
                  "member_count": 7005,
                  "served_rows": 59,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityD",
                      "label": "expert and other technical assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 3,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityD02",
                      "label": "other technical assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityD",
                  "member_count": 1600,
                  "served_rows": 3,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": false,
              "source": "observed"
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
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode311",
                      "label": "agriculture"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode310",
                  "member_count": 12,
                  "served_rows": 110,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode312",
                      "label": "forestry"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode310",
                  "member_count": 6,
                  "served_rows": 53,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode300",
                      "label": "productive sector"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "parent",
                  "member_count": 13,
                  "served_rows": 191,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": false,
              "source": "observed"
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
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance100",
                      "label": "grant"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 153,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance110",
                      "label": "standard grant"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance100",
                  "member_count": 12672,
                  "served_rows": 153,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance420",
                      "label": "debt instrument"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 10,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance421",
                      "label": "standard loan"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance420",
                  "member_count": 4620,
                  "served_rows": 10,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": false,
              "source": "observed"
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
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFlow10",
                      "label": "official development assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 14098,
                  "served_rows": 163,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFlow21",
                      "label": "non-export credit official flow"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 3798,
                  "served_rows": 4,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": false,
              "source": "observed"
            }
          ],
          "entity_options": [],
          "facet_options": [],
          "rendered_sentence": "Germany's gross ODA disbursements to Guatemala for agriculture, forestry and fishing, 1994 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
          "trace": {
            "resolved_stat_vars": [
              {
                "dcid": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode31110_Nominal",
                "label": "Official development assistance gross disbursements for agricultural policy and administrative management (standard grant)"
              },
              {
                "dcid": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode31120_Nominal",
                "label": "Official development assistance gross disbursements for agricultural development (standard grant)"
              }
            ],
            "resolved_stat_vars_truncated": true,
            "resolved_entities": [
              {
                "dcid": "country/GTM",
                "label": "Guatemala"
              },
              {
                "dcid": "country/DEU",
                "label": "Germany"
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
            "query_qualifiers": [],
            "pipeline_trace": [],
            "capability_version": "cap_cbe83b130f0e8d02",
            "declaration_version": "29967a15833349bbe4446023f170f5b77b21aa45963894a1b589848c3196d623"
          },
          "confidence": "high",
          "available_at_place": true,
          "alternative_measures": [
            {
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_6be0f90f415e7b328a48a834a05c51b4",
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
                        "ref": "CRSPurposeCode310"
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
              "served_rows": 163,
              "served_rows_exact": true
            },
            {
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_8064b26d089e4b9877c56d17e4292847",
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
                        "ref": "CRSPurposeCode310"
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
              "served_rows": 145,
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
          "measure_label_named_values": [],
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
              "distinct_count": 15,
              "undeclared_count": 69,
              "values": [
                {
                  "value": {
                    "dcid": "CRSCooperationModalityC01",
                    "label": "project-type intervention"
                  },
                  "count": 98
                },
                {
                  "value": {
                    "dcid": "CRSCooperationModalityB03",
                    "label": "contribution to specific-purpose programme and fund managed by an international organisation"
                  },
                  "count": 50
                }
              ]
            },
            {
              "property": "crsTypeOfFinance",
              "varies": true,
              "distinct_count": 7,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "dcid": "CRSTypeOfFinance110",
                    "label": "standard grant"
                  },
                  "count": 321
                },
                {
                  "value": {
                    "dcid": "CRSTypeOfFinance421",
                    "label": "standard loan"
                  },
                  "count": 87
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
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2002,
                "base_year_max": 2025
              },
              {
                "code": "ALL",
                "noun": "Albanian leks",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AMD",
                "noun": "Armenian drams",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "AOA",
                "noun": "Angolan kwanzas",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "ARS",
                "noun": "Argentine pesos",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "AUD",
                "noun": "Australian dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
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
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1996,
                "base_year_max": 2025
              },
              {
                "code": "BBD",
                "noun": "Barbadian dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BDT",
                "noun": "Bangladeshi taka",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BHD",
                "noun": "Bahraini dinars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BIF",
                "noun": "Burundian francs",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BND",
                "noun": "Brunei dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1985,
                "base_year_max": 2025
              },
              {
                "code": "BOB",
                "noun": "Bolivian bolivianos",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BRL",
                "noun": "Brazilian reais",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "BSD",
                "noun": "Bahamian dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BTN",
                "noun": "Bhutanese ngultrums",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BWP",
                "noun": "Botswana pula",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "BYN",
                "noun": "Belarusian rubles",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "BZD",
                "noun": "Belize dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CAD",
                "noun": "Canadian dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CDF",
                "noun": "Congolese francs",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "CHF",
                "noun": "Swiss francs",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "CLP",
                "noun": "Chilean pesos",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CNY",
                "noun": "Chinese yuan",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "COP",
                "noun": "Colombian pesos",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CRC",
                "noun": "Costa Rican colones",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "CVE",
                "noun": "Cape Verdean escudos",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "DJF",
                "noun": "Djiboutian francs",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "DKK",
                "noun": "Danish kroner",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "DOP",
                "noun": "Dominican pesos",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "DZD",
                "noun": "Algerian dinars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EGP",
                "noun": "Egyptian pounds",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ERN",
                "noun": "Eritrean nakfas",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2019
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2019
              },
              {
                "code": "ETB",
                "noun": "Ethiopian birr",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "EUR",
                "noun": "euros",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1973,
                "base_year_max": 2025
              },
              {
                "code": "FJD",
                "noun": "Fijian dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GBP",
                "noun": "British pounds",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1994,
                "base_year_max": 2025
              },
              {
                "code": "GHS",
                "noun": "Ghanaian cedis",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GMD",
                "noun": "Gambian dalasis",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GNF",
                "noun": "Guinean francs",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GTQ",
                "noun": "Guatemalan quetzales",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "GYD",
                "noun": "Guyanese dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HKD",
                "noun": "Hong Kong dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HNL",
                "noun": "Honduran lempiras",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "HTG",
                "noun": "Haitian gourdes",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2003,
                "base_year_max": 2025
              },
              {
                "code": "IDR",
                "noun": "Indonesian rupiahs",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "INR",
                "noun": "Indian rupees",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2025
              },
              {
                "code": "IRR",
                "noun": "Iranian rials",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1997,
                "base_year_max": 2025
              },
              {
                "code": "JMD",
                "noun": "Jamaican dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JOD",
                "noun": "Jordanian dinars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "JPY",
                "noun": "Japanese yen",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "KES",
                "noun": "Kenyan shillings",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KGS",
                "noun": "Kyrgyz soms",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "KHR",
                "noun": "Cambodian riels",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1986,
                "base_year_max": 2025
              },
              {
                "code": "KMF",
                "noun": "Comorian francs",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "KRW",
                "noun": "South Korean won",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2013,
                "base_year_max": 2024
              },
              {
                "code": "LAK",
                "noun": "Lao kip",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LBP",
                "noun": "Lebanese pounds",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LKR",
                "noun": "Sri Lankan rupees",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2024
              },
              {
                "code": "LSL",
                "noun": "Lesotho maloti",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "LYD",
                "noun": "Libyan dinars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MAD",
                "noun": "Moroccan dirhams",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MDL",
                "noun": "Moldovan lei",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "MGA",
                "noun": "Malagasy ariary",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MKD",
                "noun": "Macedonian denars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "MNT",
                "noun": "Mongolian tugriks",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2001,
                "base_year_max": 2025
              },
              {
                "code": "MRU",
                "noun": "Mauritanian ouguiyas",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "MUR",
                "noun": "Mauritian rupees",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MVR",
                "noun": "Maldivian rufiyaa",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MWK",
                "noun": "Malawian kwachas",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MXN",
                "noun": "Mexican pesos",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MYR",
                "noun": "Malaysian ringgits",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "MZN",
                "noun": "Mozambican meticais",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NAD",
                "noun": "Namibian dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1989,
                "base_year_max": 2025
              },
              {
                "code": "NGN",
                "noun": "Nigerian naira",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "NIO",
                "noun": "Nicaraguan córdobas",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1987,
                "base_year_max": 2025
              },
              {
                "code": "NOK",
                "noun": "Norwegian kroner",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "NPR",
                "noun": "Nepalese rupees",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "NZD",
                "noun": "New Zealand dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1961,
                "base_year_max": 2025
              },
              {
                "code": "OMR",
                "noun": "Omani rials",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PEN",
                "noun": "Peruvian soles",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PGK",
                "noun": "Papua New Guinean kina",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PHP",
                "noun": "Philippine pesos",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "PKR",
                "noun": "Pakistani rupees",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1998,
                "base_year_max": 2025
              },
              {
                "code": "PYG",
                "noun": "Paraguayan guaranís",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
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
                  "start_year": 1994,
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
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2010,
                "base_year_max": 2020
              },
              {
                "code": "RWF",
                "noun": "Rwandan francs",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2000,
                "base_year_max": 2023
              },
              {
                "code": "SBD",
                "noun": "Solomon Islands dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SCR",
                "noun": "Seychellois rupees",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SDG",
                "noun": "Sudanese pounds",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SEK",
                "noun": "Swedish kronor",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "SGD",
                "noun": "Singapore dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SLE",
                "noun": "Sierra Leonean leones",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SRD",
                "noun": "Surinamese dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2011,
                "base_year_max": 2025
              },
              {
                "code": "STN",
                "noun": "São Tomé and Príncipe dobras",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "SYP",
                "noun": "Syrian pounds",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2010
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2010
              },
              {
                "code": "SZL",
                "noun": "Swazi emalangeni",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2018,
                "base_year_max": 2024
              },
              {
                "code": "TJS",
                "noun": "Tajikistani somonis",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TMT",
                "noun": "Turkmenistani manat",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1992,
                "base_year_max": 2025
              },
              {
                "code": "TND",
                "noun": "Tunisian dinars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TOP",
                "noun": "Tongan paʻanga",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "TRY",
                "noun": "Turkish lira",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1990,
                "base_year_max": 2025
              },
              {
                "code": "TTD",
                "noun": "Trinidad and Tobago dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2023,
                "base_year_max": 2024
              },
              {
                "code": "TZS",
                "noun": "Tanzanian shillings",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UAH",
                "noun": "Ukrainian hryvnias",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1991,
                "base_year_max": 2025
              },
              {
                "code": "UGX",
                "noun": "Ugandan shillings",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "USD",
                "noun": "US dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1960,
                "base_year_max": 2025
              },
              {
                "code": "UYU",
                "noun": "Uruguayan pesos",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "UZS",
                "noun": "Uzbekistani soms",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2017,
                "base_year_max": 2025
              },
              {
                "code": "VND",
                "noun": "Vietnamese dong",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "VUV",
                "noun": "Vanuatu vatu",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "WST",
                "noun": "Samoan tala",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XAF",
                "noun": "Central African CFA francs",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XCD",
                "noun": "East Caribbean dollars",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "XOF",
                "noun": "West African CFA francs",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 2014,
                "base_year_max": 2025
              },
              {
                "code": "ZAR",
                "noun": "South African rand",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "base_year_min": 1980,
                "base_year_max": 2025
              },
              {
                "code": "ZMW",
                "noun": "Zambian kwachas",
                "current_years": {
                  "start_year": 1994,
                  "end_year": 2024
                },
                "constant_years": {
                  "start_year": 1994,
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
  "rendered_sentence": "Germany's gross ODA disbursements to Guatemala for agriculture, forestry and fishing, 1994 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
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
      "kind": "text",
      "text": " to ",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 0
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
      "text": "agriculture, forestry and fishing",
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
      "text": "1994 to 2024",
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

export const servedDebt: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "external debt service of Ghana",
    "normalized_query": "external debt service of Ghana",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "8c9b45179c3247f48eeabdd8853b0f56",
    "warnings": [],
    "timing_ms": {
      "total": 3217
    },
    "llm_usage": {
      "input_tokens": 0,
      "output_tokens": 0,
      "cached_tokens": 0
    }
  },
  "kind": "resolution",
  "parts": [
    {
      "variable_text": "external debt service",
      "warnings": [],
      "timing_ms": {
        "total": 1109
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
                  "dcid": "financialFlowType",
                  "label": "financial flow type"
                },
                "label": "financial flow type"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "financingResource",
                  "label": "financing resource"
                },
                "label": "financing resource"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "guaranteeStatus",
                  "label": "guarantee status"
                },
                "label": "guarantee status"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "idsCreditorType",
                  "label": "IDS creditor type"
                },
                "label": "IDS creditor type"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "idsDebtorType",
                  "label": "IDS debtor type"
                },
                "label": "IDS debtor type"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "idsConcessionality",
                  "label": "IDS concessionality"
                },
                "label": "IDS concessionality"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "includesIMFCredit",
                  "label": "includes IMF credit"
                },
                "label": "includes IMF credit"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "maturityBand",
                  "label": "maturity band"
                },
                "label": "maturity band"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "netOf",
                  "label": "net of"
                },
                "label": "net of"
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
                  "dcid": "financialFlowType",
                  "label": "financial flow type"
                },
                "label": "financial flow type"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "dcid": "ServicingPayment",
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
                  "dcid": "financingResource",
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
                  "dcid": "guaranteeStatus",
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
                  "dcid": "idsCreditorType",
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
                  "dcid": "idsDebtorType",
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
                  "dcid": "idsConcessionality",
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
                  "dcid": "includesIMFCredit",
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
                  "dcid": "maturityBand",
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
                  "dcid": "netOf",
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
                  "dcid": "nettingBasis",
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
                    "dcid": "country/GHA",
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
            "items": [
              {
                "ref": "Amount_FinancialFlow_ServicingPayment_Nominal",
                "label": "Debt service on external debt (current US$)",
                "slot_values": [
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "financialFlowType",
                        "label": "financial flow type"
                      },
                      "label": "financial flow type"
                    },
                    "value": {
                      "ref": {
                        "dcid": "ServicingPayment",
                        "label": "servicing payment"
                      },
                      "value_kind": "enum_value"
                    }
                  }
                ],
                "constraint_properties": [
                  "financialFlowType"
                ],
                "data_date_range": {
                  "start": "1970",
                  "end": "2024"
                },
                "data_confirmed_at_destination": true
              }
            ],
            "member_count": 1,
            "member_count_exact": false,
            "truncated": false
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
            "evidence": "facet_metadata",
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
            }
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
                  "dcid": "financialFlowType",
                  "label": "financial flow type"
                },
                "label": "financial flow type"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "ServicingPayment",
                      "label": "servicing payment"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "Disbursement",
                      "label": "disbursement"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "guaranteeStatus",
                  "label": "guarantee status"
                },
                "label": "guarantee status"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "PublicOrPubliclyGuaranteed",
                      "label": "public or publicly guaranteed"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 63,
                  "served_rows_exact": false,
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "idsCreditorType",
                  "label": "IDS creditor type"
                },
                "label": "IDS creditor type"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "IDSCreditorTypePROP",
                      "label": "other private creditors (IDS creditor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 55,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "IDSCreditorTypeOFFT",
                      "label": "official creditors (IDS creditor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 55,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "IDSCreditorTypePRVT",
                      "label": "private creditors (IDS creditor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 63,
                  "served_rows_exact": false,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "IDSCreditorTypePCBK",
                      "label": "commercial banks (IDS creditor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 58,
                  "served_rows_exact": false,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "IDSCreditorTypePBND",
                      "label": "bondholders (IDS creditor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 18,
                  "served_rows_exact": false,
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "idsDebtorType",
                  "label": "IDS debtor type"
                },
                "label": "IDS debtor type"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "IDSDebtorTypeOPS",
                      "label": "other public sector (IDS debtor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 365,
                  "served_rows_exact": false,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "IDSDebtorTypePS",
                      "label": "public sector (IDS debtor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 453,
                  "served_rows_exact": false,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "IDSDebtorTypeGG",
                      "label": "general government (IDS debtor type)"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 439,
                  "served_rows_exact": false,
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "includesIMFCredit",
                  "label": "includes IMF credit"
                },
                "label": "includes IMF credit"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "WithoutIMFCredit",
                      "label": "without IMF credit"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 63,
                  "served_rows_exact": false,
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "maturityBand",
                  "label": "maturity band"
                },
                "label": "maturity band"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "LongTermMaturity",
                      "label": "long-term maturity"
                    },
                    "value_kind": "enum_value"
                  },
                  "served_rows": 63,
                  "served_rows_exact": false,
                  "coverage": null
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
            "resolved_stat_vars": [
              {
                "dcid": "Amount_FinancialFlow_ServicingPayment_Nominal",
                "label": "Debt service on external debt (current US$)"
              }
            ],
            "resolved_stat_vars_truncated": false,
            "resolved_entities": [
              {
                "dcid": "country/GHA",
                "label": "Ghana"
              }
            ],
            "resolved_sources": [
              {
                "dcid": "provenance/WorldBankInternationalDebtStatistics",
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
            "pipeline_trace": [],
            "n_recalled": 55,
            "capability_version": "cap_cbe83b130f0e8d02",
            "default_reading": {
              "applied": true,
              "removed_stat_vars": []
            }
          },
          "confidence": "high",
          "available_at_place": true,
          "measure_label_axes": [],
          "measure_label_named_values": [],
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

export const servedDebtEvents: unknown = [
  {
    "kind": "slot_options",
    "spec_id": "spec_065cdb39893ee708825658b2af961c78",
    "key": {
      "axis": "how",
      "property": {
        "dcid": "financialFlowType",
        "label": "financial flow type"
      },
      "label": "financial flow type"
    },
    "options": [
      {
        "value": {
          "ref": {
            "dcid": "ServicingPayment",
            "label": "servicing payment"
          },
          "value_kind": "enum_value"
        },
        "coverage": null
      },
      {
        "value": {
          "ref": {
            "dcid": "Disbursement",
            "label": "disbursement"
          },
          "value_kind": "enum_value"
        },
        "coverage": null
      }
    ],
    "truncated": true
  },
  {
    "kind": "slot_options",
    "spec_id": "spec_065cdb39893ee708825658b2af961c78",
    "key": {
      "axis": "how",
      "property": {
        "dcid": "guaranteeStatus",
        "label": "guarantee status"
      },
      "label": "guarantee status"
    },
    "options": [
      {
        "value": {
          "ref": {
            "dcid": "PublicOrPubliclyGuaranteed",
            "label": "public or publicly guaranteed"
          },
          "value_kind": "enum_value"
        },
        "served_rows": 63,
        "served_rows_exact": false,
        "coverage": null
      }
    ],
    "truncated": true
  },
  {
    "kind": "slot_options",
    "spec_id": "spec_065cdb39893ee708825658b2af961c78",
    "key": {
      "axis": "how",
      "property": {
        "dcid": "idsCreditorType",
        "label": "IDS creditor type"
      },
      "label": "IDS creditor type"
    },
    "options": [
      {
        "value": {
          "ref": {
            "dcid": "IDSCreditorTypePROP",
            "label": "other private creditors (IDS creditor type)"
          },
          "value_kind": "enum_value"
        },
        "served_rows": 55,
        "served_rows_exact": true,
        "coverage": null
      },
      {
        "value": {
          "ref": {
            "dcid": "IDSCreditorTypeOFFT",
            "label": "official creditors (IDS creditor type)"
          },
          "value_kind": "enum_value"
        },
        "served_rows": 55,
        "served_rows_exact": true,
        "coverage": null
      },
      {
        "value": {
          "ref": {
            "dcid": "IDSCreditorTypePRVT",
            "label": "private creditors (IDS creditor type)"
          },
          "value_kind": "enum_value"
        },
        "served_rows": 63,
        "served_rows_exact": false,
        "coverage": null
      },
      {
        "value": {
          "ref": {
            "dcid": "IDSCreditorTypePCBK",
            "label": "commercial banks (IDS creditor type)"
          },
          "value_kind": "enum_value"
        },
        "served_rows": 58,
        "served_rows_exact": false,
        "coverage": null
      },
      {
        "value": {
          "ref": {
            "dcid": "IDSCreditorTypePBND",
            "label": "bondholders (IDS creditor type)"
          },
          "value_kind": "enum_value"
        },
        "served_rows": 18,
        "served_rows_exact": false,
        "coverage": null
      }
    ],
    "truncated": true
  },
  {
    "kind": "slot_options",
    "spec_id": "spec_065cdb39893ee708825658b2af961c78",
    "key": {
      "axis": "how",
      "property": {
        "dcid": "idsDebtorType",
        "label": "IDS debtor type"
      },
      "label": "IDS debtor type"
    },
    "options": [
      {
        "value": {
          "ref": {
            "dcid": "IDSDebtorTypeOPS",
            "label": "other public sector (IDS debtor type)"
          },
          "value_kind": "enum_value"
        },
        "served_rows": 365,
        "served_rows_exact": false,
        "coverage": null
      },
      {
        "value": {
          "ref": {
            "dcid": "IDSDebtorTypePS",
            "label": "public sector (IDS debtor type)"
          },
          "value_kind": "enum_value"
        },
        "served_rows": 453,
        "served_rows_exact": false,
        "coverage": null
      },
      {
        "value": {
          "ref": {
            "dcid": "IDSDebtorTypeGG",
            "label": "general government (IDS debtor type)"
          },
          "value_kind": "enum_value"
        },
        "served_rows": 439,
        "served_rows_exact": false,
        "coverage": null
      }
    ],
    "truncated": true
  },
  {
    "kind": "slot_options",
    "spec_id": "spec_065cdb39893ee708825658b2af961c78",
    "key": {
      "axis": "how",
      "property": {
        "dcid": "includesIMFCredit",
        "label": "includes IMF credit"
      },
      "label": "includes IMF credit"
    },
    "options": [
      {
        "value": {
          "ref": {
            "dcid": "WithoutIMFCredit",
            "label": "without IMF credit"
          },
          "value_kind": "enum_value"
        },
        "served_rows": 63,
        "served_rows_exact": false,
        "coverage": null
      }
    ],
    "truncated": true
  },
  {
    "kind": "slot_options",
    "spec_id": "spec_065cdb39893ee708825658b2af961c78",
    "key": {
      "axis": "how",
      "property": {
        "dcid": "maturityBand",
        "label": "maturity band"
      },
      "label": "maturity band"
    },
    "options": [
      {
        "value": {
          "ref": {
            "dcid": "LongTermMaturity",
            "label": "long-term maturity"
          },
          "value_kind": "enum_value"
        },
        "served_rows": 63,
        "served_rows_exact": false,
        "coverage": null
      }
    ],
    "truncated": true
  }
];

export const servedGdp: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "dataset_resubmit",
    "extract_skipped": true
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "67c4255a56d34f37a67a1f6c21614452",
    "warnings": [],
    "timing_ms": {
      "total": 3089
    }
  },
  "kind": "resolution",
  "parts": [
    {
      "variable_text": "GDP",
      "warnings": [],
      "timing_ms": {
        "total": 2767
      },
      "restatement_reason": "no_phrase_inputs",
      "operations": [],
      "departures": [],
      "status": "definite",
      "spec": {
        "spec_id": "spec_d47a17644ee5fd6fee5248b4d4c8be26",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_d47a17644ee5fd6fee5248b4d4c8be26",
          "identity": {
            "identity_version": "spec1",
            "shape": {
              "kind": "statvar_schema",
              "population_type": "EconomicActivity",
              "measured_property": "amount",
              "stat_type": "measuredValue",
              "measurement_qualifier": "Nominal"
            },
            "slots": [
              {
                "property": "activitySource",
                "binding": {
                  "state": "value",
                  "ref": "GrossDomesticProduction"
                }
              },
              {
                "property": "economicSector",
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
              "kind": "all"
            }
          }
        },
        "resolved": {
          "shape": {
            "shape_id": "economicactivity_amount_measuredvalue_nominal",
            "label": "Nominal gross domestic product",
            "population_type": {
              "dcid": "EconomicActivity",
              "label": "EconomicActivity"
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
                  "dcid": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "economicSector",
                  "label": "economicSector"
                },
                "label": "economic sector"
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
            "member_count": 38,
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
                  "dcid": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "dcid": "GrossDomesticProduction",
                    "label": "GrossDomesticProduction"
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
                  "dcid": "economicSector",
                  "label": "economicSector"
                },
                "label": "economic sector"
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
            "economicSector"
          ],
          "unresolved_slots": [],
          "stat_vars": {
            "items": [
              {
                "ref": "Amount_EconomicActivity_GrossDomesticProduction_Nominal",
                "label": "Nominal gross domestic product",
                "slot_values": [
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "activitySource",
                        "label": "activitySource"
                      },
                      "label": "activity source"
                    },
                    "value": {
                      "ref": {
                        "dcid": "GrossDomesticProduction",
                        "label": "GrossDomesticProduction"
                      },
                      "value_kind": "enum_value"
                    }
                  }
                ],
                "constraint_properties": [
                  "activitySource"
                ],
                "data_date_range": {
                  "start": "1960",
                  "end": "2024"
                }
              }
            ],
            "member_count": 38,
            "member_count_exact": true,
            "truncated": true
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
            "observation_count": 65,
            "evidence": "facet_metadata",
            "dimensions": [
              {
                "label": "sources",
                "count": 1
              },
              {
                "label": "observations",
                "count": 65
              },
              {
                "label": "variables",
                "count": 1
              }
            ]
          },
          "download": {
            "rows": 65,
            "rows_exact": true,
            "series": 1,
            "window": {
              "start_year": 1960,
              "end_year": 2024
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
              "ref": "USDollar",
              "label": "USDollar",
              "currency": "USD"
            }
          },
          "slot_options": [
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "GrossDomesticProduction",
                      "label": "GrossDomesticProduction"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "economicSector",
                  "label": "economicSector"
                },
                "label": "economic sector"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "AccommodationAndFoodSector",
                      "label": "Accommodation and food sector"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "AdministrativeAndSupportServices",
                      "label": "Administrative and support services"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "AgriculturalSupportActivities",
                      "label": "Agricultural support activities"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "Agriculture",
                      "label": "Agriculture"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
            }
          ],
          "entity_options": [],
          "facet_options": [],
          "rendered_sentence": "Kenya's GDP, 1960 to 2024. Current US dollars · World Development Indicators.",
          "trace": {
            "resolved_stat_vars": [
              {
                "dcid": "Amount_EconomicActivity_GrossDomesticProduction_Nominal",
                "label": "Nominal gross domestic product"
              }
            ],
            "resolved_stat_vars_truncated": false,
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
            "pipeline_trace": [],
            "capability_version": "cap_cbe83b130f0e8d02"
          },
          "confidence": "high",
          "available_at_place": true,
          "measure_label_axes": [],
          "measure_label_named_values": [],
          "measure_axis_values": [],
          "related_group": {
            "dcid": "dc/g/EconomicActivity_ActivitySource-GrossDomesticProduction",
            "label": "Economic Activity With Activity Source = Gross Domestic Production"
          },
          "related_measures": [
            {
              "label": "Gross domestic product growth rate",
              "resolved_stat_var_dcids": [
                "GrowthRate_Amount_EconomicActivity_GrossDomesticProduction"
              ],
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_6cea88ddddf657cedb982bd9a6b192d3",
                "identity": {
                  "identity_version": "spec1",
                  "shape": {
                    "kind": "statvar_schema",
                    "population_type": "EconomicActivity",
                    "measured_property": "amount",
                    "stat_type": "growthRate"
                  },
                  "slots": [
                    {
                      "property": "activitySource",
                      "binding": {
                        "state": "value",
                        "ref": "GrossDomesticProduction"
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
  "rendered_sentence": "Kenya's GDP, 1960 to 2024. Current US dollars · World Development Indicators.",
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
      "text": "GDP",
      "axis": "what",
      "segment": "heading",
      "entity_refs": [],
      "states": [
        "how:activitySource",
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
      "property_dcid": "economicSector",
      "binding_ref": "how:economicSector",
      "entity_refs": [],
      "states": [],
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
      "kind": "text",
      "text": ", ",
      "segment": "heading",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "slot",
      "text": "1960 to 2024",
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

export const servedGdpEvents: unknown = [
  {
    "kind": "slot_options",
    "spec_id": "spec_d47a17644ee5fd6fee5248b4d4c8be26",
    "key": {
      "axis": "how",
      "property": {
        "dcid": "activitySource",
        "label": "activitySource"
      },
      "label": "activity source"
    },
    "options": [
      {
        "value": {
          "ref": {
            "dcid": "GrossDomesticProduction",
            "label": "GrossDomesticProduction"
          },
          "value_kind": "enum_value"
        },
        "coverage": {
          "kind": "exact",
          "has_data": true,
          "observation_count": 65,
          "evidence": "facet_metadata",
          "dimensions": [
            {
              "label": "sources",
              "count": 1
            },
            {
              "label": "observations",
              "count": 65
            },
            {
              "label": "variables",
              "count": 1
            }
          ]
        },
        "served_rows": 65,
        "served_rows_exact": true
      }
    ],
    "truncated": true
  },
  {
    "kind": "slot_options",
    "spec_id": "spec_d47a17644ee5fd6fee5248b4d4c8be26",
    "key": {
      "axis": "how",
      "property": {
        "dcid": "economicSector",
        "label": "economicSector"
      },
      "label": "economic sector"
    },
    "options": [
      {
        "value": {
          "ref": {
            "dcid": "AccommodationAndFoodSector",
            "label": "Accommodation and food sector"
          },
          "value_kind": "enum_value"
        },
        "coverage": {
          "kind": "exact",
          "has_data": true,
          "observation_count": 5,
          "evidence": "facet_metadata",
          "dimensions": [
            {
              "label": "sources",
              "count": 1
            },
            {
              "label": "observations",
              "count": 5
            },
            {
              "label": "variables",
              "count": 1
            }
          ]
        },
        "served_rows": 5,
        "served_rows_exact": true
      },
      {
        "value": {
          "ref": {
            "dcid": "AdministrativeAndSupportServices",
            "label": "Administrative and support services"
          },
          "value_kind": "enum_value"
        },
        "coverage": {
          "kind": "exact",
          "has_data": true,
          "observation_count": 5,
          "evidence": "facet_metadata",
          "dimensions": [
            {
              "label": "sources",
              "count": 1
            },
            {
              "label": "observations",
              "count": 5
            },
            {
              "label": "variables",
              "count": 1
            }
          ]
        },
        "served_rows": 5,
        "served_rows_exact": true
      },
      {
        "value": {
          "ref": {
            "dcid": "AgriculturalSupportActivities",
            "label": "Agricultural support activities"
          },
          "value_kind": "enum_value"
        },
        "coverage": {
          "kind": "exact",
          "has_data": true,
          "observation_count": 5,
          "evidence": "facet_metadata",
          "dimensions": [
            {
              "label": "sources",
              "count": 1
            },
            {
              "label": "observations",
              "count": 5
            },
            {
              "label": "variables",
              "count": 1
            }
          ]
        },
        "served_rows": 5,
        "served_rows_exact": true
      },
      {
        "value": {
          "ref": {
            "dcid": "Agriculture",
            "label": "Agriculture"
          },
          "value_kind": "enum_value"
        },
        "coverage": {
          "kind": "exact",
          "has_data": true,
          "observation_count": 5,
          "evidence": "facet_metadata",
          "dimensions": [
            {
              "label": "sources",
              "count": 1
            },
            {
              "label": "observations",
              "count": 5
            },
            {
              "label": "variables",
              "count": 1
            }
          ]
        },
        "served_rows": 5,
        "served_rows_exact": true
      }
    ],
    "truncated": true
  }
];

export const servedHealth: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "health expenditure in Kenya",
    "normalized_query": "health expenditure in Kenya",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "b0216b27682d47b18156fb41b71aedc6",
    "warnings": [],
    "timing_ms": {
      "total": 2620
    },
    "llm_usage": {
      "input_tokens": 0,
      "output_tokens": 0,
      "cached_tokens": 0
    }
  },
  "kind": "resolution",
  "parts": [
    {
      "variable_text": "health expenditure",
      "warnings": [],
      "timing_ms": {
        "total": 1636
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
              "dcid": "EconomicActivity",
              "label": "EconomicActivity"
            },
            "measured_property": {
              "dcid": "amount",
              "label": "amount"
            },
            "stat_type": {
              "dcid": "measuredValue",
              "label": "measuredValue"
            },
            "measurement_denominator": {
              "dcid": "Count_Person",
              "label": "Total population"
            },
            "measurement_denominator_unresolved": false,
            "slot_keys": [
              {
                "axis": "how",
                "property": {
                  "dcid": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "expenditureType",
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
                  "dcid": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "dcid": "ExpenditureActivity",
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
                  "dcid": "expenditureType",
                  "label": "expenditureType"
                },
                "label": "expenditure type"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "dcid": "HealthcareExpenditure",
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
            "items": [
              {
                "ref": "Amount_EconomicActivity_ExpenditureActivity_HealthcareExpenditure_AsFractionOf_Count_Person",
                "label": "Healthcare expenditure per person",
                "slot_values": [
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "activitySource",
                        "label": "activitySource"
                      },
                      "label": "activity source"
                    },
                    "value": {
                      "ref": {
                        "dcid": "ExpenditureActivity",
                        "label": "ExpenditureActivity"
                      },
                      "value_kind": "enum_value"
                    }
                  },
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "expenditureType",
                        "label": "expenditureType"
                      },
                      "label": "expenditure type"
                    },
                    "value": {
                      "ref": {
                        "dcid": "HealthcareExpenditure",
                        "label": "HealthcareExpenditure"
                      },
                      "value_kind": "enum_value"
                    }
                  }
                ],
                "constraint_properties": [
                  "activitySource",
                  "expenditureType"
                ],
                "data_date_range": {
                  "start": "2000",
                  "end": "2023"
                }
              }
            ],
            "member_count": 1,
            "member_count_exact": false,
            "truncated": false
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
            "evidence": "facet_metadata",
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
                  "dcid": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "ExpenditureActivity",
                      "label": "ExpenditureActivity"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "expenditureType",
                  "label": "expenditureType"
                },
                "label": "expenditure type"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "HealthcareExpenditure",
                      "label": "HealthcareExpenditure"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": null
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
            "resolved_stat_vars": [
              {
                "dcid": "Amount_EconomicActivity_ExpenditureActivity_HealthcareExpenditure_AsFractionOf_Count_Person",
                "label": "Healthcare expenditure per person"
              }
            ],
            "resolved_stat_vars_truncated": false,
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
            "pipeline_trace": [],
            "n_recalled": 64,
            "capability_version": "cap_cbe83b130f0e8d02",
            "default_reading": {
              "applied": true,
              "removed_stat_vars": []
            }
          },
          "confidence": "high",
          "available_at_place": true,
          "measure_label_axes": [],
          "measure_label_named_values": [],
          "measure_axis_values": [],
          "related_group": {
            "dcid": "dc/g/EconomicActivity_ActivitySource-ExpenditureActivity_ExpenditureType",
            "label": "Economic Activity With Activity Source = Expenditure Activity, Expenditure Type"
          },
          "related_measures": [
            {
              "label": "Fraction of Government Expenditure on Tertiary Education",
              "resolved_stat_var_dcids": [
                "Amount_EconomicActivity_ExpenditureActivity_TertiaryEducationExpenditure_Government_AsFractionOf_Amount_EconomicActivity_ExpenditureActivity_EducationExpenditure_Government"
              ],
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

export const servedHealthEvents: unknown = [
  {
    "kind": "slot_options",
    "spec_id": "spec_0002907ee44bf25fc98f343372614a84",
    "key": {
      "axis": "how",
      "property": {
        "dcid": "activitySource",
        "label": "activitySource"
      },
      "label": "activity source"
    },
    "options": [
      {
        "value": {
          "ref": {
            "dcid": "ExpenditureActivity",
            "label": "ExpenditureActivity"
          },
          "value_kind": "enum_value"
        },
        "coverage": {
          "kind": "exact",
          "has_data": true,
          "observation_count": 24,
          "evidence": "facet_metadata",
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
        "served_rows": 24,
        "served_rows_exact": true
      }
    ],
    "truncated": true
  },
  {
    "kind": "slot_options",
    "spec_id": "spec_0002907ee44bf25fc98f343372614a84",
    "key": {
      "axis": "how",
      "property": {
        "dcid": "expenditureType",
        "label": "expenditureType"
      },
      "label": "expenditure type"
    },
    "options": [
      {
        "value": {
          "ref": {
            "dcid": "HealthcareExpenditure",
            "label": "HealthcareExpenditure"
          },
          "value_kind": "enum_value"
        },
        "coverage": {
          "kind": "exact",
          "has_data": true,
          "observation_count": 24,
          "evidence": "facet_metadata",
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
        "served_rows": 24,
        "served_rows_exact": true
      }
    ],
    "truncated": true
  }
];

export const servedMulti: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "aid to Kenya and health expenditure in Kenya",
    "normalized_query": "aid to Kenya and health expenditure in Kenya",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "9194bb21b0314f1ea6e005a082e2af47",
    "warnings": [],
    "timing_ms": {
      "total": 2009
    },
    "llm_usage": {
      "input_tokens": 0,
      "output_tokens": 0,
      "cached_tokens": 0
    }
  },
  "kind": "resolution",
  "parts": [
    {
      "variable_text": "aid",
      "warnings": [
        {
          "code": "role_scope_defaulted",
          "severity": "warn",
          "message": "no provider was named; the answer was resolved across every provider with data."
        },
        {
          "code": "observations_series_truncated",
          "severity": "warn",
          "message": "showing 20 of 6727 confirmed series (a stable, identity-ordered selection, not ranked by value); the rest are not shown.",
          "spec_id": "spec_05cb85e86ac9399a0e9ae83234b21dc4",
          "params": {
            "shown": 20,
            "total": 6727
          }
        }
      ],
      "timing_ms": {
        "total": 1508
      },
      "restatement": {
        "variable_text": "aid",
        "entities": [
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
        "spec_id": "spec_05cb85e86ac9399a0e9ae83234b21dc4",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_05cb85e86ac9399a0e9ae83234b21dc4",
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
              "kind": "all"
            }
          }
        },
        "resolved": {
          "shape": {
            "shape_id": "financialflow_amount_measuredvalue_nominal",
            "label": "gross disbursements (official development assistance)",
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
                "kind": "unbound"
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
            "items": [
              {
                "ref": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode11110_Nominal",
                "label": "Official development assistance gross disbursements for education policy and administrative management (standard grant)",
                "slot_values": [
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "crsTypeOfFlow",
                        "label": "CRS type of flow"
                      },
                      "label": "flow"
                    },
                    "value": {
                      "ref": {
                        "dcid": "CRSTypeOfFlow10",
                        "label": "official development assistance"
                      },
                      "value_kind": "enum_value"
                    }
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
                    "value": {
                      "ref": {
                        "dcid": "Disbursement",
                        "label": "disbursement"
                      },
                      "value_kind": "enum_value"
                    }
                  }
                ],
                "constraint_properties": [
                  "crsPurpose",
                  "crsTypeOfFinance",
                  "crsTypeOfFlow",
                  "financialFlowType",
                  "nettingBasis"
                ],
                "data_date_range": {
                  "start": "1994",
                  "end": "2009"
                },
                "data_confirmed_at_destination": true
              },
              {
                "ref": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode11120_Nominal",
                "label": "Official development assistance gross disbursements for education facility and training (standard grant)",
                "slot_values": [
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "crsTypeOfFlow",
                        "label": "CRS type of flow"
                      },
                      "label": "flow"
                    },
                    "value": {
                      "ref": {
                        "dcid": "CRSTypeOfFlow10",
                        "label": "official development assistance"
                      },
                      "value_kind": "enum_value"
                    }
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
                    "value": {
                      "ref": {
                        "dcid": "Disbursement",
                        "label": "disbursement"
                      },
                      "value_kind": "enum_value"
                    }
                  }
                ],
                "constraint_properties": [
                  "crsPurpose",
                  "crsTypeOfFinance",
                  "crsTypeOfFlow",
                  "financialFlowType",
                  "nettingBasis"
                ],
                "data_date_range": {
                  "start": "1992",
                  "end": "2009"
                },
                "data_confirmed_at_destination": true
              }
            ],
            "member_count": 1454,
            "member_count_exact": true,
            "truncated": true
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
            "observation_count": 30325,
            "evidence": "facet_metadata",
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
                "count": 1454
              }
            ]
          },
          "headline": {
            "year": 2024,
            "year_named": false,
            "observations": 1852,
            "series": 1852,
            "role_counts": {
              "financingProvider": 75,
              "financingRecipient": 1
            }
          },
          "download": {
            "rows": 30325,
            "rows_exact": true,
            "series": 6727,
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
                  "dcid": "crsCooperationModality",
                  "label": "CRS cooperation modality"
                },
                "label": "modality"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityA",
                      "label": "budget support"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 613,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityA02",
                      "label": "sector budget support"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityA",
                  "member_count": 1658,
                  "served_rows": 572,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSCooperationModalityA01",
                      "label": "general budget support"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSCooperationModalityA",
                  "member_count": 289,
                  "served_rows": 41,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
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
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode998",
                      "label": "unallocated and unspecified"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 76,
                  "served_rows": 778,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode99810",
                      "label": "sectors not specified"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode998",
                  "member_count": 255,
                  "served_rows": 692,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSPurposeCode99820",
                      "label": "non-sector allocable promotion of development awareness"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSPurposeCode998",
                  "member_count": 77,
                  "served_rows": 86,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
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
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance100",
                      "label": "grant"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 0,
                  "served_rows": 25194,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance110",
                      "label": "standard grant"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance100",
                  "member_count": 12672,
                  "served_rows": 25081,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFinance210",
                      "label": "interest subsidy"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "child",
                  "parent": "CRSTypeOfFinance100",
                  "member_count": 430,
                  "served_rows": 113,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
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
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFlow10",
                      "label": "official development assistance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 14098,
                  "served_rows": 30325,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFlow21",
                      "label": "non-export credit official flow"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 3798,
                  "served_rows": 752,
                  "served_rows_exact": true,
                  "coverage": null
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CRSTypeOfFlow30",
                      "label": "private development finance"
                    },
                    "value_kind": "enum_value"
                  },
                  "relation": "root",
                  "member_count": 2711,
                  "served_rows": 2141,
                  "served_rows_exact": true,
                  "coverage": null
                }
              ],
              "truncated": true,
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
          "rendered_sentence": "Gross ODA disbursements to Kenya from 86 donors, 1973 to 2024. Current US dollars · OECD Creditor Reporting System (CRS).",
          "trace": {
            "resolved_stat_vars": [
              {
                "dcid": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode11110_Nominal",
                "label": "Official development assistance gross disbursements for education policy and administrative management (standard grant)"
              },
              {
                "dcid": "Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode11120_Nominal",
                "label": "Official development assistance gross disbursements for education facility and training (standard grant)"
              }
            ],
            "resolved_stat_vars_truncated": true,
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
            "query_qualifiers": [],
            "pipeline_trace": [],
            "n_recalled": 51,
            "capability_version": "cap_cbe83b130f0e8d02",
            "declaration_version": "29967a15833349bbe4446023f170f5b77b21aa45963894a1b589848c3196d623",
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
                "spec_id": "spec_21781f33a52e1f9238208833f8f7bbb6",
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
              "served_rows": 31011,
              "served_rows_exact": true
            },
            {
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_d17ef015663ed1083d69df8ae8feb27f",
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
              "served_rows": 28382,
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
          "measure_label_named_values": [],
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
              "property": "crsPurpose",
              "varies": true,
              "distinct_count": 221,
              "undeclared_count": 0,
              "values": [
                {
                  "value": {
                    "dcid": "CRSPurposeCode99810",
                    "label": "sectors not specified"
                  },
                  "count": 16
                },
                {
                  "value": {
                    "dcid": "CRSPurposeCode15110",
                    "label": "public sector policy and administrative management"
                  },
                  "count": 14
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
                    "dcid": "CRSTypeOfFinance110",
                    "label": "standard grant"
                  },
                  "count": 1144
                },
                {
                  "value": {
                    "dcid": "CRSTypeOfFinance421",
                    "label": "standard loan"
                  },
                  "count": 235
                }
              ]
            },
            {
              "property": "crsCooperationModality",
              "varies": true,
              "distinct_count": 17,
              "undeclared_count": 233,
              "values": [
                {
                  "value": {
                    "dcid": "CRSCooperationModalityC01",
                    "label": "project-type intervention"
                  },
                  "count": 383
                },
                {
                  "value": {
                    "dcid": "CRSCooperationModalityD02",
                    "label": "other technical assistance"
                  },
                  "count": 164
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
              "destination": "KES"
            }
          }
        }
      }
    },
    {
      "variable_text": "health expenditure",
      "warnings": [
        {
          "code": "direction_discarded",
          "severity": "warn",
          "message": "Kenya was named as the recipient; this shape reports the place as its own subject, so the direction was dropped."
        }
      ],
      "timing_ms": {
        "total": 1489
      },
      "restatement": {
        "variable_text": "health expenditure",
        "entities": [
          {
            "text": "Kenya",
            "role_text": "to"
          }
        ],
        "operations": []
      },
      "operations": [],
      "departures": [
        {
          "code": "direction_discarded",
          "binding_ref": "where:",
          "asked": "Kenya",
          "text": "You named Kenya as a recipient. This measure has no recipients, so this shows the place itself."
        }
      ],
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
              "dcid": "EconomicActivity",
              "label": "EconomicActivity"
            },
            "measured_property": {
              "dcid": "amount",
              "label": "amount"
            },
            "stat_type": {
              "dcid": "measuredValue",
              "label": "measuredValue"
            },
            "measurement_denominator": {
              "dcid": "Count_Person",
              "label": "Total population"
            },
            "measurement_denominator_unresolved": false,
            "slot_keys": [
              {
                "axis": "how",
                "property": {
                  "dcid": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "expenditureType",
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
                  "dcid": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "dcid": "ExpenditureActivity",
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
                  "dcid": "expenditureType",
                  "label": "expenditureType"
                },
                "label": "expenditure type"
              },
              "binding": {
                "kind": "value",
                "value": {
                  "ref": {
                    "dcid": "HealthcareExpenditure",
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
            "items": [
              {
                "ref": "Amount_EconomicActivity_ExpenditureActivity_HealthcareExpenditure_AsFractionOf_Count_Person",
                "label": "Healthcare expenditure per person",
                "slot_values": [
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "activitySource",
                        "label": "activitySource"
                      },
                      "label": "activity source"
                    },
                    "value": {
                      "ref": {
                        "dcid": "ExpenditureActivity",
                        "label": "ExpenditureActivity"
                      },
                      "value_kind": "enum_value"
                    }
                  },
                  {
                    "key": {
                      "axis": "how",
                      "property": {
                        "dcid": "expenditureType",
                        "label": "expenditureType"
                      },
                      "label": "expenditure type"
                    },
                    "value": {
                      "ref": {
                        "dcid": "HealthcareExpenditure",
                        "label": "HealthcareExpenditure"
                      },
                      "value_kind": "enum_value"
                    }
                  }
                ],
                "constraint_properties": [
                  "activitySource",
                  "expenditureType"
                ],
                "data_date_range": {
                  "start": "2000",
                  "end": "2023"
                }
              }
            ],
            "member_count": 1,
            "member_count_exact": false,
            "truncated": false
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
            "evidence": "facet_metadata",
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
                  "dcid": "activitySource",
                  "label": "activitySource"
                },
                "label": "activity source"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "ExpenditureActivity",
                      "label": "ExpenditureActivity"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": null
                }
              ],
              "truncated": true,
              "source": "observed"
            },
            {
              "key": {
                "axis": "how",
                "property": {
                  "dcid": "expenditureType",
                  "label": "expenditureType"
                },
                "label": "expenditure type"
              },
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "HealthcareExpenditure",
                      "label": "HealthcareExpenditure"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": null
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
            "resolved_stat_vars": [
              {
                "dcid": "Amount_EconomicActivity_ExpenditureActivity_HealthcareExpenditure_AsFractionOf_Count_Person",
                "label": "Healthcare expenditure per person"
              }
            ],
            "resolved_stat_vars_truncated": false,
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
            "pipeline_trace": [],
            "n_recalled": 64,
            "capability_version": "cap_cbe83b130f0e8d02",
            "default_reading": {
              "applied": true,
              "removed_stat_vars": []
            }
          },
          "confidence": "high",
          "available_at_place": true,
          "measure_label_axes": [],
          "measure_label_named_values": [],
          "measure_axis_values": [],
          "related_group": {
            "dcid": "dc/g/EconomicActivity_ActivitySource-ExpenditureActivity_ExpenditureType",
            "label": "Economic Activity With Activity Source = Expenditure Activity, Expenditure Type"
          },
          "related_measures": [
            {
              "label": "Fraction of Government Expenditure on Tertiary Education",
              "resolved_stat_var_dcids": [
                "Amount_EconomicActivity_ExpenditureActivity_TertiaryEducationExpenditure_Government_AsFractionOf_Amount_EconomicActivity_ExpenditureActivity_EducationExpenditure_Government"
              ],
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
  "rendered_sentence": "Gross ODA disbursements to Kenya from 86 donors, 1973 to 2024. Current US dollars · OECD Creditor Reporting System (CRS). Kenya's health expenditure per capita in international dollars, 2000 to 2023. World Development Indicators. You named Kenya as a recipient. This measure has no recipients, so this shows the place itself.",
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
      "text": "86 donors",
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
      "text": ", ",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 0
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
      ],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": ".",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": " ",
      "segment": "byline",
      "entity_refs": [],
      "states": [],
      "part_index": 0
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
      ],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": " · ",
      "segment": "byline",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "OECD Creditor Reporting System (CRS)",
      "axis": "source",
      "segment": "byline",
      "entity_refs": [],
      "states": [
        "source:"
      ],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": ".",
      "segment": "byline",
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
      "text": "Kenya",
      "axis": "where",
      "segment": "heading",
      "binding_ref": "where:",
      "entity_refs": [],
      "states": [
        "where:"
      ],
      "part_index": 1
    },
    {
      "kind": "text",
      "text": "'s",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 1
    },
    {
      "kind": "text",
      "text": " ",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 1
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
      "part_index": 1
    },
    {
      "kind": "text",
      "text": " ",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 1
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
      "part_index": 1
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
      "part_index": 1
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
      "part_index": 1
    },
    {
      "kind": "text",
      "text": ", ",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 1
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
      ],
      "part_index": 1
    },
    {
      "kind": "text",
      "text": ".",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
      "part_index": 1
    },
    {
      "kind": "text",
      "text": " ",
      "segment": "byline",
      "entity_refs": [],
      "states": [],
      "part_index": 1
    },
    {
      "kind": "slot",
      "text": "World Development Indicators",
      "axis": "source",
      "segment": "byline",
      "entity_refs": [],
      "states": [
        "source:"
      ],
      "part_index": 1
    },
    {
      "kind": "text",
      "text": ".",
      "segment": "byline",
      "entity_refs": [],
      "states": [],
      "part_index": 1
    },
    {
      "kind": "text",
      "text": " ",
      "segment": "departure",
      "entity_refs": [],
      "states": [],
      "part_index": 1
    },
    {
      "kind": "text",
      "text": "You named Kenya as a recipient. This measure has no recipients, so this shows the place itself.",
      "segment": "departure",
      "entity_refs": [],
      "states": [],
      "part_index": 1
    }
  ],
  "status": "definite"
};
