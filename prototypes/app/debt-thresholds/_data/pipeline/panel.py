"""The country-by-series panel that every source fills and the build reads."""

from collections.abc import Mapping

from pipeline.config import MAX_MISSING
from pipeline.countries import ISO3
from pipeline.errors import DataError

type Series = dict[int, float]
type Panel = dict[str, dict[str, Series]]  # ISO3 -> panel key -> year -> value


def check_actuals(panel: Panel, base: int, *, source: str, hint: str = "") -> None:
    """Raise `DataError` unless the release's actual debt stocks end in `base`.

    At most `MAX_MISSING` countries may lack a `base` stock, and none may have one
    for the year after. `source` names the release in the message, and `hint`
    follows it.
    """
    stocks = [keys.get("ppg_stock", {}) for keys in panel.values()]
    actual = sum(1 for s in stocks if base in s)
    later = sum(1 for s in stocks if base + 1 in s)
    if actual < len(ISO3) - MAX_MISSING or later > 0:
        raise DataError(
            f"{source} does not end its actuals in {base}: {actual} countries have a "
            f"{base} debt stock and {later} one for {base + 1}.{hint}"
        )


def amount_of(keys: Mapping[str, Series], key: str, year: int) -> float:
    """Return a value, with a missing one read as zero (the DFO omits zero creditors)."""
    return keys.get(key, {}).get(year) or 0.0


def span(first: int, last: int) -> range:
    """Return the years from `first` to `last`, both included."""
    return range(first, last + 1)


def whole(amount: float | None) -> int | None:
    """Return `amount` rounded to a whole number, keeping a missing value missing."""
    return None if amount is None else round(amount)
