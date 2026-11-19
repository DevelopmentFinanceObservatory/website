"""Offline tests of the three read modes, with the SDK and the DFO stubbed."""

import json
import sys
from types import SimpleNamespace

import pytest

from pipeline.errors import DataError
from pipeline.sources.pinned import Mode, Reads

COMMITTED = {"k": {"ref": {"r": "old"}, "provenance": {"p": "old"}}}


def dataset(name: str, *, pinned: bool) -> SimpleNamespace:
    """A dataset whose ref and provenance write `name`, with one member."""
    return SimpleNamespace(
        ref=SimpleNamespace(
            to_json=lambda: json.dumps({"r": name}), same_data=lambda other: other == {"r": name}
        ),
        provenance=SimpleNamespace(
            pinned=pinned,
            members=[SimpleNamespace(pinned=pinned)],
            to_json=lambda: json.dumps({"p": name, "pinned": pinned}),
        ),
    )


class Client:
    """Returns `served` for every ref fetch, and records the calls."""

    def __init__(self, served: SimpleNamespace) -> None:
        self.served = served
        self.calls: list[tuple] = []

    def fetch(self, ref: dict, *, latest: bool, progress: bool) -> SimpleNamespace:
        self.calls.append(("fetch", ref, latest))
        return self.served

    def pin(self, data: SimpleNamespace) -> SimpleNamespace:
        self.calls.append(("pin",))
        return dataset(json.loads(data.ref.to_json())["r"], pinned=True)


class NotPinned(Exception):
    pass


@pytest.fixture(autouse=True)
def sdk(monkeypatch) -> None:
    def from_json(text: str) -> object:
        value = json.loads(text)
        return SimpleNamespace(members=value["members"]) if "members" in value else value

    monkeypatch.setitem(
        sys.modules,
        "dfo",
        SimpleNamespace(
            DatasetRef=SimpleNamespace(from_json=from_json),
            errors=SimpleNamespace(VersionNotPinnedError=NotPinned),
        ),
    )


def never() -> tuple:
    raise AssertionError("a ref read made a search")


def test_plain_fetches_the_committed_ref_and_keeps_its_record() -> None:
    client = Client(dataset("old", pinned=True))
    reads = Reads(client, mode=Mode.PLAIN, committed=COMMITTED)
    reads.fetch("k", never)
    assert client.calls == [("fetch", {"r": "old"}, False)]
    assert reads.records == COMMITTED
    assert reads.pins == 0


def test_plain_refuses_an_unpinned_ref_or_other_versions() -> None:
    reads = Reads(Client(dataset("old", pinned=False)), mode=Mode.PLAIN, committed=COMMITTED)
    with pytest.raises(DataError, match="not pinned"):
        reads.fetch("k", never)
    reads = Reads(Client(dataset("new", pinned=True)), mode=Mode.PLAIN, committed=COMMITTED)
    with pytest.raises(DataError, match="other versions"):
        reads.fetch("k", never)


def test_a_ref_mode_refuses_a_read_refs_json_lacks() -> None:
    reads = Reads(Client(dataset("old", pinned=True)), mode=Mode.REFRESH, committed={})
    with pytest.raises(DataError, match="--search"):
        reads.fetch("k", never)


def test_refresh_fetches_the_newest_versions_and_pins_them() -> None:
    client = Client(dataset("new", pinned=False))
    reads = Reads(client, mode=Mode.REFRESH, committed=COMMITTED)
    reads.fetch("k", never)
    assert client.calls == [("fetch", {"r": "old"}, True), ("pin",)]
    assert reads.records == {"k": {"ref": {"r": "new"}, "provenance": {"p": "new", "pinned": True}}}
    assert reads.pins == 1
    assert reads.readings == {}


def test_search_builds_the_read_keeps_its_reading_and_pins_unless_told_not_to() -> None:
    for pin, pins in ((True, 1), (False, 0)):
        client = Client(dataset("unused", pinned=True))
        reads = Reads(client, mode=Mode.SEARCH, committed=COMMITTED, pin=pin)
        reads.fetch("k", lambda: ({"answer": 1}, dataset("built", pinned=False)))
        assert reads.readings == {"k": {"answer": 1}}
        assert reads.records["k"]["provenance"] == {"p": "built", "pinned": pin}
        assert reads.pins == pins
        assert client.calls == ([("pin",)] if pin else [])


class Manifests:
    """Answers `file_url` for pinned members and refuses the others."""

    def __init__(self) -> None:
        self.read: list[str] = []

    def file_url(self, member: str) -> str:
        self.read.append(member)
        if member.startswith("unpinned"):
            raise NotPinned(member)
        return f"url/{member}"


def test_pinned_ref_checks_every_manifest_and_keeps_the_record() -> None:
    committed = {"k": {"ref": {"members": ["a", "b"]}, "provenance": {}}}
    client = Manifests()
    reads = Reads(client, mode=Mode.PLAIN, committed=committed)
    assert reads.pinned_ref("k").members == ["a", "b"]
    assert client.read == ["a", "b"]
    assert reads.records == committed


def test_pinned_ref_refuses_an_unpinned_member() -> None:
    committed = {"k": {"ref": {"members": ["a", "unpinned"]}, "provenance": {}}}
    reads = Reads(Manifests(), mode=Mode.PLAIN, committed=committed)
    with pytest.raises(DataError, match="not pinned"):
        reads.pinned_ref("k")
