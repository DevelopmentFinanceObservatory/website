"""The country-by-series panel that every source fills and the build reads."""

from collections.abc import Mapping

from pipeline.config import TOLERANCE, View
from pipeline.countries import ISO3

type Series = dict[int, float]
type Panel = dict[str, dict[str, Series]]  # ISO3 -> panel key -> year -> value


def merge_panels(primary: Panel, fill: Panel) -> Panel:
    """Return a panel where `primary` wins and `fill` supplies the keys and years it lacks."""
    merged: Panel = {}
    for iso3 in ISO3:
        keys = {key: dict(series) for key, series in fill.get(iso3, {}).items()}
        for key, series in primary.get(iso3, {}).items():
            keys.setdefault(key, {}).update(series)
        merged[iso3] = keys
    return merged


def cross_check(from_dfo: Panel, bulk: Panel, view: View) -> dict:
    """Count the values where the DFO and the bulk files differ by more than 1%."""
    keys = ("ppg_service", "ppg_stock", "mlat_service", "blat_service", "china_service")
    compared = differ = 0
    examples = []
    for iso3 in ISO3:
        for key in keys:
            for year, amount in from_dfo[iso3].get(key, {}).items():
                other = bulk[iso3].get(key, {}).get(year)
                if other is None or year > view.end:
                    continue
                compared += 1
                if abs(amount - other) > TOLERANCE * max(abs(other), 1.0):
                    differ += 1
                    if len(examples) < 10:
                        examples.append(
                            f"{iso3} {key} {year}: DFO {amount:,.0f}, bulk {other:,.0f}"
                        )
    return {"compared": compared, "differ": differ, "examples": examples}


def amount_of(keys: Mapping[str, Series], key: str, year: int) -> float:
    """Return a value, with a missing one read as zero (the DFO omits zero creditors)."""
    return keys.get(key, {}).get(year) or 0.0


def span(first: int, last: int) -> range:
    """Return the years from `first` to `last`, both included."""
    return range(first, last + 1)


def whole(amount: float | None) -> int | None:
    """Return `amount` rounded to a whole number, keeping a missing value missing."""
    return None if amount is None else round(amount)
