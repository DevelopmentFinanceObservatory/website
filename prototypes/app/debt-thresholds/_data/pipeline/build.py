"""The per-country BaseYear records and projection inputs for one view."""

from pipeline.capacity import capacity_for
from pipeline.config import FIRST_FLOW_YEAR, GROUPS, HISTORY, REFERENCE_YEARS, View
from pipeline.countries import ISO3
from pipeline.creditors import groups, net_flows
from pipeline.panel import Panel, Series, amount_of, span, whole
from pipeline.project import project_service


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
            "gdp": whole(gdp(view.base)),
            **capacity_for(capacity.get(iso3), view.base),
            "years": years,
        }
    return built, all_inputs
