from collections import Counter

from pipeline.countries import COUNTRIES, ISO3


def test_annex_counts_by_group():
    assert len(COUNTRIES) == 58
    assert len(set(ISO3)) == 58
    assert Counter(c.fdl2024 for c in COUNTRIES) == {
        "insolvent": 8,
        "illiquid": 20,
        "lower risk": 30,
    }


def test_fields_unpack_in_annex_order():
    iso3, name, fdl2024 = COUNTRIES[0]
    assert (iso3, name, fdl2024) == ("BTN", "Bhutan", "insolvent")
