"""What a run read and noted, and the provenance block of the output envelopes."""

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pipeline.config import View

type Record = dict[str, object]

QUERY = (
    "External public debt (PPG, and IMF credit for service): stock, service, principal "
    "and disbursements by creditor group, and GDP, for the 58 countries in "
    "FDL's March 2026 note, 2015 to 2031"
)


def citation(views: "Sequence[View]") -> str:
    """Return the citation line for thresholds.json and inputs.json, from the views' releases."""
    old, current = views
    return (
        f"World Bank International Debt Statistics ({old.ids} and {current.ids} "
        f"releases; {current.ids} read through the Development Finance Observatory) "
        f"and IMF World Economic Outlook ({old.weo[0]} {old.weo[1]} and "
        f"{current.weo[0]} {current.weo[1]})"
    )


class Ledger:
    """The notes, preloaded sources and DFO reads a run collects, in call order."""

    def __init__(self) -> None:
        self._notes: list[str] = []
        self._preloads: list[Record] = []
        self._reads: list[Record] = []

    def note(self, text: str) -> None:
        """Record a line for the Notes section of coverage.md."""
        self._notes.append(text)

    def preload(self, record: Record) -> None:
        """Record a source read from a file or a web page."""
        self._preloads.append(record)

    def read(self, record: Record) -> None:
        """Record a DFO reading."""
        self._reads.append(record)

    @property
    def notes(self) -> tuple[str, ...]:
        return tuple(self._notes)

    @property
    def preloads(self) -> tuple[Record, ...]:
        return tuple(self._preloads)

    @property
    def reads(self) -> tuple[Record, ...]:
        return tuple(self._reads)


def utc_stamp(moment: datetime) -> str:
    """Return a timezone-aware time in UTC with millisecond precision, as `...Z`."""
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def base_provenance(*, sdk_version: str, query: str, retrieved: str) -> dict:
    """Return the three provenance keys every data file carries."""
    return {"sdk": f"development-finance=={sdk_version}", "query": query, "retrieved": retrieved}


def envelope_provenance(ledger: Ledger, *, sdk_version: str, retrieved: str, citation: str) -> dict:
    """Return the provenance block of thresholds.json and inputs.json.

    `retrieved` is the UTC stamp of the run that pinned the refs. `dfo` lists each
    DFO read, whose ref and provenance refs.json holds.
    """
    return {
        **base_provenance(sdk_version=sdk_version, query=QUERY, retrieved=retrieved),
        "citation": citation,
        "dfo": list(ledger.reads),
        "preloads": list(ledger.preloads),
    }
