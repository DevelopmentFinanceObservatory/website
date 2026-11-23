"""Offline tests of the page's build of the 2025 view: its output and its failures."""

import json
from contextlib import nullcontext
from types import SimpleNamespace

import pytest

from pipeline import stored
from pipeline.build import Assembled
from pipeline.countries import ISO3
from pipeline.errors import DataError


@pytest.fixture
def build(monkeypatch) -> SimpleNamespace:
    """`stored.main` with the SDK, the DFO reads and the view's assembly stubbed.

    `state["missing"]` sets the countries lacking a core series, and
    `state["raise"]` a refusal of the DFO reads.
    """
    state: dict = {"missing": [], "raise": None, "clients": []}

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
        "ids_release": lambda client: "November 2026",
        "fetch_dfo": fetch_dfo,
        "assemble_view": assemble_view,
        "read_weo_file": lambda path: {},
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
    # The build reads anonymously.
    assert build.state["clients"][0]["api_key"] is False


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
