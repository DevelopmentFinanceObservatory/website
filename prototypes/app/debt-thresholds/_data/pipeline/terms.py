"""Reference lending terms for new borrowing."""

from collections import defaultdict

from pipeline.config import REFERENCE_YEARS
from pipeline.countries import ISO3
from pipeline.panel import Panel, amount_of


def lending_terms(panel: Panel) -> tuple[dict[str, dict], list[str]]:
    """Return the 2015-19 rate, maturity and grace on new commitments, weighted by amount.

    A country with no commitments from a source in 2015-19 takes the pooled
    average of the 58 countries for that source. The second value lists the
    country and source pairs that fell back, as "ISO3 kind".
    """
    kinds = {
        "official": ("inr_offt", "mat_offt", "gpa_offt", "com_offt"),
        "private": ("inr_prvt", "mat_prvt", "gpa_prvt", "com_prvt"),
    }
    names = ("rate", "maturity", "grace")
    own: dict[str, dict[str, dict | None]] = defaultdict(dict)
    pooled: dict[str, dict] = {}
    for kind, (*series, weight_key) in kinds.items():
        pool = defaultdict(float)
        for iso3 in ISO3:
            sums = defaultdict(float)
            for year in REFERENCE_YEARS:
                weight = amount_of(panel[iso3], weight_key, year)
                if weight <= 0:
                    continue
                sums["weight"] += weight
                for name, key in zip(names, series, strict=True):
                    sums[name] += weight * amount_of(panel[iso3], key, year)
            for name, total in sums.items():
                pool[name] += total
            own[iso3][kind] = (
                {name: sums[name] / sums["weight"] for name in names} if sums["weight"] else None
            )
        pooled[kind] = {name: pool[name] / pool["weight"] for name in names}

    fallback = [f"{iso3} {kind}" for iso3 in ISO3 for kind in kinds if own[iso3][kind] is None]
    terms = {iso3: {kind: own[iso3][kind] or pooled[kind] for kind in kinds} for iso3 in ISO3}
    return terms, fallback
