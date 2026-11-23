"""The step's split of the recipients into CRS reads and its guard on a read's facets.

Run from `_data/` with `uv run --with development-finance==0.6.0 --with pytest pytest tests`.
"""

from dataclasses import dataclass

import pyarrow as pa
import pytest

import fetch


@dataclass(frozen=True)
class FakeData:
    """What `Reads.read` reads of a `dfo.Dataset`: its rows and its sentence."""

    table: pa.Table
    sentence: str = "a read"

    def to_arrow(self) -> pa.Table:
        return self.table

    def __len__(self) -> int:
        return self.table.num_rows


@dataclass(frozen=True)
class FakeAnswer:
    data: FakeData

    def fetch(self, **_options) -> FakeData:
        return self.data


def test_read_places_lists_the_62_contexts_most_fragile_first():
    places = fetch.read_places()

    assert len(places) == fetch.CONTEXTS
    assert len(set(places)) == fetch.CONTEXTS
    assert places[0] == "country/TCD"


def test_read_places_refuses_a_file_of_other_than_62_contexts(tmp_path):
    lines = fetch.CLASSIFICATION.read_text().splitlines()
    short = tmp_path / "short.tsv"
    short.write_text("\n".join(lines[:-1]) + "\n")

    with pytest.raises(SystemExit, match="expected 62 contexts, found 61"):
        fetch.read_places(short)


def test_crs_groups_splits_the_62_into_four_reads():
    places = [f"country/C{index:02}" for index in range(62)]
    groups = fetch.crs_groups(places)

    assert [len(group) for group in groups] == [16, 16, 16, 14]
    assert [place for group in groups for place in group] == places

    with pytest.raises(SystemExit, match="5 groups of recipients"):
        fetch.crs_groups([*places, *places[:4]])


def test_a_search_read_refuses_a_facet_value_it_did_not_ask_for():
    method = "measurementMethod"
    wanted = fetch.CLIMATE_METHOD[method]
    good = FakeData(pa.table({method: [wanted, None]}))
    bad = FakeData(pa.table({method: [wanted, "OECDFullValue"]}))
    reads = fetch.Reads("search")

    assert reads.read("good", lambda: FakeAnswer(good), facets=fetch.CLIMATE_METHOD) is good

    with pytest.raises(SystemExit, match="bad: expected measurementMethod"):
        reads.read("bad", lambda: FakeAnswer(bad), facets=fetch.CLIMATE_METHOD)

    with pytest.raises(SystemExit, match="good: read twice"):
        reads.read("good", lambda: FakeAnswer(good))
