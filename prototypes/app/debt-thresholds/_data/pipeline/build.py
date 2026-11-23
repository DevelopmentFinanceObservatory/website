"""The per-country BaseYear records and projection inputs for one view."""

from dataclasses import dataclass

from pipeline.capacity import capacity_for
from pipeline.config import FIRST_FLOW_YEAR, GROUPS, HISTORY, REFERENCE_YEARS, View
from pipeline.countries import COUNTRIES, ISO3
from pipeline.coverage import coverage_rows
from pipeline.creditors import estimate_imf_charges, groups, guard_groups, net_flows
from pipeline.panel import Panel, Series, amount_of, span, whole
from pipeline.project import project_service
from pipeline.terms import lending_terms
from pipeline.valuation import present_value


def build_view(
    view: View,
    panel: Panel,
    *,
    weo: dict[str, dict[str, Series]],
    us_rate: Series,
    ida: dict[str, bool],
    terms: dict[str, dict],
    capacity: dict[str, dict[str, str]],
) -> tuple[dict[str, dict], dict[str, dict]]:
    """Return the BaseYear for each country, and the projection inputs behind it."""
    built: dict[str, dict] = {}
    all_inputs: dict[str, dict] = {}
    projected_years = span(view.base + 1, view.end)
    for iso3 in ISO3:
        keys, fiscal = panel[iso3], weo[iso3]

        def gdp(year: int, keys=keys, fiscal=fiscal) -> float | None:
            if view.use_dfo and year == view.base and year in keys.get("gdp", {}):
                return keys["gdp"][year]
            usd_bn = fiscal["gdp_usd_bn"].get(year)
            return None if usd_bn is None else usd_bn * 1e9

        def revenue(year: int, fiscal=fiscal) -> float | None:
            pct, usd_bn = (
                fiscal["revenue_pct"].get(year),
                fiscal["gdp_usd_bn"].get(year),
            )
            return None if pct is None or usd_bn is None else pct / 100 * usd_bn * 1e9

        # The debt test uses PPG debt without IMF credit, which matches FDL's 2024
        # groups for 51 of 58 countries (47 with it); the projection's external
        # share keeps IMF credit in `debt`.
        stock = keys.get("ppg_stock", {}).get(view.base)
        debt = None if stock is None else stock + amount_of(keys, "imf_stock", view.base)
        inputs = {
            "contracted": {str(y): groups(keys, "service", y) for y in projected_years},
            "contracted_disbursements": {str(y): groups(keys, "disb", y) for y in projected_years},
            "net_flows": {str(y): net_flows(keys, y) for y in span(FIRST_FLOW_YEAR, view.base)},
            "external_debt": {str(view.base): debt},
            "gdp": {str(y): gdp(y) for y in span(view.base, view.end)},
            "primary_balance": {
                str(y): fiscal["primary_balance_pct"].get(y) for y in projected_years
            },
            "gg_debt": {str(view.base): fiscal["gg_debt_pct"].get(view.base)},
            "us_rate": {str(y): us_rate.get(y) for y in [*REFERENCE_YEARS, view.base]},
            "terms": terms[iso3],
            "ida": ida[iso3],
        }
        try:
            rows = project_service(inputs, view.base, view.end, refinance="by_source")
            projection = {row["year"]: row["service"] for row in rows}
            error = None
        except ValueError as raised:
            projection, error = {}, str(raised)
        all_inputs[iso3] = {**inputs, "projection_error": error}

        years = []
        for year in span(view.base - HISTORY, view.end):
            service = groups(keys, "service", year) if year <= view.base else projection.get(year)
            years.append(
                {
                    "year": year,
                    "projected": year > view.base,
                    "service": None if service is None else {g: round(service[g]) for g in GROUPS},
                    "revenue": whole(revenue(year)),
                }
            )
        built[iso3] = {
            "year": view.base,
            "debtFace": whole(stock),
            "debtPV": whole(present_value(keys, view.base)),
            "gdp": whole(gdp(view.base)),
            **capacity_for(capacity.get(iso3), view.base),
            "years": years,
        }
    return built, all_inputs


@dataclass(frozen=True)
class Assembled:
    """One view built from its panel: the records, the projection inputs and the checks."""

    bases: dict[str, dict]
    inputs: dict[str, dict]
    coverage: list[dict]
    # ISO3 codes of the countries lacking a core series in the base year.
    missing: list[str]
    # The creditor-group guard and the lending-terms fallback, for the coverage report.
    check: dict


def assemble_view(
    view: View,
    panel: Panel,
    *,
    creditor_sums: dict[str, Series],
    weo: dict[str, dict[str, Series]],
    us_rate: Series,
    ida: dict[str, bool],
    capacity: dict[str, dict[str, str]],
) -> Assembled:
    """Return one view's records, inputs and checks from its IDS panel and WEO series.

    The data step builds both views this way and the page's build the current one,
    so the two cannot drift.
    """
    panel = estimate_imf_charges(panel, view)
    terms, fallback = lending_terms(panel)
    bases, inputs = build_view(
        view, panel, weo=weo, us_rate=us_rate, ida=ida, terms=terms, capacity=capacity
    )
    rows = coverage_rows(bases, view)
    return Assembled(
        bases=bases,
        inputs=inputs,
        coverage=rows,
        missing=[row["iso3"] for row in rows if row["missing"]],
        check={"guard": guard_groups(panel, view, creditor_sums), "terms_fallback": fallback},
    )


def view_data(view: View, bases: dict[str, dict]) -> dict:
    """Return what the page shows of one base year: its releases and each country's record.

    The page puts the views together into `ThresholdsData` (`types.ts`), each
    country's `bases` keyed by base year.
    """
    return {
        "year": view.base,
        "vintage": {
            "ids": view.ids,
            "weo": f"{view.weo[0]} {view.weo[1]}",
            "capacityAsOf": view.capacity_as_of,
            "archived": view.archived,
        },
        "countries": [
            {
                "iso3": country.iso3,
                "name": country.name,
                "fdl2024": country.fdl2024,
                "base": bases[country.iso3],
            }
            for country in COUNTRIES
        ],
    }
