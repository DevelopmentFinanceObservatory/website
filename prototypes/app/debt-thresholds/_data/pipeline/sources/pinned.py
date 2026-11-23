"""Each DFO read as a committed ref, fetched the way the run's mode says.

The data step (`pipeline.run`) runs in one of three modes, and the page's build
(`pipeline.stored`) in a fourth:

- `plain` fetches the ref refs.json holds for each read and keeps the read's
  committed record, so the outputs reproduce byte for byte. It refuses a ref
  whose members are not all pinned.
- `refresh` fetches the newest versions of each committed ref and records the
  new ref and its provenance. A ref keeps its spec and window.
- `search` builds each read from its series code and records it, with Search's
  answer beside it. A change of spec or window takes this mode.
- `stored` fetches the version DFO stores as the newest of each committed ref's
  spec, with no Search call, no pin and no check that the version is pinned, and
  records the versions read and DFO's freshness for the build.

In `refresh` and `search`, `Reads.keep` pins the new reads once the run's checks hold, so a run
that fails them spends none of the day's pins.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable, Mapping
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from pipeline.errors import DataError

if TYPE_CHECKING:
    import dfo

log = logging.getLogger("pipeline")

type Record = dict[str, Any]


class Mode(StrEnum):
    PLAIN = "plain"
    REFRESH = "refresh"
    SEARCH = "search"
    STORED = "stored"


class Reads:
    """The reads of one run: fetches each one and keeps its `{ref, provenance}` record.

    `committed` is the `data` of refs.json, by read key. `pin` False leaves new
    versions unpinned in `keep`, for a trial run written outside `_data`.
    """

    def __init__(
        self,
        client: dfo.Client,
        *,
        mode: Mode,
        committed: Mapping[str, Record],
        pin: bool = True,
    ) -> None:
        self.client = client
        self.mode = mode
        self.pin = pin
        self._committed = committed
        self.records: dict[str, Record] = {}
        self.readings: dict[str, Record] = {}
        self.fetched: dict[str, dfo.Dataset] = {}
        # Each `stored` read's versions and freshness, by read key.
        self.sources: dict[str, Record] = {}
        self.pins = 0

    def fetch(self, key: str, build: Callable[[], tuple[Record, dfo.Dataset]]) -> dfo.Dataset:
        """Return the read `key`'s dataset.

        In `search` mode `build` makes the read and returns its reading record,
        such as Search's answer, with the data. A read fetched anew is recorded
        unpinned until `keep` pins it.
        """
        import dfo

        if self.mode is Mode.SEARCH:
            reading, data = build()
            self.readings[key] = reading
        elif self.mode is Mode.STORED:
            data = self.client.fetch(self.committed_ref(key), latest="stored", progress=False)
            self.read_stored(key, data)
            return data
        else:
            entry = self._entry(key)
            ref = dfo.DatasetRef.from_json(json.dumps(entry["ref"]))
            data = self.client.fetch(ref, latest=self.mode is Mode.REFRESH, progress=False)
            if self.mode is Mode.PLAIN:
                if not data.ref.same_data(ref):
                    raise DataError(
                        f"the DFO returned other versions than refs.json names for {key}."
                    )
                if not data.provenance.pinned:
                    raise DataError(f"refs.json's {key} is not pinned; run with --refresh.")
                self.records[key] = dict(entry)
                return data

        self.fetched[key] = data
        self._record(key, data)
        return data

    def keep(self) -> None:
        """Pin each read fetched anew, unless told not to, and record its ref and provenance.

        Call it once the run's checks hold.
        """
        for key, data in self.fetched.items():
            if self.pin:
                self.pins += sum(not member.pinned for member in data.provenance.members)
                self._record(key, self.client.pin(data))

    def _record(self, key: str, data: dfo.Dataset) -> None:
        record: Record = {
            "ref": json.loads(data.ref.to_json()),
            "provenance": json.loads(data.provenance.to_json()),
        }
        # A refresh keeps the reading the last search recorded.
        reading = self.readings.get(key) or self._committed.get(key, {}).get("reading")
        if reading is not None:
            record["reading"] = reading
        self.records[key] = record

    def committed_ref(self, key: str) -> dfo.DatasetRef:
        """Return the ref refs.json holds for `key`, without a request."""
        import dfo

        return dfo.DatasetRef.from_json(json.dumps(self._entry(key)["ref"]))

    def analyse(self, key: str, ref: dfo.DatasetRef, verb: str, **arguments: object) -> dfo.Dataset:
        """Run one of DFO's operations on `ref`, read `key`, as `client.analysis.<verb>`.

        In `stored` mode the operation runs on the version DFO stores as the newest
        of `ref`'s spec, and what it read is recorded under `key`; in the others, on
        `ref`'s own version.
        """
        import dfo

        if self.mode is not Mode.STORED:
            return getattr(self.client.analysis, verb)(ref, **arguments)
        recipe = getattr(dfo.analysis.recipe(ref), verb)(**arguments)
        data = self.client.fetch(recipe, latest="stored")
        self.read_stored(key, data)
        return data

    def read_stored(self, key: str, data: dfo.Dataset) -> None:
        """Add the versions `data` read and its freshness to `key`'s source record.

        A ref member gives its own version, a recipe's member each root it ran on.
        The freshness is the worst of the reads': `stale`, then `pending`, then
        `current`; None when any read stated none.
        """
        source = self.sources.setdefault(key, {"versions": [], "freshness": "current"})
        for member in data.ref.members:
            roots = getattr(member, "roots", None)
            versions = (
                [(root.spec_id, root.content_version) for root in roots]
                if roots is not None
                else [(member.spec.spec_id, member.content_version)]
            )
            for spec_id, version in versions:
                entry = {"specId": spec_id, "contentVersion": version}
                if entry not in source["versions"]:
                    source["versions"].append(entry)
        source["freshness"] = worst_freshness(source["freshness"], data.freshness)

    def pinned_ref(self, key: str) -> dfo.DatasetRef:
        """Return the committed ref of `key` without downloading its rows, in `plain` mode.

        Each member's manifest is read to check it is pinned; the read's committed
        record is kept. Raises `DataError` for a read refs.json lacks or one not pinned.
        """
        import dfo

        ref = self.committed_ref(key)
        for member in ref.members:
            try:
                self.client.file_url(member)
            except dfo.errors.VersionNotPinnedError as error:
                raise DataError(f"refs.json's {key} is not pinned; run with --refresh.") from error
        self.records[key] = dict(self._entry(key))
        return ref

    def _entry(self, key: str) -> Record:
        entry = self._committed.get(key)
        if entry is None:
            raise DataError(f"refs.json has no read {key!r}; run with --search.")
        return entry

    def provenance(self, key: str) -> Record:
        """Return the provenance record of a read this run made."""
        return self.records[key]["provenance"]


FRESHNESS_ORDER = ("current", "pending", "stale")


def worst_freshness(first: str | None, second: str | None) -> str | None:
    """Return the worse of two freshness values; None when either is None."""
    if first is None or second is None:
        return None
    return max(first, second, key=FRESHNESS_ORDER.index)
