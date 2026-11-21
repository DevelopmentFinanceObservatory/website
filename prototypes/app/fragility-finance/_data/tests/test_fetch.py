"""The step's guard on the pillars' purpose labels and its joins of DFO's results.

Run from `_data/` with `uv run --with development-finance==0.6.0 --with pytest pytest tests`.
"""

from dataclasses import dataclass

import pyarrow as pa
import pytest

import fetch


@dataclass(frozen=True)
class FakeRead:
    """What the guard reads of a `dfo.Dataset`: its purpose codes and their labels."""

    purposes: tuple[tuple[str, str], ...]

    def to_arrow(self) -> pa.Table:
        codes, labels = zip(*self.purposes, strict=True)
        return pa.table({"crsPurpose": list(codes), "crsPurpose_label": list(labels)})


RELIEF = ("CRSPurposeCode72010", "material relief assistance and service")
FOOD = ("CRSPurposeCode72040", "emergency food assistance")
COURTS = ("CRSPurposeCode15130", "legal and judicial development")
SCHOOLS = ("CRSPurposeCode11220", "primary education")


def test_pillar_purposes_lists_each_pillars_labels_across_reads():
    reads = [FakeRead((RELIEF, COURTS, SCHOOLS)), FakeRead((FOOD, RELIEF))]

    assert fetch.pillar_purposes(reads) == {
        "humanitarian": [FOOD[1], RELIEF[1]],
        "peace": [COURTS[1]],
    }


@pytest.mark.parametrize(
    "reads",
    [
        # A humanitarian label that also names a development code would move that code's aid.
        [FakeRead((RELIEF, COURTS)), FakeRead((("CRSPurposeCode11220", RELIEF[1]),))],
        # A pillar the reads hold no code of would filter to nothing.
        [FakeRead((RELIEF, SCHOOLS))],
    ],
    ids=["label-names-two-codes", "pillar-without-labels"],
)
def test_pillar_purposes_refuses_a_label_that_names_no_single_pillar_code(reads):
    with pytest.raises(SystemExit):
        fetch.pillar_purposes(reads)


def test_by_place_sums_each_year_and_skips_missing_values():
    rows = [
        {"financingRecipient": "country/KEN", "time_period": "2024", "value": 2.0},
        {"financingRecipient": "country/KEN", "time_period": "2024", "value": 3.0},
        {"financingRecipient": "country/KEN", "time_period": "2023", "value": None},
        {"financingRecipient": "country/UGA", "time_period": 2023, "value": float("nan")},
    ]

    assert fetch.by_place(rows, fetch.RECIPIENT) == {"KEN": {2024: 5.0}}


def test_joined_refuses_a_recipient_in_two_reads():
    with pytest.raises(SystemExit, match="KEN"):
        fetch.joined([{"KEN": {2024: 1.0}}, {"KEN": {2024: 2.0}}])
