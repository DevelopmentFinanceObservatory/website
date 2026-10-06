/**
 * Real `/api/search/resolve` response from dfo-apis branch
 * feat/answer-edit-routes (commit b14dbb031), captured 2026-10-04 from a
 * local server with option coverage and observations on: query "Gross value
 * added in India".
 *
 * A single-part `definite` answer whose StatVar carries seven observed
 * measurement methods. The measurement-method axis is unbound: the engine
 * chose `CurrentPrice_WithBaseYear2011_12`, which shows on the series'
 * `facet.measurementMethod` and on `resolved.facets.measurementMethod`
 * (`basis: "fallback"`), and `facet_options` lists all seven methods.
 *
 * Trimmed for size; each body still validates against the API's models
 * (scripts/check-search-fixtures.mts). `slot_values` and
 * `open_axis_facts[].values` keep two, the specs' own `sentence_plan` is
 * dropped (the envelope's stays), `trace.slot_filters` is empty, and
 * timings keep their totals. The server omits a `unit_conversion` currency's
 * `current_years` when it is null, which its own model requires; this
 * file writes the null.
 * Each series keeps its latest 3 points (its `total_obs` still counts the
 * full series).
 * Option and alternative-measure counts (`served_rows`, `served_rows_exact`)
 * were read with the same requests.
 *
 * The capture's StatVar lists are folded into the current wire: each
 * `stat_vars` carries counts and a date range (`served_count` is the listed members'
 * count, or `member_count` where the list was cut and exact, and
 * `data_date_range` spans the listed members), each related measure its
 * StatVar as `stat_var`, and `trace.resolved_stat_vars` is gone.
 */

export const methodUnbound: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "raw_text",
    "raw_query": "Gross value added in India",
    "normalized_query": "Gross value added in India",
    "extract_skipped": false
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "2637cd5077bb407da6f2dada3a1ec2c4",
    "warnings": [],
    "timing_ms": {
      "total": 1821
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
      "variable_text": "gross value added",
      "warnings": [
        {
          "code": "query_qualifier_dropped",
          "severity": "degraded",
          "message": "The requested qualifier \"gross\" was not applied."
        }
      ],
      "timing_ms": {
        "total": 836
      },
      "restatement": {
        "variable_text": "gross value added",
        "entities": [
          {
            "text": "India"
          }
        ],
        "operations": []
      },
      "operations": [],
      "departures": [],
      "status": "definite",
      "spec": {
        "spec_id": "spec_12f795d2c4c699986fd6722ae9891b1d",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_12f795d2c4c699986fd6722ae9891b1d",
          "identity": {
            "identity_version": "spec1",
            "shape": {
              "kind": "statvar_schema",
              "population_type": "EconomicActivity",
              "measured_property": "amount",
              "stat_type": "measuredValue",
              "measurement_qualifier": "RealValue"
            },
            "slots": [
              {
                "property": "activitySource",
                "binding": {
                  "state": "value",
                  "ref": "GrossValueAdded"
                }
              },
              {
                "property": "isic",
                "binding": {
                  "state": "unbound"
                }
              },
              {
                "property": "naics",
                "binding": {
                  "state": "unbound"
                }
              }
            ],
            "entities": {
              "observationAbout": [
                "country/IND"
              ]
            },
            "requested_window": {
              "kind": "all"
            }
          }
        },
        "resolved": {
          "shape": {
            "shape_id": "economicactivity_amount_measuredvalue_realvalue",
            "label": "Amount Of Economic Activity (Real Value): Gross Value Added",
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
              "dcid": "RealValue",
              "label": "RealValue"
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
                  "dcid": "isic",
                  "label": "isic"
                },
                "label": "isic"
              },
              {
                "axis": "how",
                "property": {
                  "dcid": "naics",
                  "label": "naics"
                },
                "label": "naics"
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
            "member_count": 8,
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
                    "dcid": "GrossValueAdded",
                    "label": "GrossValueAdded"
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
                  "dcid": "isic",
                  "label": "isic"
                },
                "label": "isic"
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
                  "dcid": "naics",
                  "label": "naics"
                },
                "label": "naics"
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
                    "dcid": "country/IND",
                    "label": "India"
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
            "isic",
            "naics"
          ],
          "unresolved_slots": [],
          "stat_vars": {
            "member_count": 1,
            "member_count_exact": false,
            "served_count": 1,
            "data_date_range": {
              "start": "2012-03",
              "end": "2025-03"
            }
          },
          "entities": [
            {
              "ref": "country/IND",
              "label": "India",
              "entity_type": "Country",
              "role": "observationAbout"
            }
          ],
          "coverage": {
            "kind": "exact",
            "has_data": true,
            "observation_count": 14,
            "evidence": "observed",
            "dimensions": [
              {
                "label": "sources",
                "count": 1
              },
              {
                "label": "observations",
                "count": 14
              },
              {
                "label": "variables",
                "count": 1
              }
            ]
          },
          "download": {
            "rows": 14,
            "rows_exact": true,
            "series": 1,
            "window": {
              "start_year": 2012,
              "end_year": 2025
            }
          },
          "facets": {
            "provenance": {
              "basis": "fallback",
              "ref": "dc/base/India_RBIStateDomesticProduct_AggCountry",
              "label": "Database on Indian Economy",
              "source": {
                "ref": "dc/s/ReserveBankOfIndia",
                "label": "Reserve Bank of India"
              },
              "data_commons": {
                "id": "base",
                "label": "Data Commons by Google"
              }
            },
            "measurementMethod": {
              "basis": "fallback",
              "ref": "CurrentPrice_WithBaseYear2011_12",
              "label": "Current Price With Base Year as 2011 - 12"
            },
            "unit": {
              "basis": "fallback",
              "ref": "INR",
              "label": "INR",
              "currency": "INR"
            }
          },
          "observations": {
            "series": [
              {
                "stat_var": {
                  "ref": "Amount_EconomicActivity_GrossValueAdded_RealValue",
                  "label": "gross value added"
                },
                "entities": [
                  {
                    "role": "observationAbout",
                    "ref": "country/IND",
                    "label": "India"
                  }
                ],
                "points": [
                  {
                    "date": "2023-03",
                    "value": 240280036500000.0
                  },
                  {
                    "date": "2024-03",
                    "value": 245681231300000.0
                  },
                  {
                    "date": "2025-03",
                    "value": 272210892100000.0
                  }
                ],
                "total_obs": 14,
                "source_refs": [
                  {
                    "dcid": "dc/base/India_RBIStateDomesticProduct_AggCountry",
                    "label": "Database on Indian Economy",
                    "source": {
                      "ref": "dc/s/ReserveBankOfIndia",
                      "label": "Reserve Bank of India"
                    },
                    "data_commons": {
                      "id": "base",
                      "label": "Data Commons by Google"
                    }
                  }
                ],
                "facet": {
                  "provenance": {
                    "ref": "dc/base/India_RBIStateDomesticProduct_AggCountry",
                    "label": "Database on Indian Economy",
                    "source": {
                      "ref": "dc/s/ReserveBankOfIndia",
                      "label": "Reserve Bank of India"
                    },
                    "data_commons": {
                      "id": "base",
                      "label": "Data Commons by Google"
                    }
                  },
                  "measurementMethod": {
                    "ref": "CurrentPrice_WithBaseYear2011_12",
                    "label": "Current Price With Base Year as 2011 - 12"
                  },
                  "unit": {
                    "ref": "INR",
                    "label": "INR"
                  }
                }
              }
            ],
            "total_obs": 14,
            "truncated": false
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
                      "dcid": "GrossValueAdded",
                      "label": "GrossValueAdded"
                    },
                    "value_kind": "enum_value"
                  },
                  "coverage": {
                    "kind": "exact",
                    "has_data": true,
                    "observation_count": 14,
                    "evidence": "facet_metadata",
                    "dimensions": [
                      {
                        "label": "sources",
                        "count": 1
                      },
                      {
                        "label": "observations",
                        "count": 14
                      },
                      {
                        "label": "variables",
                        "count": 1
                      }
                    ]
                  },
                  "served_rows": 14,
                  "served_rows_exact": true
                }
              ],
              "truncated": true,
              "source": "observed"
            }
          ],
          "entity_options": [],
          "facet_options": [
            {
              "axis": "provenance",
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "dc/base/India_NationalAccountsStatistics",
                      "label": "India National Accounts Statistics"
                    },
                    "value_kind": "source"
                  }
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "dc/base/India_RBIStateDomesticProduct_AggCountry",
                      "label": "Database on Indian Economy"
                    },
                    "value_kind": "source"
                  }
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "dc/base/India_RBIStateDomesticProduct_StatVarAgg_AggCountry",
                      "label": "Database on Indian Economy"
                    },
                    "value_kind": "source"
                  }
                }
              ],
              "truncated": false,
              "source": "observed"
            },
            {
              "axis": "measurementMethod",
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "CurrentPrice_WithBaseYear2011_12",
                      "label": "Current Price With Base Year as 2011 - 12"
                    },
                    "value_kind": "enum_value"
                  }
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "MOSPIFirstAdvanceEstimates",
                      "label": "MOSPI First Advance Estimates"
                    },
                    "value_kind": "enum_value"
                  }
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "MOSPIProvisionalEstimates",
                      "label": "MOSPI Provisional Estimates"
                    },
                    "value_kind": "enum_value"
                  }
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "MOSPISecondRevisedEstimates",
                      "label": "MOSPI Second Revised Estimates"
                    },
                    "value_kind": "enum_value"
                  }
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "MOSPISecondAdvanceEstimates",
                      "label": "MOSPI Second Advance Estimates"
                    },
                    "value_kind": "enum_value"
                  }
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "MOSPIThirdRevisedEstimates",
                      "label": "MOSPI Third Revised Estimates"
                    },
                    "value_kind": "enum_value"
                  }
                },
                {
                  "value": {
                    "ref": {
                      "dcid": "CurrentPrice_WithBaseYear2004_05",
                      "label": "Current Price With Base Year as 2004 - 05"
                    },
                    "value_kind": "enum_value"
                  }
                }
              ],
              "truncated": false,
              "source": "observed"
            },
            {
              "axis": "unit",
              "options": [
                {
                  "value": {
                    "ref": {
                      "dcid": "INR",
                      "label": "INR"
                    },
                    "value_kind": "enum_value"
                  }
                }
              ],
              "truncated": false,
              "source": "observed"
            }
          ],
          "rendered_sentence": "India's amount of economic activity (real value): gross value added, March 2012 to March 2025. Constant Indian rupees · Database on Indian Economy.",
          "trace": {
            "resolved_entities": [
              {
                "dcid": "country/IND",
                "label": "India"
              }
            ],
            "resolved_sources": [
              {
                "dcid": "dc/base/India_RBIStateDomesticProduct_AggCountry",
                "label": "Database on Indian Economy",
                "source": {
                  "ref": "dc/s/ReserveBankOfIndia",
                  "label": "Reserve Bank of India"
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
              "removed_stat_vars": [
                "Amount_EconomicActivity_GrossDomesticProduction_NAICSConstruction_RealValue",
                "Amount_EconomicActivity_GrossDomesticProduction_NAICSManagementOfCompaniesEnterprises_RealValue",
                "Amount_EconomicActivity_GrossDomesticProduction_NAICSWholesaleTrade_RealValue",
                "Amount_EconomicActivity_GrossDomesticProduction_RealValue",
                "InflationAdjustedGDP"
              ]
            }
          },
          "confidence": "high",
          "available_at_place": true,
          "measure_label_axes": [],
          "measure_axis_values": [],
          "related_group": {
            "dcid": "dc/g/EconomicActivity_ActivitySource-GrossValueAdded",
            "label": "Economic Activity With Activity Source = Gross Value Added"
          },
          "related_measures": [
            {
              "stat_var": {
                "dcid": "Nominal_Amount_EconomicActivity_GrossValueAdded",
                "label": "Gross value added at constant prices"
              },
              "definition": {
                "schema_version": 1,
                "spec_id": "spec_74f7b55e575e5aafce54f02c58867098",
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
                        "ref": "GrossValueAdded"
                      }
                    }
                  ],
                  "entities": {
                    "observationAbout": [
                      "country/IND"
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
  "rendered_sentence": "India's amount of economic activity (real value): gross value added, March 2012 to March 2025. Constant Indian rupees · Database on Indian Economy.",
  "sentence_plan": [
    {
      "kind": "slot",
      "text": "India",
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
      "text": "amount of economic activity (real value): gross value added",
      "axis": "what",
      "segment": "heading",
      "entity_refs": [],
      "states": [
        "how:activitySource"
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
      "property_dcid": "isic",
      "binding_ref": "how:isic",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "slot",
      "text": "",
      "axis": "how",
      "segment": "heading",
      "property_dcid": "naics",
      "binding_ref": "how:naics",
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
      "text": "March 2012 to March 2025",
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
      "text": "Constant Indian rupees",
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
      "text": "Database on Indian Economy",
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
