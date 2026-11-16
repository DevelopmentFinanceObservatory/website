"""Creditor-group splits of debt service and flows, the IMF charge estimate and the guard.

Creditor groups, per country and year, all public and publicly guaranteed (PPG):

- multilateral: IDS multilateral creditors (MLAT).
- imf: IMF repurchases plus charges. IDS projects repurchases but leaves charges
  at zero after the last actual year, so projected charges are the base year's
  charges over IMF credit outstanding, applied to the credit still outstanding
  after each year's repurchases.
- bilateral: IDS bilateral creditors (BLAT) minus China's bilateral lending.
- china: everything owed to Chinese creditors, official and private.
- private: PPG minus multilateral, bilateral and China's private lending.

The five groups sum to PPG plus IMF by construction. The guard checks the IDS
parts independently, country-year by country-year, within 1%: multilateral plus
bilateral plus private (PRVT) against PPG, and on the DFO path the sum over single
creditors against PPG, with the IMF absent from those creditors.
"""

from collections.abc import Mapping

from pipeline.config import GROUPS, HISTORY, TOLERANCE, View
from pipeline.countries import ISO3
from pipeline.panel import Panel, Series, amount_of, span


def groups(keys: Mapping[str, Series], flow: str, year: int) -> dict[str, float] | None:
    """Return one flow (service, principal, disb) by creditor group, or None without PPG."""
    total = keys.get(f"ppg_{flow}", {}).get(year)
    if total is None:
        return None
    mlat = amount_of(keys, f"mlat_{flow}", year)
    blat = amount_of(keys, f"blat_{flow}", year)
    china = amount_of(keys, f"china_{flow}", year)
    china_official = amount_of(keys, f"china_blat_{flow}", year)
    if flow == "service":
        imf = amount_of(keys, "imf_principal", year) + amount_of(keys, "imf_interest", year)
    else:
        imf = amount_of(keys, f"imf_{flow}", year)
    out = {
        "multilateral": mlat,
        "imf": imf,
        "bilateral": blat - china_official,
        "china": china,
        "private": total - mlat - blat - (china - china_official),
    }
    # Rounding in the sources can leave a group a few dollars below zero.
    floor = -TOLERANCE * max(total, 1.0)
    return {g: 0.0 if floor < v < 0 else v for g, v in out.items()}


def net_flows(keys: Mapping[str, Series], year: int) -> dict[str, float] | None:
    """Return disbursements minus principal repayments by creditor group, or None."""
    disbursed, repaid = groups(keys, "disb", year), groups(keys, "principal", year)
    if disbursed is None or repaid is None:
        return None
    return {g: disbursed[g] - repaid[g] for g in GROUPS}


def estimate_imf_charges(panel: Panel, view: View) -> Panel:
    """Return a copy of `panel` with IMF charges projected, which IDS leaves at zero.

    Each country's interest after the base year is its base-year effective rate
    times the stock still outstanding. The input panel is left unchanged.
    """
    result: Panel = {
        iso3: {key: dict(series) for key, series in keys.items()} for iso3, keys in panel.items()
    }
    for keys in result.values():
        stock = amount_of(keys, "imf_stock", view.base)
        charges = amount_of(keys, "imf_interest", view.base)
        rate = charges / stock if stock > 0 else 0.0
        outstanding = stock
        projected = keys.setdefault("imf_interest", {})
        for year in span(view.base + 1, view.end):
            projected[year] = rate * outstanding
            outstanding = max(outstanding - amount_of(keys, "imf_principal", year), 0.0)
    return result


def guard_groups(panel: Panel, view: View, creditor_sums: dict[str, Series]) -> dict:
    """Check the creditor groups against PPG, country-year by country-year."""
    checked, failures = 0, []
    for iso3 in ISO3:
        keys = panel[iso3]
        for year in span(view.base - HISTORY, view.end):
            total = keys.get("ppg_service", {}).get(year)
            built = groups(keys, "service", year)
            if total is None or built is None:
                continue
            checked += 1
            bound = TOLERANCE * max(total, 1.0)
            parts = sum(amount_of(keys, f"{p}_service", year) for p in ("mlat", "blat", "prvt"))
            imf = built["imf"]
            problems = []
            if abs(parts - total) > bound:
                problems.append(f"MLAT+BLAT+PRVT {parts:,.0f} against PPG {total:,.0f}")
            single = creditor_sums.get(iso3, {}).get(year)
            if single is not None and abs(single - total) > bound:
                problems.append(f"sum of DFO creditors {single:,.0f} against PPG {total:,.0f}")
            if abs(sum(built.values()) - (total + imf)) > bound:
                problems.append(
                    f"groups {sum(built.values()):,.0f} against PPG+IMF {total + imf:,.0f}"
                )
            negative = {g: v for g, v in built.items() if v < 0}
            if negative:
                problems.append(
                    "negative " + ", ".join(f"{g} {v:,.0f}" for g, v in negative.items())
                )
            if problems:
                failures.append(f"{iso3} {year}: " + "; ".join(problems))
    return {"checked": checked, "failed": len(failures), "failures": failures}
