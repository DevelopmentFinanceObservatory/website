"""The step's checks and its pin and write order, over stubbed reads.

Each read is a `FakeRead` holding a small frame that passes every check. Kenya and Uganda are
the aid read's recipient countries, and the deaths read binds both by default.
"""

import json
from dataclasses import dataclass, replace
from types import SimpleNamespace

import dfo
import pandas as pd
import pytest

import fetch

PLACES = ("country/KEN", "country/UGA")


@dataclass(frozen=True)
class FakeRead:
    """What the step reads of a `dfo.Dataset`."""

    rows: tuple[dict, ...]
    places: tuple[str, ...] = ()
    pinned: bool = False
    sentence: str = "a stubbed read"

    def __len__(self) -> int:
        return len(self.rows)

    def to_pandas(self) -> pd.DataFrame:
        return pd.DataFrame(list(self.rows))

    @property
    def members(self) -> tuple[SimpleNamespace, ...]:
        roles = {"place": self.places} if self.places else {}
        return (SimpleNamespace(spec=SimpleNamespace(roles=roles)),)

    @property
    def ref(self) -> SimpleNamespace:
        return SimpleNamespace(to_json=lambda: json.dumps({"pinned": self.pinned}))

    @property
    def provenance(self) -> SimpleNamespace:
        return SimpleNamespace(warnings=(), to_json=lambda: json.dumps({"warnings": []}))


def aid_read() -> FakeRead:
    return FakeRead(
        tuple(
            {"financingRecipient": place, "financingProvider": fetch.GLOBAL_FUND}
            for place in (*PLACES, "AfricaUnallocated")
        )
    )


def gf_read(code: str, provider: str = fetch.GLOBAL_FUND) -> FakeRead:
    return FakeRead(({"crsPurpose": code, "financingProvider": provider},))


def unaids_read(*stat_vars: str, places: tuple[str, ...] = ()) -> FakeRead:
    return FakeRead(tuple({"stat_var": stat_var} for stat_var in stat_vars), places=places)


def reads(**changes: FakeRead) -> dict[str, FakeRead]:
    """Reads that pass every check, with `changes` in place of some."""
    return {
        "aid": aid_read(),
        "gf-12250": gf_read("CRSPurposeCode12250"),
        "gf-12110": gf_read("CRSPurposeCode12110"),
        "plhiv": unaids_read("s"),
        "art": unaids_read("s"),
        "deaths": unaids_read("s", places=PLACES),
        **changes,
    }


@pytest.fixture
def step(tmp_path, monkeypatch):
    """`run` runs `fetch.main` with `--refresh` in `tmp_path` over `newest`; `pins` lists each
    read pinned."""
    for name in ("REFS", "LIVE_REFS"):
        monkeypatch.setattr(fetch, name, tmp_path / getattr(fetch, name).name)

    fetch.REFS.write_text(
        json.dumps({"data": {key: {"ref": {}, "provenance": {}} for key in reads()}})
    )
    fetch.LIVE_REFS.write_text("{}")
    pins = []

    def pin(data: FakeRead) -> FakeRead:
        pins.append(data)
        return replace(data, pinned=True)

    monkeypatch.setattr(dfo, "pin", pin)

    def run(newest: dict[str, FakeRead], *argv: str) -> None:
        monkeypatch.setattr(
            fetch, "fetch_refs", lambda records, *, latest: {key: newest[key] for key in records}
        )
        fetch.main(["--refresh", *argv])

    return SimpleNamespace(run=run, pins=pins)


def test_a_refresh_that_passes_pins_each_read_and_writes_both_refs_files(step):
    step.run(reads())

    assert len(step.pins) == len(fetch.AID_KEYS) + len(fetch.UNAIDS_KEYS)
    assert json.loads(fetch.REFS.read_text())["data"]["aid"]["ref"] == {"pinned": True}
    assert set(json.loads(fetch.LIVE_REFS.read_text())["data"]) == {
        *fetch.UNAIDS_KEYS,
        *fetch.AID_KEYS,
    }


def test_no_pin_pins_nothing_and_leaves_the_refs_files(step):
    refs, live = fetch.REFS.read_text(), fetch.LIVE_REFS.read_text()

    step.run(reads(), "--no-pin")

    assert step.pins == []
    assert (fetch.REFS.read_text(), fetch.LIVE_REFS.read_text()) == (refs, live)


@pytest.mark.parametrize(
    "newest",
    [
        pytest.param(reads(deaths=unaids_read("s", places=PLACES[:1])), id="outside deaths"),
        pytest.param(reads(art=unaids_read("s", "t")), id="two stat vars"),
        pytest.param(reads(**{"gf-12110": gf_read("CRSPurposeCode12250")}), id="gf code"),
        pytest.param(reads(**{"gf-12250": gf_read("CRSPurposeCode12250", "x")}), id="gf provider"),
    ],
)
def test_a_refresh_that_fails_a_check_fails_before_any_pin_or_write(step, newest):
    refs = fetch.REFS.read_text()

    with pytest.raises(SystemExit):
        step.run(newest)

    assert step.pins == []
    assert fetch.REFS.read_text() == refs


def test_aid_countries_are_the_country_recipients():
    assert fetch.aid_countries(aid_read().to_pandas()) == ["KEN", "UGA"]


def test_outside_places_names_countries_the_read_does_not_bind():
    assert fetch.outside_places(["KEN", "UGA"], {"country/KEN"}) == ["UGA"]
    assert fetch.outside_places(["KEN"], {"country/KEN", "country/UGA"}) == []
