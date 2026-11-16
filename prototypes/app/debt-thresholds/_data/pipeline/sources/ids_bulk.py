"""World Bank International Debt Statistics (IDS) bulk files, read into a panel."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from collections.abc import Iterable, Iterator, Sequence
from pathlib import Path
from typing import TYPE_CHECKING

from pipeline.config import MAX_MISSING, Paths, View
from pipeline.countries import ISO3
from pipeline.errors import DataError
from pipeline.panel import Panel, Series
from pipeline.provenance import Ledger

if TYPE_CHECKING:
    import httpx

# IDS series by panel key, with "World" (all creditors) as the counterpart.
IDS_WORLD = {
    "ppg_service": "DT.TDS.DPPG.CD",
    "ppg_principal": "DT.AMT.DPPG.CD",
    "ppg_disb": "DT.DIS.DPPG.CD",
    "ppg_stock": "DT.DOD.DPPG.CD",
    "ppg_concessional_stock": "DT.DOD.ALLC.CD",
    "ppg_grant_element": "DT.GRE.DPPG",
    "mlat_service": "DT.TDS.MLAT.CD",
    "mlat_principal": "DT.AMT.MLAT.CD",
    "mlat_disb": "DT.DIS.MLAT.CD",
    "blat_service": "DT.TDS.BLAT.CD",
    "blat_principal": "DT.AMT.BLAT.CD",
    "blat_disb": "DT.DIS.BLAT.CD",
    "prvt_service": "DT.TDS.PRVT.CD",
    "prvt_principal": "DT.AMT.PRVT.CD",
    "prvt_disb": "DT.DIS.PRVT.CD",
    "imf_principal": "DT.AMT.DIMF.CD",
    "imf_interest": "DT.INT.DIMF.CD",
    "imf_disb": "DT.DIS.DIMF.CD",
    "imf_stock": "DT.DOD.DIMF.CD",
    "inr_offt": "DT.INR.OFFT",
    "inr_prvt": "DT.INR.PRVT",
    "mat_offt": "DT.MAT.OFFT",
    "mat_prvt": "DT.MAT.PRVT",
    "gpa_offt": "DT.GPA.OFFT",
    "gpa_prvt": "DT.GPA.PRVT",
    "com_offt": "DT.COM.OFFT.CD",
    "com_prvt": "DT.COM.PRVT.CD",
}
# The same series with China as the counterpart: all Chinese creditors, and the
# bilateral (official) part.
IDS_CHINA = {
    "china_service": "DT.TDS.DPPG.CD",
    "china_principal": "DT.AMT.DPPG.CD",
    "china_disb": "DT.DIS.DPPG.CD",
    "china_blat_service": "DT.TDS.BLAT.CD",
    "china_blat_principal": "DT.AMT.BLAT.CD",
    "china_blat_disb": "DT.DIS.BLAT.CD",
}
IDS_BULK = "https://datacatalogfiles.worldbank.org/ddh-published/0038015"
# Internet Archive captures of the December 2025 release's files, taken before
# the World Bank's April 2026 update replaced them.
IDS_FILES = {
    "DR0092201/A_D.xlsx": "20260103162412",
    "DR0092202/E_K.xlsx": "20260104024932",
    "DR0092203/L_M.xlsx": "20260104224736",
    "DR0093225/N_Q.xlsx": "20260103142238",
    "DR0092204/R_U.xlsx": "20260103135620",
    "DR0092205/V_Z.xlsx": "20260103150243",
}

type Sheet = Iterable[Sequence[object]]


def load_ids(view: View, *, paths: Paths, client: httpx.Client, ledger: Ledger) -> Panel:
    """Return the IDS series for the 58 countries from one release's bulk files.

    Downloads the six files into the view's cache folder once, records them in
    `ledger`, and keeps the parsed panel beside them in `panel.json` until the
    series list changes. The panel is checked against the view's base year.
    """
    # Imported here so the parsing helpers load without the HTTP client installed.
    from pipeline.sources.http import download

    folder = paths.cache / view.ids_dir
    files = []
    for name, capture in IDS_FILES.items():
        live = f"{IDS_BULK}/{name}"
        url = f"https://web.archive.org/web/{capture}id_/{live}" if view.archived else live
        path = download(url, folder / Path(name).name, client=client)
        files.append({"url": url, "bytes": path.stat().st_size})
    ledger.preload(
        {
            "name": f"World Bank International Debt Statistics, {view.ids} release, bulk files",
            "baseYear": view.base,
            "vintage": view.ids,
            "series": sorted({*IDS_WORLD.values(), *IDS_CHINA.values()}),
            "counterparts": ["World", "China"],
            "files": files,
        }
    )

    signature = sorted([key, code] for key, code in {**IDS_WORLD, **IDS_CHINA}.items())
    cached = folder / "panel.json"
    if cached.exists():
        stored = json.loads(cached.read_text())
        if stored["signature"] == signature:
            panel = {
                iso3: {k: {int(y): v for y, v in s.items()} for k, s in keys.items()}
                for iso3, keys in stored["panel"].items()
            }
            check_release(panel, view, paths=paths)
            return panel

    panel = read_ids_files(folder)
    cached.write_text(json.dumps({"signature": signature, "panel": panel}))
    check_release(panel, view, paths=paths)
    return panel


def read_ids_files(folder: Path) -> Panel:
    """Return the panel read from the six bulk files in `folder`.

    Raises `DataError` when the files disagree on a cell.
    """
    # Imported here so the parsing helpers load without the Calamine reader installed.
    from python_calamine import CalamineWorkbook

    def sheets() -> Iterator[Sheet]:
        for name in IDS_FILES:
            workbook = CalamineWorkbook.from_path(folder / Path(name).name)
            yield workbook.get_sheet_by_index(0).iter_rows()

    panel, conflicts = parse_ids_sheets(sheets())
    if conflicts:
        raise DataError(f"{conflicts} conflicting duplicate IDS cells in {folder}.")
    return panel


def parse_ids_sheets(sheets: Iterable[Sheet]) -> tuple[Panel, int]:
    """Return the wanted series and counterparts from IDS sheets, and the conflict count.

    Each sheet is an iterable of rows: a header whose cells from the seventh on are
    years, then data rows holding the country code in the first cell, the
    counterpart in the third and the series code in the sixth. A cell repeated in
    another sheet with a different value counts as a conflict; the first value stays.
    """
    collected: dict[str, dict[str, Series]] = {iso3: defaultdict(dict) for iso3 in ISO3}
    by_counterpart = {
        "World": {code: key for key, code in IDS_WORLD.items()},
        "China": {code: key for key, code in IDS_CHINA.items()},
    }
    conflicts = 0
    for sheet in sheets:
        rows = iter(sheet)
        years = [int(str(cell).removesuffix(".0")) for cell in next(rows)[6:]]
        for row in rows:
            iso3 = str(row[0]).strip()
            if iso3 not in collected:
                continue
            key = by_counterpart.get(str(row[2]).strip(), {}).get(str(row[5]).strip())
            if key is None:
                continue
            for year, cell in zip(years, row[6:], strict=True):
                # Empty cells and the text "NULL" both mean no value.
                if not isinstance(cell, int | float):
                    continue
                held = collected[iso3][key].setdefault(year, float(cell))
                if not math.isclose(held, cell, rel_tol=1e-9):
                    conflicts += 1
    return {iso3: dict(keys) for iso3, keys in collected.items()}, conflicts


def check_release(panel: Panel, view: View, *, paths: Paths) -> None:
    """Raise `DataError` when the files' last actual year is not the view's base year."""
    stocks = [keys.get("ppg_stock", {}) for keys in panel.values()]
    actual = sum(1 for s in stocks if view.base in s)
    later = sum(1 for s in stocks if view.base + 1 in s)
    if actual < len(ISO3) - MAX_MISSING or later > 0:
        raise DataError(
            f"the IDS files in {paths.cache / view.ids_dir} are not the "
            f"{view.ids} release: {actual} countries have a {view.base} debt stock "
            f"and {later} one for {view.base + 1}. Delete the folder to download again."
        )
