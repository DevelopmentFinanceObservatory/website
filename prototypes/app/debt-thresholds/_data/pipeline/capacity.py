"""Capacity to pay and DSA metadata for a base year, from a row of capacity.csv."""

from collections.abc import Mapping


def capacity_for(row: Mapping[str, str] | None, base: int) -> dict:
    """Return capacity, its source, DSA date and risk rating in force for a base year.

    The risk rating comes from the current DSA, so 2024 carries it only when its
    DSA is the current one.
    """
    if not row:
        return {
            "capacity": None,
            "capacitySource": None,
            "dsaDate": None,
            "riskRating": None,
        }
    current = row.get("dsa_date") or None
    if base == 2024 and "capacity_2024" in row:
        capacity = row.get("capacity_2024") or None
        dsa_date = row.get("dsa_date_2024") or None
        url = row.get("dsa_url_2024") or None
        rating = row.get("risk_rating") if dsa_date and dsa_date == current else None
    else:
        capacity, dsa_date = row.get("capacity") or None, current
        url, rating = row.get("dsa_url") or None, row.get("risk_rating")
    source = ("dsa" if url else "assumed") if capacity else None
    return {
        "capacity": capacity,
        "capacitySource": source,
        "dsaDate": first_of_month(dsa_date) if source == "dsa" else None,
        "riskRating": rating or None,
    }


def first_of_month(value: str | None) -> str | None:
    """Return an ISO date; a year and month alone get the first of the month."""
    if not value:
        return None
    return value if len(value) == 10 else f"{value}-01"
