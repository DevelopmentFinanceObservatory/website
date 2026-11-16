"""FDL's projection of external public debt service, including new borrowing.

The Finance for Development Lab (FDL) projects debt service by adding the
service on new loans to the World Bank's schedule for debt already contracted.
The method is set out in Appendix 2, "Debt sustainability assumptions", of
"Mapping external debt vulnerabilities, an update" (November 2023),
https://findevlab.org/wp-content/uploads/2023/12/FDL_Debt-distress-update_final20231204.pdf.
This module implements its baseline scenario. The rules, quoted from the
appendix:

    In each year, countries need to issue new debt to refinance their external
    needs. Those are the sum of: (1) External debt service due and (2) primary
    deficit financed externally. We assume that (1) is fully refinanced
    externally, and (2) is financed partly externally and partly from domestic
    sources.

    The share of primary deficit financed externally is equal to the share of
    external debt in general government debt (comparing WEO public debt with
    IDS external debt). When the primary balance is in surplus, the surplus is
    affected to the same sources. The same procedure applies to each of the
    three sources: multilateral, bilateral and private.

    Given the net flows of multilateral, bilateral and private external debt
    accumulated over a given period, we compute the share of fiscal deficit
    that will be covered by each type of debt. If accumulated net flows of all
    debt types are zero, then the shares for all types are assumed to be 1/3.

    We use conditions for new loans in 2015-2019 as our "reference rate", for
    each source, official (ro) and private (rp). [...] We compute a "spread"
    between ro, rp and the US interest rate. Future interest rates are equal to
    US interest rates [plus the spread] between 2023 and 2028. US interest
    rates are projected to revert back to 3% nominal linearly (1% real + 2%
    inflation), following IMF (2023).

    We "protect" IDA eligible countries from the spread by assuming that the
    official rates they borrowed at during 2015-19 apply in 2023-28.

The baseline has no exchange-rate shock, so the appendix's currency-basket
index is constant and is left out: every amount is in current US dollars.

Readings where the appendix leaves a choice open
------------------------------------------------

Each of these decides how close the result comes to FDL's published lists.

1. Refinancing by source. By default (``refinance="by_source"``) each source
   rolls over its own service due, and only the externally financed primary
   deficit (or surplus) is split by accumulated net flows. This follows the
   appendix's "the same procedure applies to each of the three sources" and
   its note that the net-flow shares set "the share of fiscal deficit" each
   source covers. ``refinance="pooled"`` splits the whole financing need by
   the net-flow shares instead.
2. Creditor groups to sources. FDL's model has three sources; the page reports
   five groups. Multilateral and IMF map to the multilateral source; bilateral
   (excluding China) and China map to the bilateral source, because S1 groups
   China's official and private lenders together and most of it is official;
   private maps to private. IMF repurchases and charges in the IDS schedule
   are therefore refinanced by new multilateral loans, and the IMF gets no new
   lending. New bilateral loans are attributed to bilateral (excluding China)
   and China in proportion to their accumulated net flows, with negative sums
   counted as zero; if both are zero, all go to bilateral excluding China.
3. Net-flow shares. Net flow = disbursements minus principal repayments, per
   group, summed over every year supplied in ``net_flows`` up to the base
   year. A source whose sum is negative gets a zero share (a negative share
   would make a deficit reduce that source's lending). If no source has a
   positive sum, each gets one third.
4. Primary surplus. A surplus reduces each source's new lending by its share.
   New lending from a source never goes below zero: a surplus larger than a
   source's service due does not prepay its debt.
5. External share. External public debt (PPG plus IMF credit, face value) at
   the end of the base year over general government gross debt in the base
   year (WEO, % of GDP, times WEO GDP), capped at 1 and held constant over
   the projection.
6. Rates. Spread per source = its 2015-19 average rate on new commitments
   (IDS, official or private) minus the 2015-19 average of ``us_rate``.
   Multilateral and bilateral use the official rate; private uses the private
   rate. The US rate falls or rises in a straight line from its base-year
   value to 3.0% in ``end_year``. A new loan's rate, floored at zero, is fixed
   for the life of the loan at the rate of its issue year. IDA-eligible
   countries pay the 2015-19 official rate on official loans; their private
   loans still pay US rate plus the private spread.
7. Repayment terms. Maturity and grace are the 2015-19 averages on new
   commitments from IDS (official for multilateral and bilateral, private for
   private), rounded to whole years. A loan issued in year t is disbursed at
   the end of t: interest on the outstanding balance is due from t + 1, and
   principal is repaid in equal instalments in years t + grace + 1 to
   t + maturity (one bullet payment at t + maturity if grace is not shorter
   than maturity). Service on a loan falls due in later years and is itself
   refinanced there.
8. Timing. The projection runs from base_year + 1 to end_year. The IDS
   schedule after the base year already covers loans disbursed up to the base
   year, so no new loan is issued in the base year.

Inputs
------

``inputs`` describes one country. Year keys may be ints or strings (JSON
gives strings). Money is current US dollars; rates and ratios are percent.

    {
      "contracted": {          # IDS projected service (principal + interest) on
        "2025": {              # debt contracted up to the base year, PPG plus IMF,
          "multilateral": float, "imf": float, "bilateral": float,
          "china": float, "private": float,
        },                     # every year from base_year + 1 to end_year
        ...
      },
      "net_flows": {           # disbursements minus principal, actual years,
        "2015": {"multilateral": float, "imf": float, "bilateral": float,
                 "china": float, "private": float},
        ...                    # years after base_year are ignored
      },
      "external_debt": {"2024": float},   # PPG + IMF stock, face value, base year
      "gdp": {"2024": float, ...},        # WEO GDP, base year to end_year
      "primary_balance": {"2025": float, ...},  # WEO, % of GDP, base_year + 1
                                                 # to end_year; negative is a deficit
      "gg_debt": {"2024": float},         # WEO general government gross debt, % of GDP;
                                          # base year needed
      "us_rate": {"2015": float, ..., "2019": float, "2024": float},
                                          # 2015-19 and the base year needed
      "terms": {                          # 2015-19 averages on new commitments, IDS
        "official": {"rate": float, "maturity": float, "grace": float},
        "private": {"rate": float, "maturity": float, "grace": float},
      },
      "ida": bool,                        # IDA-eligible (IDA-only or blend)
    }

A missing required value raises ``ValueError`` naming the field and year.

Output
------

One dict per year from base_year + 1 to end_year::

    {
      "year": 2025,
      "contracted": {group: float},   # the IDS schedule, as supplied
      "new": {group: float},          # service on loans issued after the base year
      "service": {group: float},      # contracted + new
      "borrowing": {source: float},   # new loans issued this year, by source
    }

``group`` runs over multilateral, imf, bilateral, china, private; ``source``
over multilateral, bilateral, private.
"""

from collections.abc import Mapping
from typing import Any, Literal

GROUPS = ("multilateral", "imf", "bilateral", "china", "private")
SOURCES = ("multilateral", "bilateral", "private")
SOURCE_OF_GROUP = {
    "multilateral": "multilateral",
    "imf": "multilateral",
    "bilateral": "bilateral",
    "china": "bilateral",
    "private": "private",
}
TERMS_OF_SOURCE = {
    "multilateral": "official",
    "bilateral": "official",
    "private": "private",
}
REFERENCE_YEARS = range(2015, 2020)
LONG_RUN_US_RATE = 3.0


def project_service(
    inputs: Mapping,
    base_year: int,
    end_year: int = 2030,
    *,
    refinance: Literal["by_source", "pooled"] = "by_source",
) -> list[dict]:
    """Project external public debt service by creditor group to ``end_year``.

    Args:
        inputs: One country's data, shaped as the module docstring describes.
        base_year: The last actual year; projection starts the year after.
        end_year: The last projected year.
        refinance: ``"by_source"`` rolls each source's service over with that
            source; ``"pooled"`` splits the whole need by net-flow shares.

    Returns:
        One row per projected year, as the module docstring describes.

    Raises:
        ValueError: A required input is missing.
    """
    contracted = _years(inputs, "contracted")
    gdp = _years(inputs, "gdp")
    primary_balance = _years(inputs, "primary_balance")
    terms = inputs["terms"]

    shares = source_shares(_years(inputs, "net_flows"), base_year)
    china_share = china_share_of_bilateral(_years(inputs, "net_flows"), base_year)
    share = external_share(
        external_debt=_need(_years(inputs, "external_debt"), base_year, "external_debt"),
        gg_debt_pct=_need(_years(inputs, "gg_debt"), base_year, "gg_debt"),
        gdp=_need(gdp, base_year, "gdp"),
    )
    us_rate = _years(inputs, "us_rate")
    us_path = us_rate_path(
        _need(us_rate, base_year, "us_rate"), base_year=base_year, end_year=end_year
    )
    us_reference = _mean([_need(us_rate, y, "us_rate") for y in REFERENCE_YEARS])

    new_service: dict[int, dict[str, float]] = {}
    rows = []
    for year in range(base_year + 1, end_year + 1):
        scheduled = _need(contracted, year, "contracted")
        old = {g: float(scheduled.get(g) or 0.0) for g in GROUPS}
        new = new_service.get(year, dict.fromkeys(GROUPS, 0.0))
        due = {s: 0.0 for s in SOURCES}
        for group in GROUPS:
            due[SOURCE_OF_GROUP[group]] += old[group] + new[group]

        deficit = -_need(primary_balance, year, "primary_balance") / 100
        external_deficit = share * deficit * _need(gdp, year, "gdp")
        borrowing = new_borrowing(due, external_deficit, shares=shares, refinance=refinance)

        for source, amount in borrowing.items():
            source_terms = terms[TERMS_OF_SOURCE[source]]
            rate = new_loan_rate(
                us_path[year],
                reference_rate=source_terms["rate"],
                us_reference=us_reference,
                protected=bool(inputs.get("ida")) and TERMS_OF_SOURCE[source] == "official",
            )
            schedule = loan_service(
                amount,
                rate=rate,
                maturity=source_terms["maturity"],
                grace=source_terms["grace"],
                issued=year,
            )
            split = _groups_of_source(source, china_share)
            for paid_year, payment in schedule.items():
                if paid_year > end_year:
                    continue
                target = new_service.setdefault(paid_year, dict.fromkeys(GROUPS, 0.0))
                for group, weight in split.items():
                    target[group] += payment * weight

        rows.append(
            {
                "year": year,
                "contracted": old,
                "new": dict(new),
                "service": {g: old[g] + new[g] for g in GROUPS},
                "borrowing": borrowing,
            }
        )
    return rows


def source_shares(net_flows: Mapping[int, Mapping], base_year: int) -> dict[str, float]:
    """Each source's share of new lending, from net flows accumulated to the base year.

    Negative sums count as zero; one third each when no source has a positive sum.
    """
    totals = {s: 0.0 for s in SOURCES}
    for year, flows in net_flows.items():
        if year > base_year:
            continue
        for group in GROUPS:
            totals[SOURCE_OF_GROUP[group]] += float(flows.get(group) or 0.0)
    positive = {s: max(v, 0.0) for s, v in totals.items()}
    total = sum(positive.values())
    if total == 0:
        return {s: 1 / len(SOURCES) for s in SOURCES}
    return {s: v / total for s, v in positive.items()}


def china_share_of_bilateral(net_flows: Mapping[int, Mapping], base_year: int) -> float:
    """China's share of new bilateral lending, from accumulated net flows."""
    china = bilateral = 0.0
    for year, flows in net_flows.items():
        if year > base_year:
            continue
        china += float(flows.get("china") or 0.0)
        bilateral += float(flows.get("bilateral") or 0.0)
    china, bilateral = max(china, 0.0), max(bilateral, 0.0)
    if china + bilateral == 0:
        return 0.0
    return china / (china + bilateral)


def external_share(*, external_debt: float, gg_debt_pct: float, gdp: float) -> float:
    """External public debt over general government gross debt, capped at 1."""
    public_debt = gg_debt_pct / 100 * gdp
    if public_debt <= 0:
        return 1.0
    return min(external_debt / public_debt, 1.0)


def us_rate_path(start: float, *, base_year: int, end_year: int) -> dict[int, float]:
    """US rate by year, moving linearly from ``start`` in the base year to 3%."""
    span = end_year - base_year
    return {base_year + k: start + (LONG_RUN_US_RATE - start) * k / span for k in range(span + 1)}


def new_loan_rate(
    us_rate: float, *, reference_rate: float, us_reference: float, protected: bool
) -> float:
    """Rate on a new loan, in percent: US rate plus the 2015-19 spread, floored at 0.

    ``protected`` (IDA-eligible, official loans) keeps the 2015-19 rate itself.
    """
    if protected:
        return reference_rate
    return max(us_rate + reference_rate - us_reference, 0.0)


def new_borrowing(
    due: Mapping[str, float],
    external_deficit: float,
    *,
    shares: Mapping[str, float],
    refinance: Literal["by_source", "pooled"],
) -> dict[str, float]:
    """New loans by source: service due plus the external primary deficit.

    A surplus (negative deficit) reduces lending; no source lends below zero.
    """
    if refinance == "pooled":
        total = max(sum(due.values()) + external_deficit, 0.0)
        return {s: total * shares[s] for s in SOURCES}
    return {s: max(due[s] + external_deficit * shares[s], 0.0) for s in SOURCES}


def loan_service(
    amount: float, *, rate: float, maturity: float, grace: float, issued: int
) -> dict[int, float]:
    """Principal plus interest by year on a loan disbursed at the end of ``issued``."""
    if amount == 0:
        return {}
    years = max(round(maturity), 1)
    grace_years = min(max(round(grace), 0), years - 1)
    instalments = years - grace_years
    outstanding = amount
    service = {}
    for k in range(1, years + 1):
        interest = outstanding * rate / 100
        principal = amount / instalments if k > grace_years else 0.0
        outstanding -= principal
        service[issued + k] = interest + principal
    return service


def _groups_of_source(source: str, china_share: float) -> dict[str, float]:
    if source == "bilateral":
        return {"bilateral": 1 - china_share, "china": china_share}
    return {source: 1.0}


def _years(inputs: Mapping, field: str) -> dict[int, Any]:
    if field not in inputs or inputs[field] is None:
        raise ValueError(f"inputs lack {field!r}")
    return {int(year): value for year, value in inputs[field].items()}


def _need[T](by_year: Mapping[int, T | None], year: int, field: str) -> T:
    value = by_year.get(year)
    if value is None:
        raise ValueError(f"inputs lack {field!r} for {year}")
    return value


def _mean(values: list[float]) -> float:
    return sum(values) / len(values)
