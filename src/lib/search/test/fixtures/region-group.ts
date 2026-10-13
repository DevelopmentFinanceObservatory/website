/**
 * Real `/api/search/resolve` response from a local dfo-apis server to a
 * parsed request for "health expenditure per capita" with the entity text
 * "Africa" (World Development Indicators).
 *
 * A single-part `definite` answer whose region binds as an entity group:
 * `resolved.entity_groups.observationAbout` carries the region's dcid
 * (`africa`), its graph label and `entity_type` (`Continent`), and
 * `resolved.entities` and `definition.identity.entities` list its 59
 * member countries and territories. The part's `departures` word the
 * binding (`group_read_as_members`, `entity_unavailable`), and the
 * envelope's sentence reads "in the 59 countries and territories in Africa".
 *
 * Trimmed for size; the body still validates against the API's models
 * (scripts/check-search-fixtures.mts). The spec's own `sentence_plan` is
 * dropped (the envelope's stays) and `trace.slot_filters` is empty.
 */

export const regionGroup: unknown = {
  "schema_version": 1,
  "query_echo": {
    "entry_path": "parsed",
    "extract_skipped": true
  },
  "diagnostics": {
    "engine_build": "unknown",
    "trace_id": "878d692d984247d3b0238a4d7d58e824",
    "warnings": [],
    "timing_ms": {
      "total": 8136
    },
    "llm_usage": {
      "input_tokens": 3984,
      "output_tokens": 166,
      "cached_tokens": 0
    },
    "timed_out": false
  },
  "kind": "resolution",
  "parts": [
    {
      "variable_text": "health expenditure per capita",
      "warnings": [
        {
          "code": "time_window_defaulted",
          "severity": "warn",
          "message": "no time_text was given; the answer was resolved across every period with data."
        }
      ],
      "timing_ms": {
        "total": 6443,
        "by_step": {
          "recall": 666,
          "shape": 3359,
          "bind": 1003,
          "materialise": 261,
          "answer": 634,
          "options": 520
        }
      },
      "restatement": {
        "variable_text": "health expenditure per capita",
        "entities": [
          {
            "text": "Africa"
          }
        ],
        "operations": []
      },
      "operations": [],
      "departures": [
        {
          "code": "entity_unavailable",
          "binding_ref": "where:",
          "asked": "Africa",
          "text": "The data holds no values for 5 of the 59 countries and territories in Africa."
        },
        {
          "code": "group_read_as_members",
          "binding_ref": "where:",
          "asked": "Africa",
          "text": "You asked for Africa. This shows the countries and territories in it, each on its own."
        }
      ],
      "status": "definite",
      "spec": {
        "spec_id": "spec_2d6c84b87a7ea40105fa3380aff345bc",
        "definition": {
          "schema_version": 1,
          "spec_id": "spec_2d6c84b87a7ea40105fa3380aff345bc",
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
                "country/AGO",
                "country/ATF",
                "country/BDI",
                "country/BEN",
                "country/BFA",
                "country/BWA",
                "country/CAF",
                "country/CIV",
                "country/CMR",
                "country/COD",
                "country/COG",
                "country/COM",
                "country/CPV",
                "country/DJI",
                "country/DZA",
                "country/EGY",
                "country/ERI",
                "country/ESH",
                "country/ETH",
                "country/GAB",
                "country/GHA",
                "country/GIN",
                "country/GMB",
                "country/GNB",
                "country/GNQ",
                "country/KEN",
                "country/LBR",
                "country/LBY",
                "country/LSO",
                "country/MAR",
                "country/MDG",
                "country/MLI",
                "country/MOZ",
                "country/MRT",
                "country/MUS",
                "country/MWI",
                "country/MYT",
                "country/NAM",
                "country/NER",
                "country/NGA",
                "country/REU",
                "country/RWA",
                "country/SDN",
                "country/SEN",
                "country/SHN",
                "country/SLE",
                "country/SOM",
                "country/SSD",
                "country/STP",
                "country/SWZ",
                "country/SYC",
                "country/TCD",
                "country/TGO",
                "country/TUN",
                "country/TZA",
                "country/UGA",
                "country/ZAF",
                "country/ZMB",
                "country/ZWE"
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
            "member_digest": "81a72f68b71e73bfd3585c3aed2ebdc1080288837cbec2dd63e1044a2a0767c4",
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
                "kind": "set",
                "values": [
                  {
                    "ref": {
                      "ref": "country/AGO",
                      "label": "Angola"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/ATF",
                      "label": "French Southern Territories"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/BDI",
                      "label": "Burundi"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/BEN",
                      "label": "Benin"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/BFA",
                      "label": "Burkina Faso"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/BWA",
                      "label": "Botswana"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/CAF",
                      "label": "Central African Republic"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/CIV",
                      "label": "Ivory Coast"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/CMR",
                      "label": "Cameroon"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/COD",
                      "label": "Democratic Republic of the Congo"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/COG",
                      "label": "Republic of the Congo"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/COM",
                      "label": "Comoros"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/CPV",
                      "label": "Cape Verde"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/DJI",
                      "label": "Djibouti"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/DZA",
                      "label": "Algeria"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/EGY",
                      "label": "Egypt"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/ERI",
                      "label": "Eritrea"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/ESH",
                      "label": "Western Sahara"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/ETH",
                      "label": "Ethiopia"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/GAB",
                      "label": "Gabon"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/GHA",
                      "label": "Ghana"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/GIN",
                      "label": "Guinea"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/GMB",
                      "label": "The Gambia"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/GNB",
                      "label": "Guinea-Bissau"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/GNQ",
                      "label": "Equatorial Guinea"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/KEN",
                      "label": "Kenya"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/LBR",
                      "label": "Liberia"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/LBY",
                      "label": "Libya"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/LSO",
                      "label": "Lesotho"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/MAR",
                      "label": "Morocco"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/MDG",
                      "label": "Madagascar"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/MLI",
                      "label": "Mali"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/MOZ",
                      "label": "Mozambique"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/MRT",
                      "label": "Mauritania"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/MUS",
                      "label": "Mauritius"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/MWI",
                      "label": "Malawi"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/MYT",
                      "label": "Mayotte"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/NAM",
                      "label": "Namibia"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/NER",
                      "label": "Niger"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/NGA",
                      "label": "Nigeria"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/REU",
                      "label": "Réunion"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/RWA",
                      "label": "Rwanda"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/SDN",
                      "label": "Sudan"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/SEN",
                      "label": "Senegal"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/SHN",
                      "label": "Saint Helena, Ascension and Tristan da Cunha"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/SLE",
                      "label": "Sierra Leone"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/SOM",
                      "label": "Somalia"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/SSD",
                      "label": "South Sudan"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/STP",
                      "label": "São Tomé and Príncipe"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/SWZ",
                      "label": "Swaziland"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/SYC",
                      "label": "Seychelles"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/TCD",
                      "label": "Chad"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/TGO",
                      "label": "Togo"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/TUN",
                      "label": "Tunisia"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/TZA",
                      "label": "Tanzania"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/UGA",
                      "label": "Uganda"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/ZAF",
                      "label": "South Africa"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/ZMB",
                      "label": "Zambia"
                    },
                    "value_kind": "entity"
                  },
                  {
                    "ref": {
                      "ref": "country/ZWE",
                      "label": "Zimbabwe"
                    },
                    "value_kind": "entity"
                  }
                ]
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
              "ref": "country/AGO",
              "label": "Angola",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/ATF",
              "label": "French Southern Territories",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/BDI",
              "label": "Burundi",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/BEN",
              "label": "Benin",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/BFA",
              "label": "Burkina Faso",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/BWA",
              "label": "Botswana",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/CAF",
              "label": "Central African Republic",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/CIV",
              "label": "Ivory Coast",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/CMR",
              "label": "Cameroon",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/COD",
              "label": "Democratic Republic of the Congo",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/COG",
              "label": "Republic of the Congo",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/COM",
              "label": "Comoros",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/CPV",
              "label": "Cape Verde",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/DJI",
              "label": "Djibouti",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/DZA",
              "label": "Algeria",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/EGY",
              "label": "Egypt",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/ERI",
              "label": "Eritrea",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/ESH",
              "label": "Western Sahara",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/ETH",
              "label": "Ethiopia",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/GAB",
              "label": "Gabon",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/GHA",
              "label": "Ghana",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/GIN",
              "label": "Guinea",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/GMB",
              "label": "The Gambia",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/GNB",
              "label": "Guinea-Bissau",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/GNQ",
              "label": "Equatorial Guinea",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/KEN",
              "label": "Kenya",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/LBR",
              "label": "Liberia",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/LBY",
              "label": "Libya",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/LSO",
              "label": "Lesotho",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/MAR",
              "label": "Morocco",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/MDG",
              "label": "Madagascar",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/MLI",
              "label": "Mali",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/MOZ",
              "label": "Mozambique",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/MRT",
              "label": "Mauritania",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/MUS",
              "label": "Mauritius",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/MWI",
              "label": "Malawi",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/MYT",
              "label": "Mayotte",
              "entity_type": "AdministrativeArea1",
              "role": "observationAbout"
            },
            {
              "ref": "country/NAM",
              "label": "Namibia",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/NER",
              "label": "Niger",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/NGA",
              "label": "Nigeria",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/REU",
              "label": "Réunion",
              "entity_type": "AdministrativeArea1",
              "role": "observationAbout"
            },
            {
              "ref": "country/RWA",
              "label": "Rwanda",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/SDN",
              "label": "Sudan",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/SEN",
              "label": "Senegal",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/SHN",
              "label": "Saint Helena, Ascension and Tristan da Cunha",
              "entity_type": "AdministrativeArea1",
              "role": "observationAbout"
            },
            {
              "ref": "country/SLE",
              "label": "Sierra Leone",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/SOM",
              "label": "Somalia",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/SSD",
              "label": "South Sudan",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/STP",
              "label": "São Tomé and Príncipe",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/SWZ",
              "label": "Swaziland",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/SYC",
              "label": "Seychelles",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/TCD",
              "label": "Chad",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/TGO",
              "label": "Togo",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/TUN",
              "label": "Tunisia",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/TZA",
              "label": "Tanzania",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/UGA",
              "label": "Uganda",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/ZAF",
              "label": "South Africa",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/ZMB",
              "label": "Zambia",
              "entity_type": "Country",
              "role": "observationAbout"
            },
            {
              "ref": "country/ZWE",
              "label": "Zimbabwe",
              "entity_type": "Country",
              "role": "observationAbout"
            }
          ],
          "entity_groups": {
            "observationAbout": {
              "ref": "africa",
              "label": "Africa",
              "entity_type": "Continent"
            }
          },
          "coverage": {
            "kind": "exact",
            "has_data": true,
            "observation_count": 1256,
            "evidence": "facet_metadata",
            "dimensions": [
              {
                "label": "countries",
                "count": 54
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
            "rows": 1256,
            "rows_exact": true,
            "series": 54,
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
          "facet_options": [
            {
              "axis": "provenance",
              "options": [
                {
                  "value": {
                    "ref": {
                      "ref": "dc/base/WorldDevelopmentIndicators",
                      "label": "World Development Indicators"
                    },
                    "value_kind": "source"
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
                      "ref": "InternationalDollar",
                      "label": "InternationalDollar"
                    },
                    "value_kind": "enum_value"
                  }
                },
                {
                  "value": {
                    "ref": {
                      "ref": "USDollar",
                      "label": "USDollar"
                    },
                    "value_kind": "enum_value"
                  }
                }
              ],
              "truncated": false,
              "source": "observed"
            }
          ],
          "rendered_sentence": "Health expenditure per capita in international dollars in the 59 countries and territories in Africa, 2000 to 2023. World Development Indicators.",
          "trace": {
            "resolved_entities": [
              {
                "ref": "country/AGO",
                "label": "Angola"
              },
              {
                "ref": "country/ATF",
                "label": "French Southern Territories"
              },
              {
                "ref": "country/BDI",
                "label": "Burundi"
              },
              {
                "ref": "country/BEN",
                "label": "Benin"
              },
              {
                "ref": "country/BFA",
                "label": "Burkina Faso"
              },
              {
                "ref": "country/BWA",
                "label": "Botswana"
              },
              {
                "ref": "country/CAF",
                "label": "Central African Republic"
              },
              {
                "ref": "country/CIV",
                "label": "Ivory Coast"
              },
              {
                "ref": "country/CMR",
                "label": "Cameroon"
              },
              {
                "ref": "country/COD",
                "label": "Democratic Republic of the Congo"
              },
              {
                "ref": "country/COG",
                "label": "Republic of the Congo"
              },
              {
                "ref": "country/COM",
                "label": "Comoros"
              },
              {
                "ref": "country/CPV",
                "label": "Cape Verde"
              },
              {
                "ref": "country/DJI",
                "label": "Djibouti"
              },
              {
                "ref": "country/DZA",
                "label": "Algeria"
              },
              {
                "ref": "country/EGY",
                "label": "Egypt"
              },
              {
                "ref": "country/ERI",
                "label": "Eritrea"
              },
              {
                "ref": "country/ESH",
                "label": "Western Sahara"
              },
              {
                "ref": "country/ETH",
                "label": "Ethiopia"
              },
              {
                "ref": "country/GAB",
                "label": "Gabon"
              },
              {
                "ref": "country/GHA",
                "label": "Ghana"
              },
              {
                "ref": "country/GIN",
                "label": "Guinea"
              },
              {
                "ref": "country/GMB",
                "label": "The Gambia"
              },
              {
                "ref": "country/GNB",
                "label": "Guinea-Bissau"
              },
              {
                "ref": "country/GNQ",
                "label": "Equatorial Guinea"
              },
              {
                "ref": "country/KEN",
                "label": "Kenya"
              },
              {
                "ref": "country/LBR",
                "label": "Liberia"
              },
              {
                "ref": "country/LBY",
                "label": "Libya"
              },
              {
                "ref": "country/LSO",
                "label": "Lesotho"
              },
              {
                "ref": "country/MAR",
                "label": "Morocco"
              },
              {
                "ref": "country/MDG",
                "label": "Madagascar"
              },
              {
                "ref": "country/MLI",
                "label": "Mali"
              },
              {
                "ref": "country/MOZ",
                "label": "Mozambique"
              },
              {
                "ref": "country/MRT",
                "label": "Mauritania"
              },
              {
                "ref": "country/MUS",
                "label": "Mauritius"
              },
              {
                "ref": "country/MWI",
                "label": "Malawi"
              },
              {
                "ref": "country/MYT",
                "label": "Mayotte"
              },
              {
                "ref": "country/NAM",
                "label": "Namibia"
              },
              {
                "ref": "country/NER",
                "label": "Niger"
              },
              {
                "ref": "country/NGA",
                "label": "Nigeria"
              },
              {
                "ref": "country/REU",
                "label": "Réunion"
              },
              {
                "ref": "country/RWA",
                "label": "Rwanda"
              },
              {
                "ref": "country/SDN",
                "label": "Sudan"
              },
              {
                "ref": "country/SEN",
                "label": "Senegal"
              },
              {
                "ref": "country/SHN",
                "label": "Saint Helena, Ascension and Tristan da Cunha"
              },
              {
                "ref": "country/SLE",
                "label": "Sierra Leone"
              },
              {
                "ref": "country/SOM",
                "label": "Somalia"
              },
              {
                "ref": "country/SSD",
                "label": "South Sudan"
              },
              {
                "ref": "country/STP",
                "label": "São Tomé and Príncipe"
              },
              {
                "ref": "country/SWZ",
                "label": "Swaziland"
              },
              {
                "ref": "country/SYC",
                "label": "Seychelles"
              },
              {
                "ref": "country/TCD",
                "label": "Chad"
              },
              {
                "ref": "country/TGO",
                "label": "Togo"
              },
              {
                "ref": "country/TUN",
                "label": "Tunisia"
              },
              {
                "ref": "country/TZA",
                "label": "Tanzania"
              },
              {
                "ref": "country/UGA",
                "label": "Uganda"
              },
              {
                "ref": "country/ZAF",
                "label": "South Africa"
              },
              {
                "ref": "country/ZMB",
                "label": "Zambia"
              },
              {
                "ref": "country/ZWE",
                "label": "Zimbabwe"
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
            "capability_version": "cap_daf889452657d56d",
            "default_reading": {
              "applied": true,
              "removed_stat_vars": []
            }
          },
          "confidence": "high",
          "available_at_place": true,
          "measure_label_axes": [],
          "measure_axis_values": [],
          "related_measures": []
        }
      }
    }
  ],
  "rendered_sentence": "Health expenditure per capita in international dollars in the 59 countries and territories in Africa, 2000 to 2023. World Development Indicators. The data holds no values for 5 of the 59 countries and territories in Africa. You asked for Africa. This shows the countries and territories in it, each on its own.",
  "sentence_plan": [
    {
      "kind": "slot",
      "text": "Health expenditure",
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
      "text": " in ",
      "segment": "heading",
      "entity_refs": [],
      "states": []
    },
    {
      "kind": "slot",
      "text": "the 59 countries and territories in Africa",
      "axis": "where",
      "segment": "heading",
      "binding_ref": "where:",
      "entity_refs": [],
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
    },
    {
      "kind": "text",
      "text": " ",
      "segment": "departure",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": "The data holds no values for 5 of the 59 countries and territories in Africa.",
      "segment": "departure",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": " ",
      "segment": "departure",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    },
    {
      "kind": "text",
      "text": "You asked for Africa. This shows the countries and territories in it, each on its own.",
      "segment": "departure",
      "entity_refs": [],
      "states": [],
      "part_index": 0
    }
  ],
  "status": "definite"
};
