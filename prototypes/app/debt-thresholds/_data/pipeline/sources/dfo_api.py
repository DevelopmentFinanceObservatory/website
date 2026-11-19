"""The current IDS release and WEO GDP, read through the Development Finance Observatory."""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from collections.abc import Iterable
from datetime import date
from functools import cache, partial
from pathlib import Path
from typing import TYPE_CHECKING, Any

from pipeline.config import FIRST_FLOW_YEAR, View
from pipeline.countries import ISO3
from pipeline.errors import DataError
from pipeline.panel import Panel, Series, check_actuals
from pipeline.provenance import Ledger
from pipeline.sources.pinned import Mode, Reads

if TYPE_CHECKING:
    import dfo
    import pandas as pd

log = logging.getLogger("pipeline")

# The IDS series code of each reading. A reading by creditor answers creditor by
# creditor (`open_roles=["origin"]`); the others read all creditors together.
CODES = {
    "service": "DT.TDS.DPPG.CD",
    "service_multilateral": "DT.TDS.MLAT.CD",
    "service_bilateral": "DT.TDS.BLAT.CD",
    "principal": "DT.AMT.DPPG.CD",
    "principal_multilateral": "DT.AMT.MLAT.CD",
    "principal_bilateral": "DT.AMT.BLAT.CD",
    "disbursements": "DT.DIS.DPPG.CD",
    "disbursements_multilateral": "DT.DIS.MLAT.CD",
    "disbursements_bilateral": "DT.DIS.BLAT.CD",
    "stock": "DT.DOD.DPPG.CD",
    "imf_stock": "DT.DOD.DIMF.CD",
    "imf_disbursements": "DT.DIS.DIMF.CD",
    "imf_interest": "DT.INT.DIMF.CD",
    "imf_principal": "DT.AMT.DIMF.CD",
    "service_private": "DT.TDS.PRVT.CD",
    "concessional_stock": "DT.DOD.ALLC.CD",
    "grant_element": "DT.GRE.DPPG",
    "rate_official": "DT.INR.OFFT",
    "rate_private": "DT.INR.PRVT",
    "maturity_official": "DT.MAT.OFFT",
    "maturity_private": "DT.MAT.PRVT",
    "grace_official": "DT.GPA.OFFT",
    "grace_private": "DT.GPA.PRVT",
    "commitments_official": "DT.COM.OFFT.CD",
    "commitments_private": "DT.COM.PRVT.CD",
    "service_by_creditor": "DT.TDS.DPPG.CD",
    "principal_by_creditor": "DT.AMT.DPPG.CD",
    "disbursements_by_creditor": "DT.DIS.DPPG.CD",
    "service_bilateral_by_creditor": "DT.TDS.BLAT.CD",
    "principal_bilateral_by_creditor": "DT.AMT.BLAT.CD",
    "disbursements_bilateral_by_creditor": "DT.DIS.BLAT.CD",
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
    "imf_disbursements": "imf_disb",
    "imf_interest": "imf_interest",
    "imf_principal": "imf_principal",
    "service_private": "prvt_service",
    "gdp": "gdp",
    "concessional_stock": "ppg_concessional_stock",
    "grant_element": "ppg_grant_element",
    "rate_official": "inr_offt",
    "rate_private": "inr_prvt",
    "maturity_official": "mat_offt",
    "maturity_private": "mat_prvt",
    "grace_official": "gpa_offt",
    "grace_private": "gpa_prvt",
    "commitments_official": "com_offt",
    "commitments_private": "com_prvt",
}
# Readings by single creditor, kept for China's part: all Chinese creditors, and the
# bilateral (official) part.
CHINA_KEYS = {
    "service_by_creditor": "china_service",
    "principal_by_creditor": "china_principal",
    "disbursements_by_creditor": "china_disb",
    "service_bilateral_by_creditor": "china_blat_service",
    "principal_bilateral_by_creditor": "china_blat_principal",
    "disbursements_bilateral_by_creditor": "china_blat_disb",
}
IDS_NODE = "provenance/WorldBankInternationalDebtStatistics"
# Search takes at most 16 places a part, so each code is searched for one country
# and the fetch binds the 58.
SEARCH_PLACE = "country/KEN"
CHINA = "country/CHN"
IMF = "InternationalMonetaryFund"

type Collected = dict[str, dict[str, Series]]


@cache
def pinned_specs() -> dict[str, dict]:
    """Return the readings without a series code that Search reads as its series alone.

    Each entry holds the question once asked and the spec its answer held.
    `fetch_dfo` narrows the spec to the 58 countries and the window.
    """
    return json.loads(Path(__file__).with_name("pinned_specs.json").read_text())


def fetch_dfo(view: View, *, reads: Reads, ledger: Ledger) -> tuple[Panel, dict[str, Series]]:
    """Return the current IDS release and WEO GDP through the DFO, one pinned ref per reading.

    The result is the panel and, per ISO3, the sum of debt service over single
    creditors, for the guard. Each reading is recorded in `ledger`. Raises
    `DataError` when a series code does not read as its own series, when a
    reading's spec takes other roles than `check_roles` expects, or when the
    release's actual debt stocks do not end in the base year.
    """
    collected: Collected = {iso3: defaultdict(dict) for iso3 in ISO3}
    creditor_sums: dict[str, Series] = defaultdict(dict)
    places = [f"country/{iso3}" for iso3 in ISO3]
    window = (FIRST_FLOW_YEAR, view.end)

    for key in [*CODES, *pinned_specs()]:
        build = partial(build_reading, reads.client, key, places, window)
        if key in CHINA_KEYS:
            # The step needs China's rows and, for the guard, the creditors' sum: DFO
            # cuts both from the pinned ref, so a plain run downloads neither in full.
            ref = reads.pinned_ref(key) if reads.mode is Mode.PLAIN else reads.fetch(key, build).ref
            member = ref.members[0]
            check_roles(key, member.spec)
            frame = by_creditor(reads.client, key, ref, creditor_sums)
            put(collected, _rows(frame), CHINA_KEYS[key])
        else:
            data = reads.fetch(key, build)
            member = data.ref.members[0]
            check_roles(key, member.spec)
            frame = _with_years(data.to_pandas(), key)
            put(collected, _rows(frame), DFO_KEYS[key])
        ledger.read(
            {
                "key": key,
                "code": CODES.get(key),
                "specId": member.spec.spec_id,
                "version": member.content_version,
                "rows": len(frame),
            }
        )
        log.info("DFO %s: %d rows used", key, len(frame))

    panel = {iso3: dict(keys) for iso3, keys in collected.items()}
    check_actuals(panel, view.base, source=f"the DFO's IDS {view.ids} release")
    return panel, dict(creditor_sums)


def check_roles(key: str, spec: dfo.Spec) -> None:
    """Raise `DataError` when a reading's spec binds or leaves open other roles than
    the step reads it by.

    GDP binds the place it is about. A reading by creditor binds the debtors and
    leaves `origin` open, so its rows run creditor by creditor. Every other reading,
    net transfers included, binds the debtors and leaves `origin` out, so it reads
    all creditors together; the IMF readings name the IMF through their series code.
    `Spec.roles` reports an open role and an absent one alike, so this reads the
    spec's identity.
    """
    identity = spec.definition.get("identity") or {}
    found = (sorted(identity.get("entities") or {}), sorted(identity.get("open_roles") or ()))
    if key == "gdp":
        expected = (["observationAbout"], [])
    elif key in CHINA_KEYS:
        expected = (["destination"], ["origin"])
    else:
        expected = (["destination"], [])
    if found != expected:
        raise DataError(
            f"the spec of {key} binds {found[0]} and leaves {found[1]} open, where the "
            f"step reads it binding {expected[0]} with {expected[1]} open."
        )


def by_creditor(
    client: dfo.Client, key: str, ref: dfo.DatasetRef, creditor_sums: dict[str, Series]
) -> pd.DataFrame:
    """Return China's rows of a by-creditor reading, cut by DFO from its pinned ref.

    For `service_by_creditor`, also store each country-year's sum over single
    creditors in `creditor_sums`. Raises `DataError` when the IMF is among the
    creditors, since PPG debt leaves IMF credit out.
    """
    if len(client.analysis.filter(ref, keep={"origin": IMF})):
        raise DataError(f"the IMF is among the creditors in {key}.")
    if key == "service_by_creditor":
        sums = _with_years(client.analysis.aggregate(ref, by="destination").to_pandas(), key)
        for iso3, year, total in _rows(sums):
            creditor_sums[iso3][int(year)] = float(total)
    return _with_years(client.analysis.filter(ref, keep={"origin": CHINA}).to_pandas(), key)


def _with_years(frame: pd.DataFrame, key: str) -> pd.DataFrame:
    """Return the frame's rows with a value for the 58 countries, with `iso3` and `year`."""
    place = "observationAbout" if key in pinned_specs() else "financingRecipient"
    frame["iso3"] = frame[place].str.removeprefix("country/")
    # A derived frame writes years as text.
    frame["year"] = frame["time_period"].astype(str).astype(int)
    return frame[frame["iso3"].isin(ISO3) & frame["value"].notna()]


def reading_record(answer: dfo.Answer) -> dict:
    """Return the readable record of Search's reading of one series code.

    It keeps the code asked, the roles left open, Search's sentence, the source
    codes the reading holds and the spec; `readings.json` commits it.
    """
    part = answer.raw["parts"][0]
    spec = part["spec"]
    return {
        "code": part["restatement"]["source_code"],
        "openRoles": part["restatement"].get("open_roles", []),
        "sentence": answer.sentence,
        "sourceCodes": spec["resolved"]["stat_vars"]["source_codes"],
        "specId": spec["spec_id"],
        "definition": spec["definition"],
    }


def build_reading(
    client: dfo.Client, key: str, places: list[str], window: tuple[int, int]
) -> tuple[dict, dfo.Dataset]:
    """Search a reading by its series code for `SEARCH_PLACE`, or take its pinned spec,
    and fetch it for `places` over `window`.

    Returns the reading's record, Search's answer or the pinned spec, and the data.
    Raises `DataError` when Search's reading of the code is not that series alone.
    """
    import dfo

    if key in pinned_specs():
        pin = pinned_specs()[key]
        spec = dfo.Spec(spec_id=pin["definition"]["spec_id"], definition=pin["definition"])
        data = client.fetch(spec, window=window, entities={"place": places}, progress=False)
        return pin, data
    answer = client.search(
        codes=[CODES[key]],
        entities={"destination": [SEARCH_PLACE]},
        window=window,
        open_roles=["origin"] if key in CHINA_KEYS else None,
    )
    if not answer.complete:
        raise DataError(
            f"{CODES[key]} ({key}) did not read as its own series: "
            + " ".join(gap.message for gap in answer.gaps)
        )
    data = answer.fetch(window=window, entities={"destination": places}, progress=False)
    return reading_record(answer), data


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
