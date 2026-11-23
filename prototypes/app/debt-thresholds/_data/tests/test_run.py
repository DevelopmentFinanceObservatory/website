"""Offline tests of `main`'s order: checks, then pins, then the refs files."""

import importlib
import sys
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

import pytest

from pipeline.config import Paths
from pipeline.errors import DataError

events: list[str] = []


class Reads:
    """Records when the run pins its reads."""

    def __init__(self, client: object, *, mode: object, committed: object, pin: bool) -> None:
        self.mode = mode
        self.pin = pin
        self.pins = 0

    def keep(self) -> None:
        events.append(f"keep pin={self.pin}")


@pytest.fixture
def run(monkeypatch, tmp_path: Path) -> SimpleNamespace:
    """`pipeline.run` with the SDK, the network reads and the builds stubbed.

    The module imports httpx, which the test environment lacks, so it is imported
    afresh over a stub and dropped again after the test. Its `outcome` sets the
    checks' result.
    """
    monkeypatch.setitem(sys.modules, "httpx", SimpleNamespace())
    monkeypatch.delitem(sys.modules, "pipeline.run", raising=False)
    module = importlib.import_module("pipeline.run")
    monkeypatch.setitem(sys.modules, "pipeline.run", module)
    events.clear()
    outcome: dict = {"code": 0, "raise": None}

    def build_thresholds(out: Path, **_: object) -> int:
        events.append("thresholds")
        if outcome["raise"]:
            raise DataError(outcome["raise"])
        return outcome["code"]

    def write_refs(out: Path, *_: object, **__: object) -> None:
        events.append(f"refs into {out}")

    stubs = {
        "dfo": SimpleNamespace(Client=lambda **_: nullcontext(object()), __version__="0.4.1"),
        "httpx": SimpleNamespace(Client=lambda: nullcontext(object())),
        "Reads": Reads,
        "ids_release": lambda: "November 2026",
        "view_snapshots": lambda *_, **__: {},
        "build_thresholds": build_thresholds,
        "build_transfer_file": lambda *_, **__: events.append("transfers"),
        "write_refs": write_refs,
    }
    for name, stub in stubs.items():
        monkeypatch.setattr(module, name, stub)
    monkeypatch.setattr(module.tempfile, "mkdtemp", lambda prefix: str(tmp_path / prefix))
    return SimpleNamespace(main=module.main, outcome=outcome)


def test_refresh_pins_after_the_checks_and_before_the_refs(run, tmp_path: Path) -> None:
    assert run.main(["--refresh", "--out", str(tmp_path)]) == 0
    assert events == ["thresholds", "transfers", "keep pin=True", f"refs into {tmp_path}"]


@pytest.mark.parametrize("outcome", [{"code": 1}, {"raise": "actual stocks end in 2023"}])
def test_a_refresh_that_fails_its_checks_pins_nothing(run, tmp_path, outcome) -> None:
    run.outcome.update(outcome)
    assert run.main(["--search", "--out", str(tmp_path)]) == 1
    assert not [event for event in events if event.startswith(("keep", "refs"))]


def test_no_pin_writes_outside_data(run) -> None:
    assert run.main(["--refresh", "--no-pin"]) == 0
    written = Path(events[-1].removeprefix("refs into "))
    assert events[-2] == "keep pin=False"
    assert not written.resolve().is_relative_to(Paths.default().out.resolve())


@pytest.mark.parametrize("out", [Paths.default().out, Paths.default().out / "trial"])
def test_no_pin_refuses_an_out_inside_data(run, out: Path) -> None:
    with pytest.raises(SystemExit) as exit_:
        run.main(["--refresh", "--no-pin", "--out", str(out)])
    assert exit_.value.code == 2
    assert events == []
