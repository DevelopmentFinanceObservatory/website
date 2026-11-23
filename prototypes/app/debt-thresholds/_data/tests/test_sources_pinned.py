"""Offline tests of the three read modes, with the SDK and the DFO stubbed."""

import json
import sys
from types import SimpleNamespace

import pytest

from pipeline.errors import DataError
from pipeline.sources.pinned import Mode, Reads, worst_freshness

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


def test_refresh_fetches_the_newest_versions_and_pins_them_only_in_keep() -> None:
    client = Client(dataset("new", pinned=False))
    reads = Reads(client, mode=Mode.REFRESH, committed=COMMITTED)
    reads.fetch("k", never)
    assert client.calls == [("fetch", {"r": "old"}, True)]
    assert reads.records["k"]["provenance"] == {"p": "new", "pinned": False}
    reads.keep()
    assert client.calls == [("fetch", {"r": "old"}, True), ("pin",)]
    assert reads.records == {"k": {"ref": {"r": "new"}, "provenance": {"p": "new", "pinned": True}}}
    assert reads.pins == 1
    assert reads.readings == {}


def test_search_builds_the_read_keeps_its_reading_and_pins_unless_told_not_to() -> None:
    for pin, pins in ((True, 1), (False, 0)):
        client = Client(dataset("unused", pinned=True))
        reads = Reads(client, mode=Mode.SEARCH, committed=COMMITTED, pin=pin)
        reads.fetch("k", lambda: ({"answer": 1}, dataset("built", pinned=False)))
        assert client.calls == []
        reads.keep()
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


def stored(members: list, freshness: str | None) -> SimpleNamespace:
    """A dataset a `latest="stored"` read returns, with `members` and `freshness`."""
    return SimpleNamespace(ref=SimpleNamespace(members=members), freshness=freshness)


def member(spec_id: str, version: str) -> SimpleNamespace:
    return SimpleNamespace(spec=SimpleNamespace(spec_id=spec_id), content_version=version)


def derived(*roots: tuple[str, str]) -> SimpleNamespace:
    return SimpleNamespace(
        roots=[SimpleNamespace(spec_id=spec_id, content_version=cv) for spec_id, cv in roots]
    )


class StoredClient:
    """Answers each fetch with the next of `served`, and records what was fetched."""

    def __init__(self, *served: SimpleNamespace) -> None:
        self.served = list(served)
        self.calls: list[tuple] = []

    def fetch(self, target: object, **options: object) -> SimpleNamespace:
        self.calls.append((target, options))
        return self.served.pop(0)


def test_stored_reads_the_newest_stored_version_and_records_versions_and_freshness() -> None:
    committed = {"k": {"ref": {"members": ["a"]}, "provenance": {}}}
    client = StoredClient(stored([member("spec_1", "cv_new")], "pending"))
    reads = Reads(client, mode=Mode.STORED, committed=committed)
    reads.fetch("k", never)
    assert client.calls == [
        (SimpleNamespace(members=["a"]), {"latest": "stored", "progress": False})
    ]
    assert reads.sources == {
        "k": {
            "versions": [{"specId": "spec_1", "contentVersion": "cv_new"}],
            "freshness": "pending",
        }
    }
    # A stored read pins nothing and records no ref for refs.json.
    reads.keep()
    assert reads.records == {}
    assert reads.pins == 0


def test_stored_analyse_runs_a_recipe_and_keeps_each_root_once_and_the_worst_freshness(
    monkeypatch,
) -> None:
    steps: list = []

    class Recipe:
        def __init__(self, ref: object) -> None:
            self.ref = ref

        def filter(self, **arguments: object) -> tuple:
            steps.append(("filter", arguments))
            return ("recipe", self.ref, "filter")

        def aggregate(self, **arguments: object) -> tuple:
            steps.append(("aggregate", arguments))
            return ("recipe", self.ref, "aggregate")

    monkeypatch.setattr(
        sys.modules["dfo"], "analysis", SimpleNamespace(recipe=Recipe), raising=False
    )
    client = StoredClient(
        stored([derived(("spec_1", "cv_1"))], "current"),
        stored([derived(("spec_1", "cv_1"), ("spec_2", "cv_2"))], "stale"),
    )
    reads = Reads(client, mode=Mode.STORED, committed={})
    reads.analyse("k", "ref", "filter", keep={"origin": "x"})
    reads.analyse("k", "ref", "aggregate", by="destination")
    assert steps == [("filter", {"keep": {"origin": "x"}}), ("aggregate", {"by": "destination"})]
    assert [call[1] for call in client.calls] == [{"latest": "stored"}] * 2
    assert reads.sources["k"] == {
        "versions": [
            {"specId": "spec_1", "contentVersion": "cv_1"},
            {"specId": "spec_2", "contentVersion": "cv_2"},
        ],
        "freshness": "stale",
    }


def test_a_read_without_a_stated_freshness_leaves_its_key_unknown() -> None:
    client = StoredClient(stored([member("s", "a")], "current"), stored([member("s", "a")], None))
    reads = Reads(client, mode=Mode.STORED, committed={"k": {"ref": {}, "provenance": {}}})
    reads.fetch("k", never)
    reads.fetch("k", never)
    assert reads.sources["k"]["freshness"] is None


def test_other_modes_analyse_on_the_refs_own_version() -> None:
    analysis = SimpleNamespace(filter=lambda ref, **arguments: ("filtered", ref, arguments))
    reads = Reads(SimpleNamespace(analysis=analysis), mode=Mode.PLAIN, committed={})
    assert reads.analyse("k", "ref", "filter", keep={"origin": "x"}) == (
        "filtered",
        "ref",
        {"keep": {"origin": "x"}},
    )
    assert reads.sources == {}


def test_a_refresh_keeps_the_reading_the_last_search_recorded() -> None:
    committed = {"k": {"ref": {"r": "old"}, "provenance": {}, "reading": {"code": "X"}}}
    reads = Reads(Client(dataset("new", pinned=False)), mode=Mode.REFRESH, committed=committed)
    reads.fetch("k", never)
    reads.keep()
    assert reads.records["k"]["reading"] == {"code": "X"}
    assert reads.records["k"]["ref"] == {"r": "new"}


def test_a_search_records_its_reading_beside_the_ref() -> None:
    committed = {"k": {"ref": {"r": "old"}, "provenance": {}, "reading": {"code": "old"}}}
    reads = Reads(Client(dataset("unused", pinned=True)), mode=Mode.SEARCH, committed=committed)
    reads.fetch("k", lambda: ({"code": "new"}, dataset("built", pinned=False)))
    reads.keep()
    assert reads.records["k"]["reading"] == {"code": "new"}


@pytest.mark.parametrize(
    ("first", "second", "combined"),
    [
        # Pending wins, so a stale or unknown read cannot hide one the build would read again.
        ("stale", "pending", "pending"),
        ("pending", None, "pending"),
        (None, "stale", None),
        ("current", "stale", "stale"),
        ("current", "current", "current"),
    ],
)
def test_worst_freshness_keeps_pending_over_every_other_state(first, second, combined) -> None:
    assert worst_freshness(first, second) == combined
    assert worst_freshness(second, first) == combined


def test_a_spec_read_at_two_versions_makes_every_key_that_read_it_pending() -> None:
    committed = {key: {"ref": {}, "provenance": {}} for key in ("a", "b", "c")}
    client = StoredClient(
        stored([member("spec_1", "cv_old")], "current"),
        stored([member("spec_2", "cv_2")], "current"),
        stored([derived(("spec_1", "cv_new"))], "current"),
    )
    reads = Reads(client, mode=Mode.STORED, committed=committed)
    for key in ("a", "b", "c"):
        reads.fetch(key, never)
    assert {key: source["freshness"] for key, source in reads.sources.items()} == {
        "a": "pending",
        "b": "current",
        "c": "pending",
    }
