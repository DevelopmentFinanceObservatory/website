"""What a run read and noted, and the provenance block of the output envelopes."""

from collections.abc import Sequence
from datetime import UTC, datetime

type Record = dict[str, object]


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


def outside_provenance(
    preloads: Sequence[Record], *, sdk_version: str, query: str, retrieved: str
) -> dict:
    """Return the provenance block of a committed file whose data comes from outside DFO.

    `outside` names each source, from the `preloads` the file was built on, which
    `pnpm check:data` requires of every committed data file a build-read page
    keeps beside its refs. `retrieved` is the UTC stamp of the run that pinned the refs.
    """
    return {
        **base_provenance(sdk_version=sdk_version, query=query, retrieved=retrieved),
        "outside": list(dict.fromkeys(str(preload["name"]) for preload in preloads)),
        "preloads": list(preloads),
    }
