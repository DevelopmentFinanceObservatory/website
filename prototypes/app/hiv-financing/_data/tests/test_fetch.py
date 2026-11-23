"""The step's checks and its pin and write order, over stubbed reads.

Each read is a `FakeRead` holding a small frame that passes every check in `fetch.check`.
Kenya and Uganda are the kept countries. The deaths read binds both by default. DFO's analysis
is stubbed by `analysis_rows`, which sums the aid read's rows as the recipes do.
"""

import json
from collections import defaultdict
from dataclasses import dataclass, field, replace
from types import SimpleNamespace

import dfo
import pandas as pd
import pytest

import fetch

YEARS = fetch.YEARS
UNIT = {"currency": "USD", "price_basis": "constant", "base_year": fetch.PRICE_BASE}
UNIT_TEXT = json.dumps(
    {
        "base_year": fetch.PRICE_BASE,
        "currency": "USD",
        "deflation_basis": "donor",
        "prices": "constant",
    }
)
PROVIDERS = {"United States": fetch.US, "Global Fund": fetch.GLOBAL_FUND, "Germany": "country/DEU"}
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
        ("AfricaUnallocated", "United States", 3_000_000),
    ]
    return tuple(
        {
            "financingRecipient": place,
            "financingRecipient_label": place.removeprefix(fetch.COUNTRY),
            "financingProvider": PROVIDERS[provider],
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
            "financingProvider": fetch.GLOBAL_FUND,
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


def summed(rows: list[dict], column: str | None) -> list[dict]:
    """`rows` summed by `column` and year, as a DFO aggregate answers."""
    sums: dict[tuple, float] = defaultdict(float)

    for row in rows:
        sums[(row[column] if column else None, row["time_period"])] += row["value"]

    return [
        {
            **({column: code} if column else {}),
            "time_period": str(year),
            "value": value,
            "unit": UNIT_TEXT,
        }
        for (code, year), value in sums.items()
    ]


def analysis_rows(reads: dict) -> tuple[dict[str, list[dict]], dict]:
    """What DFO's recipes answer for the stubbed aid read, and the Global Fund reads' rows."""
    aid = list(reads["aid"].rows)
    party = [row for row in aid if row["financingRecipient"].startswith(fetch.COUNTRY)]
    residual = [row for row in aid if row not in party]
    gf = {key: [row for row in reads[key].rows] for key in fetch.GF_KEYS}

    def of(provider: str) -> list[dict]:
        return [row for row in party if row["financingProvider"] == provider]

    loans = [row for row in party if row["crsTypeOfFinance_label"] == "standard loan"]
    rows = {
        "allocatedByProvider": summed(party, "financingProvider"),
        "unallocatedByProvider": summed(residual, "financingProvider"),
        "allocatedByRecipient": summed(party, "financingRecipient"),
        "usByRecipient": summed(of(fetch.US), "financingRecipient"),
        "globalFundByRecipient": summed(of(fetch.GLOBAL_FUND), "financingRecipient"),
        "loans": [
            {**row, "time_period": "2015/2024"}
            for row in summed([{**row, "time_period": 0} for row in loans], "financingProvider")
        ],
        "gf12250Total": summed(gf["gf-12250"], None),
        "gf12110Total": summed(gf["gf-12110"], None),
        **{
            key: [
                {name: row[name] for name in ("financingRecipient", "time_period", "value", *UNIT)}
                for row in rows
            ]
            for key, rows in gf.items()
        },
    }
    return rows, {}


@pytest.fixture
def step(tmp_path, monkeypatch):
    """`run` runs `fetch.main` in `tmp_path` over stubbed reads, the committed ones from
    `Unaids()` and the newest ones from the `Unaids` it is passed; `pins` lists each read
    pinned."""
    monkeypatch.setattr(fetch, "analysis_rows", analysis_rows)

    for name in ("TARGET", "REFS", "LIVE_REFS", "FIXTURE", "AID_FIXTURE", "NAMES_FILE"):
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
    assert set(json.loads(fetch.LIVE_REFS.read_text())["data"]) == {
        *fetch.UNAIDS_KEYS,
        *fetch.AID_KEYS,
    }
    assert fetch.AID_FIXTURE.exists()


def test_no_pin_pins_nothing_and_leaves_the_refs_files_and_the_aid_fixture(step):
    refs, live = fetch.REFS.read_text(), fetch.LIVE_REFS.read_text()

    step.run(Unaids(), "--no-pin")

    assert step.pins == []
    assert (fetch.REFS.read_text(), fetch.LIVE_REFS.read_text()) == (refs, live)
    # The aid fixture's trees name the versions live-refs.json holds, so it moves with it.
    assert not fetch.AID_FIXTURE.exists()
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
