"""Tests for the reference lending terms and their pooled fallback."""

from pipeline.countries import ISO3
from pipeline.terms import lending_terms


def _commitments(kind: str, **by_name: dict[int, float]) -> dict[str, dict[int, float]]:
    return {f"{name}_{kind}": series for name, series in by_name.items()}


def test_lending_terms_weights_by_commitment_and_pools_the_rest() -> None:
    panel = {iso3: {} for iso3 in ISO3}
    panel[ISO3[0]] = {
        **_commitments(
            "offt",
            com={2015: 100.0, 2016: 300.0, 2020: 999.0},
            inr={2015: 2.0, 2016: 4.0},
            mat={2015: 10.0, 2016: 20.0},
            gpa={2015: 1.0, 2016: 3.0},
        ),
        **_commitments("prvt", com={2017: 10.0}, inr={2017: 6.0}, mat={2017: 5.0}, gpa={2017: 0.0}),
    }
    terms, fallback = lending_terms(panel)
    # 2020 lies outside the reference years, so only 2015-16 count.
    assert terms[ISO3[0]]["official"] == {"rate": 3.5, "maturity": 17.5, "grace": 2.5}
    assert terms[ISO3[1]] == terms[ISO3[0]]
    assert f"{ISO3[1]} official" in fallback
    assert f"{ISO3[1]} private" in fallback
    assert f"{ISO3[0]} official" not in fallback
    assert f"{ISO3[0]} private" not in fallback
