"""Offline tests for the IDS bulk-file parser and the release check."""

from datetime import date
from pathlib import Path

import pytest

from pipeline.config import Paths, views
from pipeline.countries import ISO3
from pipeline.errors import DataError
from pipeline.sources.ids_bulk import IDS_CHINA, IDS_WORLD, check_release, parse_ids_sheets

HEADER = ["Country Code", "Name", "Counterpart", "x", "y", "Series Code", 2023.0, 2024.0]


def row(iso3: str, counterpart: str, code: str, *cells: object) -> list[object]:
    return [iso3, "n", counterpart, "", "", code, *cells]


def test_parse_keeps_wanted_series_and_skips_the_rest():
    sheet = [
        HEADER,
        row("KEN", "World", IDS_WORLD["ppg_stock"], 1.0, "NULL"),
        row("KEN", "China", IDS_CHINA["china_service"], None, 5),
        row("KEN", "World", "NOT.A.SERIES", 9.0, 9.0),
        row("XXX", "World", IDS_WORLD["ppg_stock"], 9.0, 9.0),
    ]
    panel, conflicts = parse_ids_sheets([sheet])
    assert conflicts == 0
    assert panel["KEN"] == {"ppg_stock": {2023: 1.0}, "china_service": {2024: 5.0}}
    assert "XXX" not in panel


def test_parse_counts_conflicting_duplicates_across_sheets():
    first = [HEADER, row("KEN", "World", IDS_WORLD["ppg_stock"], 1.0, 2.0)]
    second = [HEADER, row("KEN", "World", IDS_WORLD["ppg_stock"], 1.0, 3.0)]
    panel, conflicts = parse_ids_sheets([first, second])
    assert conflicts == 1
    assert panel["KEN"]["ppg_stock"] == {2023: 1.0, 2024: 2.0}


def test_check_release_refuses_a_release_with_later_actuals(tmp_path: Path):
    view = views(date(2026, 11, 16), current_ids="November 2026")[0]
    paths = Paths(out=tmp_path, cache=tmp_path)
    good = {iso3: {"ppg_stock": {view.base: 1.0}} for iso3 in ISO3}
    check_release(good, view, paths=paths)
    later = {iso3: {"ppg_stock": {view.base: 1.0, view.base + 1: 1.0}} for iso3 in ISO3}
    with pytest.raises(DataError, match="are not the December 2025 release"):
        check_release(later, view, paths=paths)
