"""The current IDS release and WEO GDP, read through the Development Finance Observatory."""

from __future__ import annotations

import json
import logging
import warnings
from collections import defaultdict
from collections.abc import Iterable
from datetime import date
from functools import cache
from pathlib import Path
from typing import Any

from pipeline.config import FIRST_FLOW_YEAR, View
from pipeline.countries import ISO3
from pipeline.errors import DataError
from pipeline.panel import Panel, Series
from pipeline.provenance import Ledger

log = logging.getLogger("pipeline")

PINNED_ORIGIN = {
    "imf_stock": ("InternationalMonetaryFund",),
    "imf_flows": ("InternationalMonetaryFund",),
    "imf_interest": ("InternationalMonetaryFund",),
}
DFO_KEYS = {
    "service": "ppg_service",
    "service_multilateral": "mlat_service",
    "service_bilateral": "blat_service",
    "principal": "ppg_principal",
    "principal_multilateral": "mlat_principal",
    "principal_bilateral": "blat_principal",
    "disbursements": "ppg_disb",
    "disbursements_multilateral": "mlat_disb",
    "disbursements_bilateral": "blat_disb",
    "stock": "ppg_stock",
    "imf_stock": "imf_stock",
    "imf_interest": "imf_interest",
    "gdp": "gdp",
}
IDS_NODE = "provenance/WorldBankInternationalDebtStatistics"

type Collected = dict[str, dict[str, Series]]


@cache
def pinned_specs() -> dict[str, dict]:
    """Return the readings searched once and pinned, from `pinned_specs.json`.

    Each entry holds the question asked and the spec its answer held. Each fetch
    narrows the spec to the 58 countries and the window, after asserting the roles it
    takes and the origin it binds.
    """
    return json.loads(Path(__file__).with_name("pinned_specs.json").read_text())


def fetch_dfo(view: View, *, ledger: Ledger) -> tuple[Panel, dict[str, Series]]:
    """Return the current IDS release and WEO GDP through the DFO, one call per pinned reading.

    The result is the panel and, per ISO3, the sum of debt service over single
    creditors, for the guard. Each reading is recorded in `ledger`.
    """
    # Imported here so the parsing helpers load without the SDK installed.
    import dfo

    collected: Collected = {iso3: defaultdict(dict) for iso3 in ISO3}
    creditor_sums: dict[str, Series] = defaultdict(dict)
    places = [f"country/{iso3}" for iso3 in ISO3]

    with dfo.Client(timeout=900.0, max_retries=3) as client:
        for key, pin in pinned_specs().items():
            spec = dfo.Spec(spec_id=pin["definition"]["spec_id"], definition=pin["definition"])
            roles = spec.roles
            if key == "gdp":
                if set(roles) != {"place"}:
                    raise DataError(f"pinned spec {key} takes {roles}, expected place.")
                entities = {"place": places}
            else:
                if set(roles) != {"destination", "origin"} or roles["origin"] != PINNED_ORIGIN.get(
                    key
                ):
                    raise DataError(f"pinned spec {key} takes {roles}.")
                entities = {"destination": places}

            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                data = client.fetch(
                    spec,
                    window=(FIRST_FLOW_YEAR, view.end),
                    entities=entities,
                    progress=False,
                )
            frame = data.to_pandas()
            ledger.read(
                {
                    "key": key,
                    "question": pin["question"],
                    "sentence": data.sentence,
                    "specId": spec.spec_id,
                    "versions": [member.content_version for member in data.members],
                    "ref": json.loads(data.ref.to_json()),
                    "fetchedAt": data.fetched_at.isoformat() if data.fetched_at else None,
                    "citation": data.citation.text,
                    "rows": len(frame),
                    "warnings": sorted({str(w.message) for w in caught}),
                }
            )
            log.info("DFO %s: %d rows", key, len(frame))

            place = "observationAbout" if key == "gdp" else "financingRecipient"
            frame["iso3"] = frame[place].str.removeprefix("country/")
            frame["year"] = frame["time_period"].astype(int)
            frame = frame[frame["iso3"].isin(ISO3) & frame["value"].notna()]

            if key.endswith("_by_creditor"):
                flow = key.removesuffix("_by_creditor")
                if "InternationalMonetaryFund" in set(frame["financingProvider"]):
                    raise DataError(f"the IMF is among the creditors in {key}.")
                if flow == "service":
                    sums = frame.groupby(["iso3", "year"])["value"].sum()
                    for (iso3, year), total in sums.items():
                        creditor_sums[iso3][int(year)] = float(total)
                china = frame[frame["financingProvider"] == "country/CHN"]
                put(collected, _rows(china), f"china_{flow}")
            elif key == "imf_flows":
                for word, target in (
                    ("Disbursement", "imf_disb"),
                    ("PrincipalRepayment", "imf_principal"),
                ):
                    put(collected, _rows(frame[frame["stat_var"].str.contains(word)]), target)
            else:
                put(collected, _rows(frame), DFO_KEYS[key])

    return {iso3: dict(keys) for iso3, keys in collected.items()}, dict(creditor_sums)


def _rows(frame) -> Iterable[tuple[str, int, float]]:
    """Return the (iso3, year, value) rows of a DFO frame."""
    return frame[["iso3", "year", "value"]].itertuples(index=False)


def put(collected: Collected, rows: Iterable[tuple[str, int, float]], key: str) -> None:
    """Store one value per country-year under `key`; raise `DataError` on several."""
    rows = list(rows)
    if len({(iso3, int(year)) for iso3, year, _ in rows}) < len(rows):
        raise DataError(f"the DFO returned several rows per country-year for {key}.")
    for iso3, year, amount in rows:
        collected[iso3][key][int(year)] = float(amount)


def ids_release() -> str:
    """Return the IDS release the DFO holds, as a month and year, from its last refresh date."""
    import dfo

    raw = dict[str, Any](dfo.lookup.node(IDS_NODE).raw)
    refreshed = raw["provenance"]["last_data_refresh_date"]
    return date.fromisoformat(refreshed).strftime("%B %Y")
