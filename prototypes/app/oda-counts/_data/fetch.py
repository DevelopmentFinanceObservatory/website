# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["development-finance[pandas]==0.2.0", "httpx==0.28.1"]
# ///
"""The oda-counts data step, run by hand with `pnpm data oda-counts`.

Fetches every OECD DAC1 count of ODA for every provider, 2015 to 2025, in current and
constant 2024 US dollars, and the graph definitions the page composes each count's
definition from. Checks known values, failing loudly when one differs, then writes
`counts.json` and `definitions.json` beside this file.

Each series is a DFO spec built here from its StatVar parts with the provider role
left open, so one fetch returns every provider and the DAC group totals. The server
recomputes a spec's id from its definition, and its first refusal names that id.
"""

import json
import logging
import re
import time
import warnings
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import dfo
import httpx

log = logging.getLogger("oda-counts")

FIRST_YEAR, LAST_YEAR = 2015, 2025
YEARS = list(range(FIRST_YEAR, LAST_YEAR + 1))
BASE_YEAR = 2024
GRANT_EQUIVALENT_FROM = 2018
CONSTANT = {"currency": "USD", "prices": "constant", "base_year": BASE_YEAR}
DAC1 = "provenance/OECDDAC1"
HEADLINE = "provenance/ONEOECDHeadlineODA"
GNI = "PrimaryIncome_EconomicUnit_GrossOfFixedCapitalConsumption_Nominal"
GRAPH_NODES = "https://developmentfinance.org/api/v1/graph/nodes"
# A spec id no definition hashes to; the server's refusal names the id it computed.
PLACEHOLDER_ID = "spec_" + "0" * 32
RECOMPUTED = re.compile(r"recomputed id '(spec_[0-9a-f]+)'")

QUERY = (
    "Every OECD DAC1 count of ODA by provider, 2015 to 2025: gross and net disbursements, "
    "grant equivalents, commitments and the OECD headline, with gross bilateral, "
    "multilateral and non-grant disbursements, in-donor refugee costs and ODA/GNI, "
    "in current and constant 2024 US dollars"
)

# Graph nodes the page composes definitions from.
NODE_IDS = [
    "Gross",
    "Net",
    "Disbursement",
    "Commitment",
    "grantEquivalent",
    "grantElement",
    "Nominal",
    "RealValue",
    "DAC1AidType1015",
    "DAC1AidType2000",
    "DAC1AidType1820",
    "DACTypeOfFinanceNonGrants",
]
# Labels for the graph nodes that carry none.
FALLBACK_LABELS = {"Nominal": "current prices", "RealValue": "constant prices"}
# No graph node exists for these two; the text follows the DFO's oda-measures skill.
WRITTEN = [
    {
        "id": "oecdHeadline",
        "label": "OECD headline ODA",
        "description": (
            "The figure the OECD reports as a donor's ODA: net disbursements up to 2017 "
            "and grant equivalents from 2018, so years either side of the 2018 change "
            "are not comparable."
        ),
    },
    {
        "id": "constantPrices",
        "label": f"constant {BASE_YEAR} prices",
        "description": (
            f"Every year valued at {BASE_YEAR} prices and exchange rates, using the "
            "OECD DAC deflators, from ONE's conversion tables, so a change over time "
            "is not inflation or a currency movement."
        ),
    },
]

# Group totals that repeat a provider's own figures, and the provider they repeat.
# The EU institutions are the only multilateral that reports to DAC1.
DUPLICATES = {"DACMultilaterals": "EuropeanUnionInstitutions"}

# Known values in current US dollars that the run must reproduce within 0.5%.
KNOWN = [
    ("country/FRA", "gross", 2025, 17.508e9),
    ("country/FRA", "net", 2025, 13.906e9),
    ("country/FRA", "grantEquivalent", 2024, 15.448e9),
]


@dataclass(frozen=True)
class Series:
    """One series the page reads, as the StatVar parts of its DFO spec."""

    key: str
    sentence: str
    population: str
    measured: str
    slots: dict[str, str | None]
    provenance: str = DAC1
    denominator: str | None = None
    constant: bool = True

    def definition(self, *, constant: bool) -> dict:
        """Return the spec definition with the provider open, in the given prices."""
        shape = {
            "kind": "statvar_schema",
            "population_type": self.population,
            "measured_property": self.measured,
            "stat_type": "measuredValue",
            "measurement_qualifier": "Nominal",
        }
        if self.denominator:
            shape["measurement_denominator"] = {"ref": self.denominator}
        facets: dict = {"provenance": {"state": "value", "ref": self.provenance}}
        if constant:
            facets["unit"] = {"state": "value", "request": CONSTANT}
        slots = [
            {
                "property": prop,
                "binding": {"state": "value", "ref": ref} if ref else {"state": "unbound"},
            }
            for prop, ref in sorted(self.slots.items())
        ]
        return {
            "schema_version": 1,
            "spec_id": PLACEHOLDER_ID,
            "identity": {
                "identity_version": "spec1",
                "shape": shape,
                "slots": slots,
                "entities": {},
                "requested_window": {
                    "kind": "range",
                    "start_year": FIRST_YEAR,
                    "end_year": LAST_YEAR,
                },
                "facets": facets,
            },
        }


def flow(aid: str, netting: str, finance: str | None = None) -> dict[str, str | None]:
    """Return the slots of a disbursement series; None leaves a slot unbound."""
    return {
        "dac1AidType": f"DAC1AidType{aid}",
        "dacTypeOfFinance": finance,
        "financialFlowType": "Disbursement",
        "nettingBasis": netting,
    }


# The slots mirror what Search returns for each series with France as provider.
SERIES = [
    Series("gross", "Gross ODA disbursements by provider", "FinancialFlow", "amount",
           flow("1010", "Gross")),
    Series("net", "Net ODA disbursements by provider", "FinancialFlow", "amount",
           flow("1010", "Net")),
    Series("grantEquivalent", "ODA grant equivalents by provider", "FinancialFlow",
           "grantEquivalent",
           {"dac1AidType": "DAC1AidType1010", "financialFlowType": "Disbursement"}),
    Series("commitments", "ODA commitments by provider", "FinancialObligation", "amount",
           {"dac1AidType": "DAC1AidType1010", "dacTypeOfFinance": None,
            "financialObligationType": "Commitment"}),
    Series("headline", "OECD headline ODA by provider", "FinancialFlow", "amount",
           flow("1010", "Net"), provenance=HEADLINE),
    Series("bilateral", "Gross bilateral ODA disbursements by provider", "FinancialFlow",
           "amount", flow("1015", "Gross")),
    Series("multilateral", "Gross multilateral ODA disbursements by provider",
           "FinancialFlow", "amount", flow("2000", "Gross")),
    Series("refugeeCosts", "In-donor refugee costs in OECD headline ODA by provider",
           "FinancialFlow", "amount", flow("1820", "Net"), provenance=HEADLINE),
    Series("grossNonGrants", "Gross ODA non-grant disbursements by provider",
           "FinancialFlow", "amount", flow("1010", "Gross", "DACTypeOfFinanceNonGrants")),
    Series("odaGni", "OECD headline ODA as a share of GNI by provider", "FinancialFlow",
           "amount",
           {"dac1AidType": "DAC1AidType1010", "financialFlowType": "Disbursement",
            "nettingBasis": "Net"},
           provenance=HEADLINE, denominator=GNI, constant=False),
]  # fmt: skip

type Values = dict[tuple[str, int], float]
type Fetched = dict[tuple[str, bool], Values]


def fetch_series(client: dfo.Client, series: Series, *, constant: bool):
    """Fetch one series for every provider.

    Returns the values by (provider, year), each provider's name and group flag, and
    the record of the read for the envelope's provenance.
    """
    definition = series.definition(constant=constant)
    spec_id = PLACEHOLDER_ID
    for attempt in range(2):
        definition["spec_id"] = spec_id
        # Search writes no sentence for a spec with the provider open, so the spec
        # carries the step's own, and the SDK does not ask Search for one.
        spec = dfo.Spec(spec_id=spec_id, definition=definition, sentence=series.sentence)
        try:
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                data = client.fetch(spec, party_totals=True, progress=False)
            break
        except dfo.errors.InvalidRequestError as error:
            match = RECOMPUTED.search(str(error))
            if attempt or not match:
                raise
            spec_id = match.group(1)

    frame = data.to_pandas()
    frame = frame[frame["value"].notna()]
    prices = "constant" if constant else "current"
    if series.constant and set(frame["price_basis"]) != {prices}:
        raise SystemExit(f"{series.key}: price basis {set(frame['price_basis'])}, not {prices}.")

    values: Values = {}
    providers: dict[str, dict] = {}
    for row in frame.itertuples(index=False):
        key = (str(row.financingProvider), int(row.time_period))
        if key in values:
            raise SystemExit(f"{series.key}: several rows for {key}.")
        values[key] = float(row.value)
        providers[key[0]] = {
            "name": row.financingProvider_label,
            "isGroup": row.financingProvider_kind == "total",
        }

    record = {
        "key": series.key,
        "prices": prices if series.constant else "ratio",
        "sentence": series.sentence,
        "specId": spec_id,
        "versions": [member.content_version for member in data.members],
        "citation": data.citation.text,
        "rows": len(frame),
        "warnings": sorted({str(w.message) for w in caught}),
    }
    return values, providers, record


def fetch_definitions() -> list[dict]:
    """Return each graph node's id, label and description, then the written entries."""
    response = httpx.post(GRAPH_NODES, json={"dcids": NODE_IDS}, timeout=60)
    response.raise_for_status()
    nodes = {node["ref"]: node for node in response.json()["nodes"]}
    missing = [ref for ref in NODE_IDS if not nodes.get(ref, {}).get("description")]
    if missing:
        raise SystemExit(f"The graph returned no description for {missing}.")
    graph = [
        {
            "id": ref,
            "label": nodes[ref]["label"] or FALLBACK_LABELS[ref],
            "description": nodes[ref]["description"],
            "source": "graph",
        }
        for ref in NODE_IDS
    ]
    return graph + [{**entry, "source": "page"} for entry in WRITTEN]


def by_year(values: Values, provider: str, *, scale: float, digits: int) -> list:
    """Return a provider's values for YEARS, divided by `scale`; null where missing."""
    out = []
    for year in YEARS:
        value = values.get((provider, year))
        out.append(None if value is None else round(value / scale, digits))
    return out


def partial_years(values: Values, countries: set[str], *, key: str) -> set[int]:
    """Return the years in which a group total of the series sums only some members.

    A year counts as partial when fewer than half of the countries that report the
    series in its best-covered year report it, as with the preliminary 2025 release,
    where only a few countries report commitments or the bilateral split. Grant
    equivalents became the OECD's basis in 2018, and earlier group totals sum only
    the members that reported them early, so those years count as partial too.
    """
    reporting = {year: 0 for year in YEARS}
    for provider, year in values:
        if provider in countries:
            reporting[year] += 1
    partial = {year for year, count in reporting.items() if count < max(reporting.values()) / 2}
    if key == "grantEquivalent":
        partial |= {year for year in YEARS if year < GRANT_EQUIVALENT_FROM}
    return partial


def build(fetched: Fetched, providers: dict[str, dict]) -> dict:
    """Return counts.json's `data`: the years and, per provider, every series by year.

    Amounts are in millions of US dollars and ODA/GNI is a percentage. Countries come
    first by name, then the group totals, which are null in a year they sum only some
    members (see `partial_years`).
    """
    countries = {provider for provider, about in providers.items() if not about["isGroup"]}
    partial = {
        item.key: partial_years(fetched[item.key, False], countries, key=item.key)
        for item in SERIES
    }
    donors = []
    order = sorted(providers.items(), key=lambda item: (item[1]["isGroup"], item[1]["name"]))
    for provider, about in order:
        series = {}
        for item in SERIES:
            if not item.constant:
                continue
            series[item.key] = {}
            for prices in ("current", "constant"):
                values = by_year(
                    fetched[item.key, prices == "constant"], provider, scale=1e6, digits=2
                )
                if about["isGroup"]:
                    values = [
                        None if year in partial[item.key] else value
                        for year, value in zip(YEARS, values, strict=True)
                    ]
                series[item.key][prices] = values
        odagni = by_year(fetched["odaGni", False], provider, scale=1, digits=3)
        donors.append({**about, "id": provider, "series": series, "odaGni": odagni})
    return {"years": YEARS, "baseYear": BASE_YEAR, "donors": donors}


def check(fetched: Fetched) -> list[str]:
    """Return every check the run fails; empty when all hold.

    The checks: the known values; each duplicate group equal to its provider; the OECD
    headline equal to net disbursements before 2018 and to grant equivalents from
    2018; and constant prices equal to current prices in the base year.
    """
    problems = []
    for provider, key, year, known in KNOWN:
        found = fetched[key, False].get((provider, year))
        if found is None or abs(found / known - 1) > 0.005:
            problems.append(f"{provider} {key} {year}: {found} where {known:.0f} is known")

    gross = fetched["gross", False]
    for group, provider in DUPLICATES.items():
        for year in YEARS:
            if gross.get((group, year)) != gross.get((provider, year)):
                problems.append(f"gross {year}: {group} no longer equals {provider}")

    for (provider, year), headline in fetched["headline", False].items():
        basis = "net" if year < GRANT_EQUIVALENT_FROM else "grantEquivalent"
        value = fetched[basis, False].get((provider, year))
        if value is None or abs(headline - value) > max(1e-3 * abs(value), 1e4):
            problems.append(f"headline {provider} {year}: {headline:.0f}, {basis} {value}")

    for item in SERIES:
        if not item.constant:
            continue
        current = fetched[item.key, False]
        for (provider, year), value in fetched[item.key, True].items():
            base = current.get((provider, year))
            if year != BASE_YEAR or base is None:
                continue
            if abs(value - base) > max(1e-4 * abs(base), 1e4):
                problems.append(
                    f"{item.key} {provider} {BASE_YEAR}: constant {value:.0f}, current {base:.0f}"
                )
    return problems


def write(path: Path, provenance: dict, data: object) -> None:
    """Write the envelope, each list of numbers on one line to keep the file short."""
    text = json.dumps({"provenance": provenance, "data": data}, indent=2, ensure_ascii=False)
    number = r"(?:-?[\d.eE+-]+|null)"
    text = re.sub(
        rf"\[\s+({number}(?:,\s+{number})*)\s+\]",
        lambda match: "[" + re.sub(r",\s+", ", ", match.group(1)) + "]",
        text,
    )
    path.write_text(text + "\n")


def provenance(query: str, **extra: object) -> dict:
    """Return the envelope's provenance, stamped with the SDK and the time now in UTC."""
    retrieved = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {
        "sdk": f"development-finance=={dfo.__version__}",
        "query": query,
        "retrieved": retrieved,
        **extra,
    }


def main() -> int:
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    log.setLevel(logging.INFO)
    here = Path(__file__).parent
    started = time.monotonic()

    fetched: Fetched = {}
    providers: dict[str, dict] = {}
    reads = []
    # An anonymous caller may build one dataset at a time, so the fetches run in turn.
    with dfo.Client(timeout=900.0, max_retries=3) as client:
        for series in SERIES:
            for constant in (False, True) if series.constant else (False,):
                values, found, record = fetch_series(client, series, constant=constant)
                fetched[series.key, constant] = values
                if series.key == "gross":
                    providers.update(
                        (provider, about)
                        for provider, about in found.items()
                        if provider not in DUPLICATES
                    )
                reads.append(record)
                log.info("%s %s: %d rows", series.key, record["prices"], record["rows"])

    problems = check(fetched)
    if problems:
        raise SystemExit("Known values differ:\n  " + "\n  ".join(problems))

    data = build(fetched, providers)
    definitions = fetch_definitions()
    citation = next(read["citation"] for read in reads if read["prices"] == "current")
    write(
        here / "counts.json",
        provenance(QUERY, citation=citation, dfo=reads),
        data,
    )
    write(
        here / "definitions.json",
        provenance(f"POST {GRAPH_NODES}", nodes=NODE_IDS),
        definitions,
    )

    no_constant = [
        donor["name"]
        for donor in data["donors"]
        if any(
            current is not None and constant is None
            for values in donor["series"].values()
            for current, constant in zip(values["current"], values["constant"], strict=True)
        )
    ]
    log.info(
        "Wrote %d donors over %d years from %d fetches in %.0fs. Missing constant prices: %s",
        len(data["donors"]),
        len(YEARS),
        len(reads) + 1,
        time.monotonic() - started,
        ", ".join(no_constant) or "none",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
