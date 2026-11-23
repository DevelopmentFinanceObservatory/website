"""Constants of the method, the two base-year views and the output paths."""

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Literal, Self

HORIZON = 6  # projected years after the base year, as in FDL's 2026 note
HISTORY = 8  # actual years before the base year that the page shows
FIRST_FLOW_YEAR = 2015  # net flows accumulate from here to the base year
REFERENCE_YEARS = range(2015, 2020)  # FDL's 2015-19 reference lending terms
TOLERANCE = 0.01
MAX_MISSING = 6
GROUPS = ("multilateral", "imf", "bilateral", "china", "private")
CORE = ("debt stock", "debt service", "GDP", "revenue")
CURRENT_BASE = 2025  # the base year of the view on current data


@dataclass(frozen=True)
class View:
    """One base year and the releases it is built on."""

    base: int
    ids: str
    # Cache folder of the IDS bulk files; None when the view reads IDS through the DFO.
    ids_dir: str | None
    archived: bool
    weo: tuple[Literal["April", "October"], int]
    capacity_as_of: str

    @property
    def end(self) -> int:
        """The last projected year."""
        return self.base + HORIZON

    @property
    def use_dfo(self) -> bool:
        """True when the view reads IDS and its base-year GDP through the DFO."""
        return self.ids_dir is None


def views(capacity_as_of: date, *, current_ids: str) -> tuple[View, View]:
    """The 2024 view on the archived releases and the 2025 view on current data.

    `capacity_as_of` stamps the current view's capacity vintage: the data step
    passes the day it reads the reference data, and the page's build the day
    reference.json records for the view, so neither stamps the build day.
    `current_ids` names the IDS release the DFO holds
    (`sources.dfo_api.ids_release`), so the label follows the data.
    """
    return (
        View(
            base=2024,
            ids="December 2025",
            ids_dir="ids-2025-12",
            archived=True,
            weo=("October", 2025),
            capacity_as_of="2026-03-14",
        ),
        View(
            base=CURRENT_BASE,
            ids=current_ids,
            ids_dir=None,
            archived=False,
            weo=("October", 2026),
            capacity_as_of=capacity_as_of.isoformat(),
        ),
    )


@dataclass(frozen=True)
class Paths:
    """Where a run writes its outputs and keeps its downloads."""

    out: Path
    cache: Path

    @classmethod
    def default(cls) -> Self:
        """The `_data` folder for outputs and the shared prototype cache."""
        return cls(
            out=Path(__file__).resolve().parent.parent,
            cache=Path.home() / ".cache" / "dfo-prototypes" / "debt-thresholds",
        )
