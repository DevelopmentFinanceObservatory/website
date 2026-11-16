"""Tests for the capacity and DSA fields of a base year."""

import pytest

from pipeline.capacity import capacity_for, first_of_month

ROW = {
    "capacity": "5.0",
    "dsa_date": "2025-06",
    "dsa_url": "https://example.org/dsa",
    "risk_rating": "High",
    "capacity_2024": "4.0",
    "dsa_date_2024": "2025-06",
    "dsa_url_2024": "",
}


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, None),
        ("", None),
        ("2025-06", "2025-06-01"),
        ("2025-06-15", "2025-06-15"),
    ],
)
def test_first_of_month(value: str | None, expected: str | None) -> None:
    assert first_of_month(value) == expected


def test_missing_row_gives_empty_fields() -> None:
    assert capacity_for(None, 2025) == dict.fromkeys(
        ("capacity", "capacitySource", "dsaDate", "riskRating")
    )


def test_current_base_uses_current_dsa() -> None:
    assert capacity_for(ROW, 2025) == {
        "capacity": "5.0",
        "capacitySource": "dsa",
        "dsaDate": "2025-06-01",
        "riskRating": "High",
    }


def test_2024_without_url_is_assumed_and_keeps_rating_only_for_current_dsa() -> None:
    result = capacity_for(ROW, 2024)
    assert result["capacity"] == "4.0"
    assert result["capacitySource"] == "assumed"
    assert result["dsaDate"] is None
    assert result["riskRating"] == "High"
    older = capacity_for({**ROW, "dsa_date_2024": "2023-01"}, 2024)
    assert older["riskRating"] is None
