/**
 * Real `/api/search/resolve` response from dfo-apis branch
 * feat/answer-edit-routes (commit b14dbb031), captured 2026-10-04 from a
 * local server with observations on: query "government education spending
 * Kenya".
 *
 * A `candidates` answer with two interpretations, both a single exact
 * StatVar: government education expenditure as a share of GDP, and as a
 * share of government expenditure.
 *
 * Trimmed for size; each body still validates against the API's models
 * (scripts/check-search-fixtures.mts). `stat_vars.items` and
 * `trace.resolved_stat_vars` keep two entries and are marked truncated
 * where that cut them, `slot_values` and `open_axis_facts[].values` keep
 * two, the specs' own `sentence_plan` is dropped (the envelope's stays),
 * `trace.pipeline_trace` and `trace.slot_filters` are empty, and timings
 * keep their totals. The server omits a `unit_conversion` currency's
 * `current_years` when it is null, which its own model requires; this
 * file writes the null.
 */

export const multiCandidate: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "government education spending Kenya",
    "normalized_query": "government education spending Kenya",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "f07ffc1477d04a02956726cb13a75d93",
    "warnings": [],
    "timing_ms": {
      "total": 2666
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
      "variable_text": "government education spending",
      "warnings": [
        {
          "code": "observations_omitted",
          "severity": "warn",
          "message": "Observations were not fetched for this candidates part; resubmit a chosen candidate with include_observations to retrieve them."
        }
      ],
      "timing_ms": {
        "total": 1721
      },
      "rendered_sentence": "2 readings. Kenya's percent of nominal GDP spent on education. World Development Indicators · 1971 to 2024. Kenya's percent of total government expenditure on education. World Development Indicators · 1982 to 2025.",
      "sentence_plan": [
        {
          "kind": "text",
          "text": "2 readings.",
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
          "kind": "text",
          "text": "Kenya",
          "segment": "heading",
          "entity_refs": [],
          "states": []
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
          "kind": "text",
          "text": "percent of nominal GDP spent on education",
          "segment": "heading",
          "entity_refs": [],
          "states": []
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
          "kind": "text",
          "text": "World Development Indicators",
          "segment": "byline",
          "entity_refs": [],
          "states": []
        },
        {
          "kind": "text",
          "text": " · ",
          "segment": "byline",
          "entity_refs": [],
          "states": []
        },
        {
          "kind": "text",
          "text": "1971 to 2024",
          "segment": "byline",
          "entity_refs": [],
          "states": []
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
          "segment": "heading",
          "entity_refs": [],
          "states": []
        },
        {
          "kind": "text",
          "text": "Kenya",
          "segment": "heading",
          "entity_refs": [],
          "states": []
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
          "kind": "text",
          "text": "percent of total government expenditure on education",
          "segment": "heading",
          "entity_refs": [],
          "states": []
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
          "kind": "text",
          "text": "World Development Indicators",
          "segment": "byline",
          "entity_refs": [],
          "states": []
        },
        {
          "kind": "text",
          "text": " · ",
          "segment": "byline",
          "entity_refs": [],
          "states": []
        },
        {
          "kind": "text",
          "text": "1982 to 2025",
          "segment": "byline",
          "entity_refs": [],
          "states": []
        },
        {
          "kind": "text",
          "text": ".",
          "segment": "byline",
          "entity_refs": [],
          "states": []
        }
      ],
      "restatement": {
        "variable_text": "government education spending",
        "entities": [
          {
            "text": "Kenya"
          }
        ],
        "operations": []
      },
      "operations": [],
      "departures": [],
      "status": "candidates",
      "candidates": {
        "ordering": "broadest_first",
        "max_candidates": 6,
        "specs": [
          {
            "spec_id": "spec_8a3387c84b81fb367ff67292a6274924",
            "definition": {
              "schema_version": 1,
              "spec_id": "spec_8a3387c84b81fb367ff67292a6274924",
              "identity": {
                "identity_version": "spec1",
                "shape": {
                  "kind": "statvar_schema",
                  "population_type": "EconomicActivity",
                  "measured_property": "amount",
                  "stat_type": "measuredValue",
                  "measurement_denominator": {
                    "ref": "Amount_EconomicActivity_GrossDomesticProduction_Nominal"
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
                      "ref": "EducationExpenditure"
                    }
                  },
                  {
                    "property": "expensor",
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
            },
            "resolved": {
              "shape": {
                "shape_id": "economicactivity_amount_measuredvalue_per_amount_economicactivity_grossdomesticproduction_nominal",
                "label": "Percent of nominal GDP spent on education",
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
                  "dcid": "Amount_EconomicActivity_GrossDomesticProduction_Nominal",
                  "label": "Nominal gross domestic product"
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
                    "axis": "how",
                    "property": {
                      "dcid": "expensor",
                      "label": "expensor"
                    },
                    "label": "expensor"
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
                        "dcid": "EducationExpenditure",
                        "label": "EducationExpenditure"
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
                      "dcid": "expensor",
                      "label": "expensor"
                    },
                    "label": "expensor"
                  },
                  "binding": {
                    "kind": "value",
                    "value": {
                      "ref": {
                        "dcid": "Government",
                        "label": "Government"
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
                    "ref": "Amount_EconomicActivity_ExpenditureActivity_EducationExpenditure_Government_AsFractionOf_Amount_EconomicActivity_GrossDomesticProduction_Nominal",
                    "label": "Percent of nominal GDP spent on education",
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
                            "dcid": "EducationExpenditure",
                            "label": "EducationExpenditure"
                          },
                          "value_kind": "enum_value"
                        }
                      }
                    ],
                    "constraint_properties": [
                      "activitySource",
                      "expenditureType",
                      "expensor"
                    ],
                    "data_date_range": {
                      "start": "1971",
                      "end": "2024"
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
                "observation_count": 43,
                "evidence": "facet_metadata",
                "dimensions": [
                  {
                    "label": "sources",
                    "count": 1
                  },
                  {
                    "label": "observations",
                    "count": 43
                  },
                  {
                    "label": "variables",
                    "count": 1
                  }
                ]
              },
              "download": {
                "rows": 43,
                "rows_exact": true,
                "series": 1,
                "window": {
                  "start_year": 1971,
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
                  "ref": "Percent",
                  "label": "Percent"
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
                      "dcid": "expenditureType",
                      "label": "expenditureType"
                    },
                    "label": "expenditure type"
                  },
                  "options": [
                    {
                      "value": {
                        "ref": {
                          "dcid": "EducationExpenditure",
                          "label": "EducationExpenditure"
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
                      "dcid": "expensor",
                      "label": "expensor"
                    },
                    "label": "expensor"
                  },
                  "options": [
                    {
                      "value": {
                        "ref": {
                          "dcid": "Government",
                          "label": "Government"
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
              "rendered_sentence": "Kenya's percent of nominal GDP spent on education, 1971 to 2024. World Development Indicators.",
              "trace": {
                "resolved_stat_vars": [
                  {
                    "dcid": "Amount_EconomicActivity_ExpenditureActivity_EducationExpenditure_Government_AsFractionOf_Amount_EconomicActivity_GrossDomesticProduction_Nominal",
                    "label": "Percent of nominal GDP spent on education"
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
                "n_recalled": 69,
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
              "measure_axis_values": []
            }
          },
          {
            "spec_id": "spec_c49e250c68de88b0828381c5529d33fc",
            "definition": {
              "schema_version": 1,
              "spec_id": "spec_c49e250c68de88b0828381c5529d33fc",
              "identity": {
                "identity_version": "spec1",
                "shape": {
                  "kind": "statvar_schema",
                  "population_type": "EconomicActivity",
                  "measured_property": "amount",
                  "stat_type": "measuredValue",
                  "measurement_denominator": {
                    "ref": "Amount_EconomicActivity_ExpenditureActivity_Government"
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
                      "ref": "EducationExpenditure"
                    }
                  },
                  {
                    "property": "expensor",
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
            },
            "resolved": {
              "shape": {
                "shape_id": "economicactivity_amount_measuredvalue_per_amount_economicactivity_expenditureactivity_government",
                "label": "Percent of total government expenditure on education",
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
                  "dcid": "Amount_EconomicActivity_ExpenditureActivity_Government",
                  "label": "Amount Of Economic Activity: Expenditure Activity, Government"
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
                    "axis": "how",
                    "property": {
                      "dcid": "expensor",
                      "label": "expensor"
                    },
                    "label": "expensor"
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
                        "dcid": "EducationExpenditure",
                        "label": "EducationExpenditure"
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
                      "dcid": "expensor",
                      "label": "expensor"
                    },
                    "label": "expensor"
                  },
                  "binding": {
                    "kind": "value",
                    "value": {
                      "ref": {
                        "dcid": "Government",
                        "label": "Government"
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
                    "ref": "Amount_EconomicActivity_ExpenditureActivity_EducationExpenditure_Government_AsFractionOf_Amount_EconomicActivity_ExpenditureActivity_Government",
                    "label": "Percent of total government expenditure on education",
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
                            "dcid": "EducationExpenditure",
                            "label": "EducationExpenditure"
                          },
                          "value_kind": "enum_value"
                        }
                      }
                    ],
                    "constraint_properties": [
                      "activitySource",
                      "expenditureType",
                      "expensor"
                    ],
                    "data_date_range": {
                      "start": "1982",
                      "end": "2025"
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
                "observation_count": 35,
                "evidence": "facet_metadata",
                "dimensions": [
                  {
                    "label": "sources",
                    "count": 1
                  },
                  {
                    "label": "observations",
                    "count": 35
                  },
                  {
                    "label": "variables",
                    "count": 1
                  }
                ]
              },
              "download": {
                "rows": 35,
                "rows_exact": true,
                "series": 1,
                "window": {
                  "start_year": 1982,
                  "end_year": 2025
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
                  "ref": "Percent",
                  "label": "Percent"
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
                      "dcid": "expenditureType",
                      "label": "expenditureType"
                    },
                    "label": "expenditure type"
                  },
                  "options": [
                    {
                      "value": {
                        "ref": {
                          "dcid": "EducationExpenditure",
                          "label": "EducationExpenditure"
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
                      "dcid": "expensor",
                      "label": "expensor"
                    },
                    "label": "expensor"
                  },
                  "options": [
                    {
                      "value": {
                        "ref": {
                          "dcid": "Government",
                          "label": "Government"
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
              "rendered_sentence": "Kenya's percent of total government expenditure on education, 1982 to 2025. World Development Indicators.",
              "trace": {
                "resolved_stat_vars": [
                  {
                    "dcid": "Amount_EconomicActivity_ExpenditureActivity_EducationExpenditure_Government_AsFractionOf_Amount_EconomicActivity_ExpenditureActivity_Government",
                    "label": "Percent of total government expenditure on education"
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
                "n_recalled": 69,
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
              "measure_axis_values": []
            }
          }
        ],
        "truncated": false
      }
    }
  ],
  "rendered_sentence": "2 readings. Kenya's percent of nominal GDP spent on education. World Development Indicators · 1971 to 2024. Kenya's percent of total government expenditure on education. World Development Indicators · 1982 to 2025.",
  "sentence_plan": [
    {
      "kind": "text",
      "text": "2 readings.",
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
      "kind": "text",
      "text": "Kenya",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
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
      "kind": "text",
      "text": "percent of nominal GDP spent on education",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
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
      "kind": "text",
      "text": "World Development Indicators",
      "segment": "byline",
      "entity_refs": [],
      "states": [],
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
      "kind": "text",
      "text": "1971 to 2024",
      "segment": "byline",
      "entity_refs": [],
      "states": [],
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
      "states": [],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": "Kenya",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
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
      "kind": "text",
      "text": "percent of total government expenditure on education",
      "segment": "heading",
      "entity_refs": [],
      "states": [],
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
      "kind": "text",
      "text": "World Development Indicators",
      "segment": "byline",
      "entity_refs": [],
      "states": [],
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
      "kind": "text",
      "text": "1982 to 2025",
      "segment": "byline",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": ".",
      "segment": "byline",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    }
  ],
  "status": "candidates"
};
