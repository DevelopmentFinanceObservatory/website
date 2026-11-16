from datetime import date
from pathlib import Path

from pipeline.config import HORIZON, Paths, views


def test_views_stamp_current_capacity_with_today():
    old, current = views(date(2026, 11, 16), current_ids="November 2026")
    assert (old.base, current.base) == (2024, 2025)
    assert old.capacity_as_of == "2026-03-14"
    assert current.capacity_as_of == "2026-11-16"
    assert (old.use_dfo, current.use_dfo) == (False, True)


def test_view_end_adds_horizon():
    assert views(date(2026, 1, 1), current_ids="November 2026")[1].end == 2025 + HORIZON


def test_default_paths_point_at_data_folder():
    paths = Paths.default()
    assert (paths.out / "capacity.csv").exists()
    assert paths.cache == Path.home() / ".cache" / "dfo-prototypes" / "debt-thresholds"
