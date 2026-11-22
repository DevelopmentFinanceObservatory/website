# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["development-finance[pandas]==0.4.2", "httpx==0.28.1"]
# ///
"""The oda-counts data step, run by hand with `pnpm data oda-counts`.

Reads every OECD DAC1 count of ODA for every provider, 2015 to 2025, in current and
constant 2024 US dollars, checks known values, failing loudly when one differs, and
writes `counts.json` beside this file. Each of the 19 reads is a pinned DFO dataset
whose ref and provenance `refs.json` keeps.

The step runs in one of three modes:

- plain, the default: fetch each ref in `refs.json` and write `counts.json`, copying
  the provenance and the retrieval time from `refs.json`, so the file reproduces
  byte for byte. It fails when a ref is not pinned.
- `--refresh`: fetch the newest versions of each ref's specs, pin them, and rewrite
  `refs.json`, `live-refs.json`, `counts.json`, `definitions.json` and `live.json`.
- `--search`: build each read from the step's own spec, then pin and write as
  `--refresh` does. A ref keeps its spec and window, so a change to `SERIES` or the
  years needs this mode once.

The page reads the same 19 refs in the browser from `live-refs.json`, at DFO's newest
stored versions, and derives counts.json's figures from their rows with `_lib/derive.ts`,
which ports `build` and `check`. counts.json is the first paint and the fallback. After a
refresh, rerun `_data/fixture.mts` so `_lib/derive.test.mts` checks the port against the
new counts.json.

`definitions.json` holds the graph definitions the page composes each count's
definition from. `live.json` holds the identity of each monetary series, which the
page posts to Search with one provider and a unit bound to fetch that provider in any
currency and price basis, and the conversion offer the series share. Neither is a
dataset, so neither has a ref, and a plain run leaves both as they are.

Each series is a DFO spec built here from its StatVar parts with the provider role
open, so one fetch returns every provider and the DAC group totals.
"""

import argparse
import json
import logging
import re
import time
import warnings
from collections.abc import Iterator
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
DAC1 = "provenance/OECDDAC1"
HEADLINE = "provenance/ONEOECDHeadlineODA"
GNI = "PrimaryIncome_EconomicUnit_GrossOfFixedCapitalConsumption_Nominal"
RESOLVE = "https://developmentfinance.org/api/v1/search/resolve"
# The most entries one resolve request takes.
RESOLVE_ENTRIES = 6

# The currencies of the 32 DAC members, the only currencies the page converts to. DAC1
# publishes their exchange rates itself. ONE's tables take every other rate from the IMF.
DAC_CURRENCIES = (
    "USD",  # United States
    "EUR",  # 20 members, among them the EU institutions
    "GBP",  # United Kingdom
    "JPY",  # Japan
    "CAD",  # Canada
    "AUD",  # Australia
    "NZD",  # New Zealand
    "CHF",  # Switzerland
    "NOK",  # Norway
    "SEK",  # Sweden
    "DKK",  # Denmark
    "ISK",  # Iceland
    "KRW",  # Korea
    "CZK",  # Czechia
    "HUF",  # Hungary
    "PLN",  # Poland
)
# A spec id no definition hashes to. A build refuses it with the id the server computed.
# A conversion posts the identity alone, and Search names the converted spec.
PLACEHOLDER_ID = "spec_" + "0" * 32
RECOMPUTED = re.compile(r"recomputed id '(spec_[0-9a-f]+)'")

REFS = "refs.json"
REFS_QUERY = "oda-counts pinned reads"
LIVE_REFS = "live-refs.json"
LIVE_REFS_QUERY = "oda-counts pinned reads, read in the browser at the newest stored versions"
QUERY = (
    "Every OECD DAC1 count of ODA by provider, 2015 to 2025: gross and net disbursements, "
    "grant equivalents, commitments and the OECD headline, with gross bilateral, "
    "multilateral and non-grant disbursements, in-donor refugee costs and ODA/GNI, "
    "in current and constant 2024 US dollars"
)

# Graph nodes the page composes definitions from (`PARTS` and `PRICE_PART` in
# _lib/counts.ts). Fetching only these means a node the page never shows cannot fail the run.
NODE_IDS = [
    "Gross",
    "Net",
    "Disbursement",
    "Commitment",
    "grantEquivalent",
    "grantElement",
    "Nominal",
]
# Labels for the graph nodes that carry none.
FALLBACK_LABELS = {"Nominal": "current prices"}
# No graph node exists for these two. The text follows the DFO's oda-measures skill.
WRITTEN = [
    {
        "id": "oecdHeadline",
        "label": "OECD headline ODA",
        "description": (
            "Starting with 2018 data, the new grant equivalent measure of ODA became the "
            "standard for reporting, with the headline ODA figures published on that basis."
        ),
        "url": (
            "https://www.oecd.org/en/topics/sub-issues/oda-eligibility-and-conditions/"
            "official-development-assistance--definition-and-coverage.html"
        ),
    },
    {
        "id": "constantPrices",
        "label": "constant dollars",
        "description": (
            "In DAC publications, flow data are expressed in US dollars (USD). To give a "
            "truer idea of the volume of flows over time, data can be presented in constant "
            "prices and exchange rates, with a reference year specified. This means that "
            "adjustment has been made to cover both inflation in the donor\u2019s currency "
            "between the year in question and the reference year, and changes in the "
            "exchange rate between that currency and the United States dollar over the "
            "same period."
        ),
        "url": (
            "https://www.oecd.org/en/topics/sub-issues/oda-standards/"
            "glossary-of-statistical-terms-and-concepts-of-development-finance.html"
        ),
    },
]


# Group totals that repeat a provider's own figures, and the provider they repeat.
# The EU institutions are the only multilateral that reports to DAC1.
DUPLICATES = {"DACMultilaterals": "EuropeanUnionInstitutions"}

# Plain names for group totals whose DFO label reads badly on the page. The graph
# describes DACNonDACCountries as the countries that provide official flows in DAC
# statistics without being members or associates of the DAC.
GROUP_NAMES = {"DACNonDACCountries": "Non-DAC countries reporting to the DAC"}

# Providers whose group flag the run must reproduce: a group total and a country.
KNOWN_KINDS = {"DACCountriesTotal": True, "country/FRA": False}

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

    @property
    def reads(self) -> tuple[str, ...]:
        """The prices this series is read in: current and constant, or one ratio."""
        return ("current", "constant") if self.constant else ("ratio",)

    def identity(self) -> dict:
        """Return the Search identity, with no provider and no unit bound."""
        shape = {
            "kind": "statvar_schema",
            "population_type": self.population,
            "measured_property": self.measured,
            "stat_type": "measuredValue",
            "measurement_qualifier": "Nominal",
        }
        if self.denominator:
            shape["measurement_denominator"] = {"ref": self.denominator}
        slots = [
            {
                "property": prop,
                "binding": {"state": "value", "ref": ref} if ref else {"state": "unbound"},
            }
            for prop, ref in sorted(self.slots.items())
        ]
        return {
            "identity_version": "spec1",
            "shape": shape,
            "slots": slots,
            "entities": {},
            "requested_window": {"kind": "range", "start_year": FIRST_YEAR, "end_year": LAST_YEAR},
            "facets": {"provenance": {"state": "value", "ref": self.provenance}},
        }

    def spec(self, spec_id: str = PLACEHOLDER_ID) -> dfo.Spec:
        """Return the spec with the provider role open, carrying the step's sentence.

        Without the open role, Search reads a conversion of the identity as the DAC
        countries' total alone. Search writes no sentence for a built spec with the
        provider open, so the spec carries the step's own.
        """
        definition = {
            "schema_version": 1,
            "spec_id": spec_id,
            "identity": {**self.identity(), "open_roles": ["origin"]},
        }
        return dfo.Spec(spec_id=spec_id, definition=definition, sentence=self.sentence)


def flow(aid: str, netting: str, finance: str | None = None) -> dict[str, str | None]:
    """Return the slots of a disbursement series. None leaves a slot unbound."""
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
    # Net disbursements: refugee costs are grants, so these match the headline's grant
    # equivalents to within 0.2% for 2018-2024, and they reach the preliminary year.
    Series("refugeeCosts", "In-donor refugee costs, net ODA disbursements by provider",
           "FinancialFlow", "amount", flow("1820", "Net")),
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


@dataclass(frozen=True)
class Read:
    """One of the step's reads: a series in one price basis, keyed in `refs.json`."""

    series: Series
    prices: str

    @property
    def key(self) -> str:
        return f"{self.series.key}/{self.prices}"


READS = [Read(series, prices) for series in SERIES for prices in series.reads]


def search_read(client: dfo.Client, read: Read) -> dfo.Dataset:
    """Fetch a read for every provider from the step's own spec.

    A constant-price read asks Search to convert the spec, and Search names the
    converted spec. A build takes the spec's own id, which the server recomputes
    from the definition and names in its first refusal.
    """
    series = read.series
    if read.prices == "constant":
        return client.fetch(
            series.spec(),
            currency="USD",
            price_basis="constant",
            base_year=BASE_YEAR,
            party_totals=True,
            progress=False,
        )
    try:
        return client.fetch(series.spec(), party_totals=True, progress=False)
    except dfo.errors.InvalidRequestError as error:
        match = RECOMPUTED.search(str(error))
        if error.code != "spec_id_mismatch" or match is None:
            raise
    return client.fetch(series.spec(match.group(1)), party_totals=True, progress=False)


def values_of(read: Read, data: dfo.Dataset) -> tuple[Values, dict[str, dict]]:
    """Return a read's values by (provider, year), and each provider's name and group flag."""
    if len(data.members) != 1:
        raise SystemExit(f"{read.key}: the fetch served {len(data.members)} members, not one.")
    frame = data.to_pandas()
    frame = frame[frame["value"].notna()]
    if read.prices != "ratio" and set(frame["price_basis"]) != {read.prices}:
        raise SystemExit(f"{read.key}: price basis {set(frame['price_basis'])}, not {read.prices}.")

    values: Values = {}
    providers: dict[str, dict] = {}
    for row in frame.itertuples(index=False):
        key = (str(row.financingProvider), int(row.time_period))
        if key in values:
            raise SystemExit(f"{read.key}: several rows for {key}.")
        values[key] = float(row.value)
        providers[key[0]] = {
            "name": GROUP_NAMES.get(key[0], row.financingProvider_label),
            "isGroup": row.financingProvider_kind == "total",
        }
    return values, providers


def committed_refs(path: Path) -> dict:
    """Return `refs.json`, failing unless it holds exactly the step's reads."""
    if not path.exists():
        raise SystemExit(f"{path.name} does not exist; run the step with --search.")
    refs = json.loads(path.read_text())
    keys = [read.key for read in READS]
    if sorted(refs["data"]) != sorted(keys):
        raise SystemExit(f"{path.name} holds {sorted(refs['data'])}, not the reads {keys}.")
    return refs


def read_all(
    client: dfo.Client, mode: str, refs: dict | None
) -> Iterator[tuple[Read, dfo.Dataset]]:
    """Fetch each read as `mode` asks, one at a time.

    An anonymous caller may build one dataset at a time, so the fetches run in turn.
    """
    for read in READS:
        if refs is None:
            data = search_read(client, read)
        else:
            ref = dfo.DatasetRef.from_json(json.dumps(refs["data"][read.key]["ref"]))
            data = client.fetch(ref, latest=mode == "refresh", progress=False)
            if mode == "plain" and not data.pinned:
                raise SystemExit(f"{read.key}: the committed ref is not pinned.")
        log.info("%s: %d rows, %s", read.key, len(data), data.members[0].spec.spec_id)
        yield read, data


def record(read: Read, provenance: dfo.Provenance, rows: int) -> dict:
    """Return counts.json's record of one read, from its provenance."""
    member = provenance.members[0]
    return {
        "key": read.series.key,
        "prices": read.prices,
        "specId": member.spec.spec_id,
        "version": member.content_version,
        "rows": rows,
        "warnings": sorted({notice.code for notice in provenance.warnings}),
    }


def fetch_definitions(client: dfo.Client) -> list[dict]:
    """Return each graph node's id, label and description, then the written entries."""
    nodes = {ref: client.lookup.node(ref) for ref in NODE_IDS}
    missing = [ref for ref, node in nodes.items() if not node.raw.get("description")]
    if missing:
        raise SystemExit(f"The graph returned no description for {missing}.")
    unlabelled = [
        ref for ref, node in nodes.items() if not node.name and ref not in FALLBACK_LABELS
    ]
    if unlabelled:
        raise SystemExit(f"The graph returned no label for {unlabelled}, and none is written.")
    graph = [
        {
            "id": ref,
            "label": node.name or FALLBACK_LABELS[ref],
            "description": node.raw["description"],
            "source": "graph",
        }
        for ref, node in nodes.items()
    ]
    return graph + [{**entry, "source": "oecd"} for entry in WRITTEN]


def fetch_offer() -> dict:
    """Return the conversion offer every monetary series shares, failing when they differ.

    Each series is resolved with every provider open, so the offer covers each currency
    any provider converts to. The page keeps only the DAC members' currencies. The offer
    keeps each currency's code, noun, years and base years, and the base year a
    constant-price request completes to.
    """
    monetary = [series for series in SERIES if series.constant]
    offers = {}
    for start in range(0, len(monetary), RESOLVE_ENTRIES):
        batch = monetary[start : start + RESOLVE_ENTRIES]
        entries = [
            {
                "entry_kind": "identity",
                "variable_text": series.sentence,
                "identity": {**series.identity(), "open_roles": ["origin"]},
            }
            for series in batch
        ]
        body = {
            "schema_version": 1,
            "input": {"kind": "dataset_resubmit", "entries": entries},
            "response_options": {"include_option_coverage": False, "include_observations": False},
        }
        response = httpx.post(RESOLVE, json=body, timeout=120)
        response.raise_for_status()
        for series, part in zip(batch, response.json()["parts"], strict=True):
            if part["status"] != "definite":
                raise SystemExit(f"{series.key}: Search answered {part['status']}, not definite.")
            conversion = part["spec"]["resolved"].get("unit_conversion") or {}
            offers[series.key] = {
                "defaultBaseYear": conversion.get("default_base_year"),
                "currencies": conversion.get("currencies", []),
            }
    first = offers[monetary[0].key]
    if not first["currencies"]:
        raise SystemExit("Search offers no currency to convert the series to.")
    differ = [key for key, offer in offers.items() if offer != first]
    if differ:
        raise SystemExit(f"The conversion offers of {differ} differ from {monetary[0].key}'s.")
    return dac_only(first)


def dac_only(offer: dict) -> dict:
    """Return `offer` cut to the DAC members' currencies, failing if Search lacks one."""
    held = {currency["code"] for currency in offer["currencies"]}
    missing = [code for code in DAC_CURRENCIES if code not in held]
    if missing:
        raise SystemExit(f"Search offers no conversion to {missing}.")
    currencies = [c for c in offer["currencies"] if c["code"] in DAC_CURRENCIES]
    return {**offer, "currencies": currencies}


def by_year(values: Values, provider: str, *, scale: float, digits: int) -> list:
    """Return a provider's values for YEARS, divided by `scale`, with null where missing."""
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
    """Return counts.json's `data`, with the years and, per provider, every series by year.

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


def check(fetched: Fetched, providers: dict[str, dict]) -> list[str]:
    """Return every check the run fails, empty when all hold.

    The run checks the known values and group flags, that every renamed group is
    present, that each duplicate group is present and equals its provider in every
    year, that the OECD headline equals net disbursements before 2018 and grant
    equivalents from 2018, and that constant prices equal current prices in the
    base year.
    """
    problems = []
    for provider, key, year, known in KNOWN:
        found = fetched[key, False].get((provider, year))
        if found is None or abs(found / known - 1) > 0.005:
            problems.append(f"{provider} {key} {year}: {found} where {known:.0f} is known")

    for provider, is_group in KNOWN_KINDS.items():
        found = providers.get(provider, {}).get("isGroup")
        if found is not is_group:
            problems.append(f"{provider}: isGroup is {found}, where {is_group} is known")

    problems.extend(
        f"{group}: no figures, so its name {name!r} is unused"
        for group, name in GROUP_NAMES.items()
        if group not in providers
    )

    gross = fetched["gross", False]
    for group, provider in DUPLICATES.items():
        for year in YEARS:
            repeated, own = gross.get((group, year)), gross.get((provider, year))
            if repeated is None or own is None or repeated != own:
                problems.append(f"gross {year}: {group} {repeated} does not equal {provider} {own}")

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


def provenance(query: str, retrieved: str, **extra: object) -> dict:
    """Return the envelope's provenance, stamped with the SDK and the retrieval time."""
    return {
        "sdk": f"development-finance=={dfo.__version__}",
        "query": query,
        "retrieved": retrieved,
        **extra,
    }


def parse_mode() -> str:
    """Return the mode the command line names: plain, refresh or search."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--refresh", action="store_true", help="fetch the newest versions of each ref and pin them"
    )
    modes.add_argument(
        "--search", action="store_true", help="build each read from the step's specs and pin it"
    )
    options = parser.parse_args()
    return "refresh" if options.refresh else "search" if options.search else "plain"


def main() -> int:
    mode = parse_mode()
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    log.setLevel(logging.INFO)
    # Each conversion with the provider open says it covers every provider, as asked.
    warnings.filterwarnings("ignore", message=r".*\[role_scope_defaulted\]")
    here = Path(__file__).parent
    started = time.monotonic()
    refs = None if mode == "search" else committed_refs(here / REFS)

    fetched: Fetched = {}
    providers: dict[str, dict] = {}
    datasets: dict[str, dfo.Dataset] = {}
    rows: dict[str, int] = {}
    with dfo.Client(timeout=900.0, max_retries=3) as client:
        for read, data in read_all(client, mode, refs):
            values, found = values_of(read, data)
            fetched[read.series.key, read.prices == "constant"] = values
            if read.key == "gross/current":
                providers.update(
                    (provider, about)
                    for provider, about in found.items()
                    if provider not in DUPLICATES
                )
            datasets[read.key] = data
            rows[read.key] = len(values)

        problems = check(fetched, providers)
        if problems:
            raise SystemExit("Known values differ:\n  " + "\n  ".join(problems))

        if mode == "plain":
            assert refs is not None
            retrieved = refs["provenance"]["retrieved"]
            records = {
                key: dfo.Provenance.from_json(entry["provenance"])
                for key, entry in refs["data"].items()
            }
        else:
            retrieved = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            # Pin only once the checks hold, since each new pin counts against a daily allowance.
            datasets = {key: client.pin(data) for key, data in datasets.items()}
            log.info("Pinned %d members.", sum(len(data.members) for data in datasets.values()))
            records = {key: data.provenance for key, data in datasets.items()}
            write(
                here / REFS,
                provenance(REFS_QUERY, retrieved),
                {
                    key: {
                        "ref": json.loads(data.ref.to_json()),
                        "provenance": json.loads(data.provenance.to_json()),
                    }
                    for key, data in datasets.items()
                },
            )
            write(
                here / LIVE_REFS,
                provenance(LIVE_REFS_QUERY, retrieved),
                {key: json.loads(data.ref.to_json()) for key, data in datasets.items()},
            )
            write(
                here / "definitions.json",
                provenance("client.lookup.node of each graph node", retrieved, nodes=NODE_IDS),
                fetch_definitions(client),
            )

    data = build(fetched, providers)
    write(
        here / "counts.json",
        provenance(
            QUERY,
            retrieved,
            citation=records["gross/current"].citation.text,
            refs=REFS,
            dfo=[record(read, records[read.key], rows[read.key]) for read in READS],
        ),
        data,
    )

    if mode != "plain":
        write(
            here / "live.json",
            provenance(
                f"POST {RESOLVE}",
                retrieved,
                note="Identities with the provider role and the unit left for the page to bind.",
            ),
            {
                "maxEntries": RESOLVE_ENTRIES,
                "identities": [
                    {"key": series.key, "sentence": series.sentence, "identity": series.identity()}
                    for series in SERIES
                    if series.constant
                ],
                "offer": fetch_offer(),
            },
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
        "Wrote %d donors over %d years from %d reads (%s) in %.0fs. Missing constant prices: %s",
        len(data["donors"]),
        len(YEARS),
        len(READS),
        mode,
        time.monotonic() - started,
        ", ".join(no_constant) or "none",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
