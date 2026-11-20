"""The step's checks and its pin and write order, over stubbed reads.

Each read is a `FakeRead` holding a small frame that passes every check in `fetch.check`.
Kenya and Uganda are the kept countries; the deaths read binds both by default.
"""

import json
from dataclasses import dataclass, field, replace
from types import SimpleNamespace

import dfo
import pandas as pd
import pytest

import fetch

YEARS = fetch.YEARS
UNIT = {"currency": "USD", "price_basis": "constant", "base_year": fetch.PRICE_BASE}
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
        return SimpleNamespace(
            warnings=(), to_json=lambda: json.dumps({"citation": {"text": "a citation"}})
        )


def aid_rows() -> tuple[dict, ...]:
    gives = [
        ("country/KEN", "United States", 50_000_000),
        ("country/KEN", "Global Fund", 50_000_000),
        ("country/KEN", "Germany", 2_000_000),
        ("country/UGA", "United States", 1_000_000),
    ]
    return tuple(
        {
            "financingRecipient": place,
            "financingRecipient_label": place.removeprefix(fetch.COUNTRY),
            "financingProvider_label": provider,
            "crsTypeOfFinance_label": "standard grant",
            "time_period": year,
            "value": value,
            **UNIT,
        }
        for place, provider, value in gives
        for year in YEARS
    )


def gf_rows(code: str, *, leads_from: int, lags_from: int) -> tuple[dict, ...]:
    """Global Fund rows under `code`, larger in the years from `leads_from` to `lags_from`."""
    return tuple(
        {
            "financingRecipient": "country/KEN",
            "financingProvider_label": "Global Fund",
            "crsPurpose": code,
            "time_period": year,
            "value": 10_000_000 if leads_from <= year < lags_from else 1_000_000,
            **UNIT,
        }
        for year in YEARS
    )


def unaids_rows(values: dict[str, dict[int, float | None]]) -> tuple[dict, ...]:
    return tuple(
        {"observationAbout": place, "time_period": year, "value": value, "stat_var": "s"}
        for place, by_year in values.items()
        for year, value in by_year.items()
    )


def every_year(value: float) -> dict[int, float | None]:
    return dict.fromkeys(YEARS, value)


@dataclass
class Unaids:
    """The UNAIDS figures behind the stubbed reads, by place and year."""

    plhiv: dict = field(
        default_factory=lambda: {"country/KEN": every_year(1.4e6), "country/UGA": every_year(1e6)}
    )
    art: dict = field(
        default_factory=lambda: {
            "country/KEN": {fetch.LAST_YEAR: 87.0},
            "country/UGA": {fetch.LAST_YEAR: 90.0},
        }
    )
    deaths: dict = field(
        default_factory=lambda: {"country/KEN": every_year(2e4), "country/UGA": every_year(1e4)}
    )
    places: tuple[str, ...] = PLACES

    def reads(self) -> dict[str, FakeRead]:
        return {
            "plhiv": FakeRead(unaids_rows(self.plhiv)),
            "art": FakeRead(unaids_rows(self.art)),
            "deaths": FakeRead(unaids_rows(self.deaths), places=self.places),
        }


def stub_reads(unaids: Unaids) -> dict[str, FakeRead]:
    return {
        "aid": FakeRead(aid_rows()),
        "gf-12250": FakeRead(gf_rows("CRSPurposeCode12250", leads_from=YEARS[0], lags_from=2020)),
        "gf-12110": FakeRead(gf_rows("CRSPurposeCode12110", leads_from=2020, lags_from=9999)),
        **unaids.reads(),
    }


@pytest.fixture
def step(tmp_path, monkeypatch):
    """`run` runs `fetch.main` in `tmp_path` over stubbed reads, the committed ones from
    `Unaids()` and the newest ones from the `Unaids` it is passed; `pins` lists each read
    pinned."""
    for name in ("TARGET", "REFS", "LIVE_REFS", "FIXTURE"):
        monkeypatch.setattr(fetch, name, tmp_path / getattr(fetch, name).name)

    committed = stub_reads(Unaids())
    fetch.REFS.write_text(
        json.dumps(
            {
                "provenance": {"retrieved": "2026-01-01T00:00:00.000Z"},
                "data": {key: {"ref": {}, "provenance": {}} for key in committed},
            }
        )
    )
    fetch.LIVE_REFS.write_text("{}")
    pins = []

    def pin(data: FakeRead) -> FakeRead:
        pins.append(data)
        return replace(data, pinned=True)

    monkeypatch.setattr(dfo, "pin", pin)

    def run(newest: Unaids, *argv: str) -> None:
        newest_reads = stub_reads(newest)
        monkeypatch.setattr(
            fetch,
            "fetch_refs",
            lambda records, *, latest: {
                key: (newest_reads if latest else committed)[key] for key in records
            },
        )
        fetch.main(["--refresh", *argv])

    return SimpleNamespace(run=run, pins=pins)


def test_a_refresh_with_every_figure_kept_pins_each_read_and_writes_the_refs(step):
    step.run(Unaids())

    assert len(step.pins) == len(fetch.AID_KEYS) + len(fetch.UNAIDS_KEYS)
    assert json.loads(fetch.REFS.read_text())["data"]["aid"]["ref"] == {"pinned": True}
    assert set(json.loads(fetch.LIVE_REFS.read_text())["data"]) == set(fetch.UNAIDS_KEYS)


def test_no_pin_pins_nothing_and_leaves_both_refs_files(step):
    refs, live = fetch.REFS.read_text(), fetch.LIVE_REFS.read_text()

    step.run(Unaids(), "--no-pin")

    assert step.pins == []
    assert (fetch.REFS.read_text(), fetch.LIVE_REFS.read_text()) == (refs, live)
    assert fetch.TARGET.exists()


def without(values: dict, place: str, year: int) -> dict:
    return {
        key: {y: v for y, v in by.items() if (key, y) != (place, year)}
        for key, by in values.items()
    }


@pytest.mark.parametrize(
    "newest",
    [
        pytest.param(Unaids(plhiv=without(Unaids().plhiv, "country/UGA", 2024)), id="plhiv"),
        pytest.param(Unaids(art=without(Unaids().art, "country/UGA", 2024)), id="art"),
        pytest.param(Unaids(deaths=without(Unaids().deaths, "country/UGA", 2015)), id="deaths"),
        pytest.param(Unaids(places=("country/KEN",)), id="outside the deaths places"),
        pytest.param(
            Unaids(deaths={"country/KEN": every_year(1e6), "country/UGA": every_year(1e4)}),
            id="Kenya's deaths out of range",
        ),
    ],
)
def test_a_refresh_that_fails_a_check_fails_before_any_pin_or_write(step, newest):
    step.run(Unaids())  # the control: the committed figures pass
    fetch.TARGET.unlink()
    refs = fetch.REFS.read_text()
    step.pins.clear()

    with pytest.raises(SystemExit):
        step.run(newest)

    assert step.pins == []
    assert not fetch.TARGET.exists()
    assert fetch.REFS.read_text() == refs


def test_lost_figures_names_each_figure_the_newest_versions_lose():
    before = {"UGA": {"plhiv": 1, "art": 2.0, "deaths": [3] + [4] * (len(YEARS) - 1)}}
    after = {"UGA": {"plhiv": None, "art": 2.0, "deaths": [None] + [4] * (len(YEARS) - 1)}}
    gained = {"UGA": {"plhiv": None, "art": None, "deaths": [None] * len(YEARS)}}

    assert fetch.lost_figures(before, after) == [("UGA", "plhiv"), ("UGA", f"deaths {YEARS[0]}")]
    assert fetch.lost_figures(gained, before) == []


def test_outside_places_names_kept_countries_the_read_does_not_bind():
    assert fetch.outside_places(["KEN", "UGA"], {"country/KEN"}) == ["UGA"]
    assert fetch.outside_places(["KEN"], {"country/KEN", "country/UGA"}) == []


def test_unaids_by_country_reads_a_row_with_no_value_as_no_figure():
    """The rule `yearly` in `_lib/unaids.ts` follows: unaids.test.mts has the same case."""
    rows = pd.DataFrame(
        unaids_rows({"country/KEN": {2015: 2.5, 2024: None}, "country/UGA": {2015: float("nan")}})
    )

    assert fetch.unaids_by_country(["KEN", "UGA"], rows, rows, rows)["KEN"] == {
        "plhiv": None,
        "art": None,
        "deaths": [2] + [None] * (len(YEARS) - 1),
    }
