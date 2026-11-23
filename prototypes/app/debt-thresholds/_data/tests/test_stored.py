"""Offline tests of the page's build of the 2025 view: its output and its failures."""

import json
import shutil
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

import pytest

from pipeline import stored
from pipeline.build import Assembled
from pipeline.config import Paths
from pipeline.countries import ISO3
from pipeline.errors import DataError

DATA = Paths.default().out


@pytest.fixture
def build(monkeypatch) -> SimpleNamespace:
    """`stored.main` with the SDK, the DFO reads and the view's assembly stubbed.

    `state["missing"]` sets the countries lacking a core series, `state["raise"]`
    a refusal of the DFO reads, `state["releases"]` the IDS release each lookup
    answers in turn, and `state["transfers"]` the members whose net transfers
    the run read.
    """
    state: dict = {
        "missing": [],
        "raise": None,
        "clients": [],
        "releases": ["November 2026", "November 2026"],
        "transfers": None,
    }

    def read_net_transfers(iso3s, *, reads):
        state["transfers"] = list(iso3s)
        return []

    def client(**options: object):
        state["clients"].append(options)
        return nullcontext(object())

    def fetch_dfo(view, *, reads, ledger):
        if state["raise"]:
            raise DataError(state["raise"])
        assert reads.mode is stored.Mode.STORED
        reads.sources["service"] = {"versions": [], "freshness": "current"}
        return {}, {}

    def assemble_view(view, panel, **_: object) -> Assembled:
        return Assembled(
            bases={iso3: {"year": view.base} for iso3 in ISO3},
            inputs={},
            coverage=[],
            missing=state["missing"],
            check={"guard": {"checked": 1, "failed": 0, "failures": []}},
        )

    stubs = {
        "dfo": SimpleNamespace(Client=client, errors=SimpleNamespace(DfoError=RuntimeError)),
        "ids_release": lambda client: state["releases"].pop(0),
        "fetch_dfo": fetch_dfo,
        "read_net_transfers": read_net_transfers,
        "assemble_view": assemble_view,
        "read_weo_file": lambda path, view: {},
    }
    for name, stub in stubs.items():
        monkeypatch.setattr(stored, name, stub)
    return SimpleNamespace(main=stored.main, state=state)


def test_prints_the_2025_view_and_the_versions_read(build, capsys) -> None:
    assert build.main([]) == 0
    out = json.loads(capsys.readouterr().out)
    assert list(out) == ["view", "defaultYear", "sources"]
    assert out["view"]["year"] == 2025
    assert out["view"]["vintage"]["ids"] == "November 2026"
    assert [country["iso3"] for country in out["view"]["countries"]] == list(ISO3)
    assert out["defaultYear"] == 2025
    assert out["sources"] == {"service": {"versions": [], "freshness": "current"}}
    # The capacity vintage is the day reference.json records for the view, not the build day.
    reference = json.loads((DATA / "reference.json").read_text())["data"]
    assert out["view"]["vintage"]["capacityAsOf"] == reference["views"]["2025"]["read"]
    # It reads the 75 members' net transfers, for the build to check their version.
    assert len(build.state["transfers"]) == 75
    # The build reads anonymously.
    assert build.state["clients"][0]["api_key"] is False
    # It names itself, so DFO's analytics counts its reads as the build's.
    assert build.state["clients"][0]["headers"] == {"User-Agent": stored.BUILD_USER_AGENT}
    assert stored.BUILD_USER_AGENT == "dfo-prototypes-build/1"


def test_opens_on_2024_when_too_many_countries_lack_a_core_series(build, capsys) -> None:
    build.state["missing"] = list(ISO3[:7])
    assert build.main([]) == 0
    captured = capsys.readouterr()
    assert json.loads(captured.out)["defaultYear"] == 2024
    assert "the page opens on 2024" in captured.err


def test_a_refused_read_exits_1_with_the_reason_and_prints_no_view(build, capsys) -> None:
    build.state["raise"] = "actual stocks end in 2026"
    assert build.main([]) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "actual stocks end in 2026" in captured.err


def test_an_ids_release_that_changes_while_the_run_reads_exits_1(build, capsys) -> None:
    build.state["releases"] = ["November 2026", "December 2026"]
    assert build.main([]) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "changed from November 2026 to December 2026" in captured.err


def test_a_missing_committed_file_exits_1_before_any_read(
    build, capsys, monkeypatch, tmp_path: Path
) -> None:
    for name in ("refs.json", "reference.json", "groups.csv", "weo-2025.json"):
        shutil.copy(DATA / name, tmp_path / name)
    monkeypatch.setattr(stored, "Paths", SimpleNamespace(default=lambda: Paths(tmp_path, tmp_path)))
    assert build.main([]) == 1
    assert "capacity.csv is missing" in capsys.readouterr().err
    assert build.state["clients"] == []
