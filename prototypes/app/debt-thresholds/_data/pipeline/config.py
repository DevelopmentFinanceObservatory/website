"""Constants of the method, the two base-year views and the output paths."""

from dataclasses import dataclass
from datetime import date, datetime
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


@dataclass(frozen=True)
class View:
    """One base year and the releases it is built on."""

    base: int
    ids: str
    ids_dir: str
    archived: bool
    weo: tuple[Literal["April", "October"], int]
    capacity_as_of: str
    use_dfo: bool

    @property
    def end(self) -> int:
        """The last projected year."""
        return self.base + HORIZON


def release_dir(release: str) -> str:
    """Return the cache folder name for an IDS release named "November 2026": `ids-2026-11`.

    The current view's bulk files and parsed panel live in this folder, so a new
    release downloads and parses afresh instead of reusing an older one's files.
    """
    return f"ids-{datetime.strptime(release, '%B %Y'):%Y-%m}"


def views(today: date, *, current_ids: str) -> tuple[View, View]:
    """The 2024 view on the archived releases and the 2025 view on current data.

    `today` stamps the current view's capacity vintage, so the clock is read by
    the caller and not at import. `current_ids` names the IDS release the DFO
    holds (`sources.dfo_api.ids_release`), so the label and the cache folder
    follow the data.
    """
    return (
        View(
            base=2024,
            ids="December 2025",
            ids_dir="ids-2025-12",
            archived=True,
            weo=("October", 2025),
            capacity_as_of="2026-03-14",
            use_dfo=False,
        ),
        View(
            base=2025,
            ids=current_ids,
            ids_dir=release_dir(current_ids),
            archived=False,
            weo=("October", 2026),
            capacity_as_of=today.isoformat(),
            use_dfo=True,
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
