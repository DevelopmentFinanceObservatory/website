"""The 58 countries of the Finance for Development Lab's March 2026 note, Annex 1."""

from typing import NamedTuple


class Country(NamedTuple):
    """One country in the note and the FDL group it falls in."""

    iso3: str
    name: str
    fdl2024: str


# FDL short note, March 2026, Annex 1: 8 at risk of insolvency, 20 illiquid,
# 30 lower risk. https://findevlab.org/emerging-debt-challenges-for-developing-countries/
COUNTRIES: tuple[Country, ...] = (
    Country("BTN", "Bhutan", "insolvent"),
    Country("DJI", "Djibouti", "insolvent"),
    Country("GNB", "Guinea-Bissau", "insolvent"),
    Country("MOZ", "Mozambique", "insolvent"),
    Country("ZMB", "Zambia", "insolvent"),
    Country("COG", "Republic of the Congo", "insolvent"),
    Country("LAO", "Lao PDR", "insolvent"),
    Country("SEN", "Senegal", "insolvent"),
    Country("BGD", "Bangladesh", "illiquid"),
    Country("CAF", "Central African Republic", "illiquid"),
    Country("COM", "Comoros", "illiquid"),
    Country("EGY", "Egypt", "illiquid"),
    Country("ETH", "Ethiopia", "illiquid"),
    Country("GMB", "The Gambia", "illiquid"),
    Country("GIN", "Guinea", "illiquid"),
    Country("NER", "Niger", "illiquid"),
    Country("PAK", "Pakistan", "illiquid"),
    Country("PNG", "Papua New Guinea", "illiquid"),
    Country("TZA", "Tanzania", "illiquid"),
    Country("TUN", "Tunisia", "illiquid"),
    Country("AGO", "Angola", "illiquid"),
    Country("BEN", "Benin", "illiquid"),
    Country("CMR", "Cameroon", "illiquid"),
    Country("CIV", "Côte d'Ivoire", "illiquid"),
    Country("GHA", "Ghana", "illiquid"),
    Country("JOR", "Jordan", "illiquid"),
    Country("KEN", "Kenya", "illiquid"),
    Country("NGA", "Nigeria", "illiquid"),
    Country("BFA", "Burkina Faso", "lower risk"),
    Country("BDI", "Burundi", "lower risk"),
    Country("KHM", "Cambodia", "lower risk"),
    Country("TCD", "Chad", "lower risk"),
    Country("COD", "Democratic Republic of the Congo", "lower risk"),
    Country("SWZ", "Eswatini", "lower risk"),
    Country("HTI", "Haiti", "lower risk"),
    Country("IND", "India", "lower risk"),
    Country("KGZ", "Kyrgyz Republic", "lower risk"),
    Country("LSO", "Lesotho", "lower risk"),
    Country("LBR", "Liberia", "lower risk"),
    Country("MDG", "Madagascar", "lower risk"),
    Country("MWI", "Malawi", "lower risk"),
    Country("MLI", "Mali", "lower risk"),
    Country("MRT", "Mauritania", "lower risk"),
    Country("MMR", "Myanmar", "lower risk"),
    Country("NPL", "Nepal", "lower risk"),
    Country("NIC", "Nicaragua", "lower risk"),
    Country("RWA", "Rwanda", "lower risk"),
    Country("STP", "São Tomé and Príncipe", "lower risk"),
    Country("SLE", "Sierra Leone", "lower risk"),
    Country("SLB", "Solomon Islands", "lower risk"),
    Country("TJK", "Tajikistan", "lower risk"),
    Country("UGA", "Uganda", "lower risk"),
    Country("UZB", "Uzbekistan", "lower risk"),
    Country("VUT", "Vanuatu", "lower risk"),
    Country("VNM", "Vietnam", "lower risk"),
    Country("HND", "Honduras", "lower risk"),
    Country("MAR", "Morocco", "lower risk"),
    Country("PHL", "Philippines", "lower risk"),
)
ISO3: tuple[str, ...] = tuple(country.iso3 for country in COUNTRIES)
