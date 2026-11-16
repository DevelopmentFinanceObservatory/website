# Coverage of the debt-thresholds data

Written by `fetch.py` on 2026-11-16. Core series are debt stock, debt service, GDP and revenue in the base year. The step fails when more than 6 countries lack one in the default year, 2025.

## Base year 2024

IDS December 2025 (archived bulk files), WEO October 2025, projected to 2030.

- Countries lacking a core series: 0
- Countries without a projection: 1 (PAK)
- Countries without a capacity: 0
- Creditor-group guard, 1%: 870 of 870 country-years pass
- No 2015-19 commitments from a source, so the 58-country average terms stand in: BTN private, DJI private, GNB private, BGD private, CAF private, COM private, NER private, BDI private, KHM private, TCD private, SWZ private, HTI private, KGZ private, LSO private, MWI private, MLI private, MRT private, NPL private, SLE private, SLB private, VUT private

| Country | ISO3 | Debt stock | Debt service | GDP | Revenue | Projection | Capacity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bhutan | BTN | yes | yes | yes | yes | yes | yes |
| Djibouti | DJI | yes | yes | yes | yes | yes | yes |
| Guinea-Bissau | GNB | yes | yes | yes | yes | yes | yes |
| Mozambique | MOZ | yes | yes | yes | yes | yes | yes |
| Zambia | ZMB | yes | yes | yes | yes | yes | yes |
| Republic of the Congo | COG | yes | yes | yes | yes | yes | yes |
| Lao PDR | LAO | yes | yes | yes | yes | yes | yes |
| Senegal | SEN | yes | yes | yes | yes | yes | yes |
| Bangladesh | BGD | yes | yes | yes | yes | yes | yes |
| Central African Republic | CAF | yes | yes | yes | yes | yes | yes |
| Comoros | COM | yes | yes | yes | yes | yes | yes |
| Egypt | EGY | yes | yes | yes | yes | yes | yes |
| Ethiopia | ETH | yes | yes | yes | yes | yes | yes |
| The Gambia | GMB | yes | yes | yes | yes | yes | yes |
| Guinea | GIN | yes | yes | yes | yes | yes | yes |
| Niger | NER | yes | yes | yes | yes | yes | yes |
| Pakistan | PAK | yes | yes | yes | yes | **no** | yes |
| Papua New Guinea | PNG | yes | yes | yes | yes | yes | yes |
| Tanzania | TZA | yes | yes | yes | yes | yes | yes |
| Tunisia | TUN | yes | yes | yes | yes | yes | yes |
| Angola | AGO | yes | yes | yes | yes | yes | yes |
| Benin | BEN | yes | yes | yes | yes | yes | yes |
| Cameroon | CMR | yes | yes | yes | yes | yes | yes |
| Côte d'Ivoire | CIV | yes | yes | yes | yes | yes | yes |
| Ghana | GHA | yes | yes | yes | yes | yes | yes |
| Jordan | JOR | yes | yes | yes | yes | yes | yes |
| Kenya | KEN | yes | yes | yes | yes | yes | yes |
| Nigeria | NGA | yes | yes | yes | yes | yes | yes |
| Burkina Faso | BFA | yes | yes | yes | yes | yes | yes |
| Burundi | BDI | yes | yes | yes | yes | yes | yes |
| Cambodia | KHM | yes | yes | yes | yes | yes | yes |
| Chad | TCD | yes | yes | yes | yes | yes | yes |
| Democratic Republic of the Congo | COD | yes | yes | yes | yes | yes | yes |
| Eswatini | SWZ | yes | yes | yes | yes | yes | yes |
| Haiti | HTI | yes | yes | yes | yes | yes | yes |
| India | IND | yes | yes | yes | yes | yes | yes |
| Kyrgyz Republic | KGZ | yes | yes | yes | yes | yes | yes |
| Lesotho | LSO | yes | yes | yes | yes | yes | yes |
| Liberia | LBR | yes | yes | yes | yes | yes | yes |
| Madagascar | MDG | yes | yes | yes | yes | yes | yes |
| Malawi | MWI | yes | yes | yes | yes | yes | yes |
| Mali | MLI | yes | yes | yes | yes | yes | yes |
| Mauritania | MRT | yes | yes | yes | yes | yes | yes |
| Myanmar | MMR | yes | yes | yes | yes | yes | yes |
| Nepal | NPL | yes | yes | yes | yes | yes | yes |
| Nicaragua | NIC | yes | yes | yes | yes | yes | yes |
| Rwanda | RWA | yes | yes | yes | yes | yes | yes |
| São Tomé and Príncipe | STP | yes | yes | yes | yes | yes | yes |
| Sierra Leone | SLE | yes | yes | yes | yes | yes | yes |
| Solomon Islands | SLB | yes | yes | yes | yes | yes | yes |
| Tajikistan | TJK | yes | yes | yes | yes | yes | yes |
| Uganda | UGA | yes | yes | yes | yes | yes | yes |
| Uzbekistan | UZB | yes | yes | yes | yes | yes | yes |
| Vanuatu | VUT | yes | yes | yes | yes | yes | yes |
| Vietnam | VNM | yes | yes | yes | yes | yes | yes |
| Honduras | HND | yes | yes | yes | yes | yes | yes |
| Morocco | MAR | yes | yes | yes | yes | yes | yes |
| Philippines | PHL | yes | yes | yes | yes | yes | yes |

## Base year 2025

IDS November 2026 (DFO API, filled from the current bulk files), WEO October 2026, projected to 2031.

- Countries lacking a core series: 0
- Countries without a projection: 2 (SEN, PAK)
- Countries without a capacity: 0
- Creditor-group guard, 1%: 869 of 870 country-years pass
  - NIC 2017: sum of DFO creditors 199,338,848 against PPG 205,334,848
- DFO against the IDS bulk files, 1%: 4470 of 4470 values agree
- No 2015-19 commitments from a source, so the 58-country average terms stand in: BTN private, DJI private, GNB private, BGD private, CAF private, COM private, NER private, BDI private, KHM private, TCD private, SWZ private, HTI private, KGZ private, LSO private, MWI private, MLI private, MRT private, NPL private, SLE private, SLB private, VUT private

| Country | ISO3 | Debt stock | Debt service | GDP | Revenue | Projection | Capacity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bhutan | BTN | yes | yes | yes | yes | yes | yes |
| Djibouti | DJI | yes | yes | yes | yes | yes | yes |
| Guinea-Bissau | GNB | yes | yes | yes | yes | yes | yes |
| Mozambique | MOZ | yes | yes | yes | yes | yes | yes |
| Zambia | ZMB | yes | yes | yes | yes | yes | yes |
| Republic of the Congo | COG | yes | yes | yes | yes | yes | yes |
| Lao PDR | LAO | yes | yes | yes | yes | yes | yes |
| Senegal | SEN | yes | yes | yes | yes | **no** | yes |
| Bangladesh | BGD | yes | yes | yes | yes | yes | yes |
| Central African Republic | CAF | yes | yes | yes | yes | yes | yes |
| Comoros | COM | yes | yes | yes | yes | yes | yes |
| Egypt | EGY | yes | yes | yes | yes | yes | yes |
| Ethiopia | ETH | yes | yes | yes | yes | yes | yes |
| The Gambia | GMB | yes | yes | yes | yes | yes | yes |
| Guinea | GIN | yes | yes | yes | yes | yes | yes |
| Niger | NER | yes | yes | yes | yes | yes | yes |
| Pakistan | PAK | yes | yes | yes | yes | **no** | yes |
| Papua New Guinea | PNG | yes | yes | yes | yes | yes | yes |
| Tanzania | TZA | yes | yes | yes | yes | yes | yes |
| Tunisia | TUN | yes | yes | yes | yes | yes | yes |
| Angola | AGO | yes | yes | yes | yes | yes | yes |
| Benin | BEN | yes | yes | yes | yes | yes | yes |
| Cameroon | CMR | yes | yes | yes | yes | yes | yes |
| Côte d'Ivoire | CIV | yes | yes | yes | yes | yes | yes |
| Ghana | GHA | yes | yes | yes | yes | yes | yes |
| Jordan | JOR | yes | yes | yes | yes | yes | yes |
| Kenya | KEN | yes | yes | yes | yes | yes | yes |
| Nigeria | NGA | yes | yes | yes | yes | yes | yes |
| Burkina Faso | BFA | yes | yes | yes | yes | yes | yes |
| Burundi | BDI | yes | yes | yes | yes | yes | yes |
| Cambodia | KHM | yes | yes | yes | yes | yes | yes |
| Chad | TCD | yes | yes | yes | yes | yes | yes |
| Democratic Republic of the Congo | COD | yes | yes | yes | yes | yes | yes |
| Eswatini | SWZ | yes | yes | yes | yes | yes | yes |
| Haiti | HTI | yes | yes | yes | yes | yes | yes |
| India | IND | yes | yes | yes | yes | yes | yes |
| Kyrgyz Republic | KGZ | yes | yes | yes | yes | yes | yes |
| Lesotho | LSO | yes | yes | yes | yes | yes | yes |
| Liberia | LBR | yes | yes | yes | yes | yes | yes |
| Madagascar | MDG | yes | yes | yes | yes | yes | yes |
| Malawi | MWI | yes | yes | yes | yes | yes | yes |
| Mali | MLI | yes | yes | yes | yes | yes | yes |
| Mauritania | MRT | yes | yes | yes | yes | yes | yes |
| Myanmar | MMR | yes | yes | yes | yes | yes | yes |
| Nepal | NPL | yes | yes | yes | yes | yes | yes |
| Nicaragua | NIC | yes | yes | yes | yes | yes | yes |
| Rwanda | RWA | yes | yes | yes | yes | yes | yes |
| São Tomé and Príncipe | STP | yes | yes | yes | yes | yes | yes |
| Sierra Leone | SLE | yes | yes | yes | yes | yes | yes |
| Solomon Islands | SLB | yes | yes | yes | yes | yes | yes |
| Tajikistan | TJK | yes | yes | yes | yes | yes | yes |
| Uganda | UGA | yes | yes | yes | yes | yes | yes |
| Uzbekistan | UZB | yes | yes | yes | yes | yes | yes |
| Vanuatu | VUT | yes | yes | yes | yes | yes | yes |
| Vietnam | VNM | yes | yes | yes | yes | yes | yes |
| Honduras | HND | yes | yes | yes | yes | yes | yes |
| Morocco | MAR | yes | yes | yes | yes | yes | yes |
| Philippines | PHL | yes | yes | yes | yes | yes | yes |

## Notes

- capacity.csv gives DSA dates as year and month; `dsaDate` puts them on the first of the month.
