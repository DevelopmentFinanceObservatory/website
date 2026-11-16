"""IMF World Economic Outlook series for the 58 countries."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping

from pipeline.config import View
from pipeline.countries import ISO3
from pipeline.errors import DataError
from pipeline.panel import Series
from pipeline.provenance import Ledger

WEO_SERIES = {
    "gdp_usd_bn": "NGDPD",
    "revenue_pct": "GGR_NGDP",
    "primary_balance_pct": "GGXONLB_NGDP",
    "gg_debt_pct": "GGXWDG_NGDP",
}
WEO_NAMES = {
    "NGDPD": "Gross domestic product (GDP), Current prices, US dollar",
    "GGR_NGDP": "Revenue, General government, Percent of GDP",
    "GGXONLB_NGDP": (
        "Primary net lending (+) / net borrowing (-), General government, Percent of GDP"
    ),
    "GGXWDG_NGDP": "Gross debt, General government, Percent of GDP",
}


def load_weo(view: View, *, ledger: Ledger) -> dict[str, dict[str, Series]]:
    """Return one WEO release's series, by ISO3 then key; series codes confirmed by name."""
    # Imported here so the parsing helpers load without bblocks installed.
    from bblocks.data_importers import WEO

    frame = WEO().get_data(version=view.weo)
    frame = frame[frame["indicator_code"].isin(WEO_SERIES.values())]
    check_weo_names(
        {
            code: set(frame.loc[frame["indicator_code"] == code, "indicator_name"].dropna())
            for code in WEO_NAMES
        },
        view,
    )
    frame = frame[frame["entity_code"].isin(ISO3) & frame["value"].notna()]
    out = weo_panel(
        frame[["entity_code", "indicator_code", "year", "value"]].itertuples(index=False)
    )
    release = f"{view.weo[0]} {view.weo[1]}"
    ledger.preload(
        {
            "name": f"IMF World Economic Outlook, {release}",
            "baseYear": view.base,
            "vintage": release,
            "series": list(WEO_SERIES.values()),
            "source": (
                "https://www.imf.org/en/Publications/WEO, read with "
                "bblocks-data-importers 0.5.0 and imf-reader 2.3.0"
            ),
        }
    )
    return out


def check_weo_names(names: Mapping[str, set[str]], view: View) -> None:
    """Raise `DataError` when a series code carries a name other than the expected one.

    `names` maps each code in `WEO_NAMES` to the indicator names the release gives it.
    """
    for code, label in WEO_NAMES.items():
        found = names.get(code, set())
        if label not in found:
            raise DataError(f"WEO {view.weo} {code} is named {found}, expected {label!r}.")


def weo_panel(rows: Iterable[tuple[str, str, int, float]]) -> dict[str, dict[str, Series]]:
    """Return the panel for (iso3, series code, year, value) rows of countries in the note.

    Codes outside `WEO_SERIES` are dropped. Keys come in `WEO_SERIES` order.
    """
    rows = list(rows)
    out: dict[str, dict[str, Series]] = {iso3: defaultdict(dict) for iso3 in ISO3}
    for key, code in WEO_SERIES.items():
        for iso3, row_code, year, amount in rows:
            if row_code == code:
                out[iso3][key][int(year)] = float(amount)
    return out
