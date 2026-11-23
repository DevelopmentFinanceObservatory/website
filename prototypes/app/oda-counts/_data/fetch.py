# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["development-finance==0.4.2"]
# ///
"""The oda-counts data step, run by hand with `pnpm data oda-counts`.

Pins the 19 OECD DAC1 reads the page takes, every provider, 2015 to 2025, in current and
constant 2024 US dollars, and ODA/GNI, and rewrites `refs.json` and `live-refs.json`
beside this file. The page reads no figures from the repository: `pnpm read`
(scripts/read.mts) reads each ref in `live-refs.json` at DFO's newest stored versions
before `next build`, and derives the page's figures with `_lib/derive.ts` (`_lib/build.ts`). The refs are the page's query config, so the
step needs to run only when a read's spec or window changes.

The step runs in one of two modes:

- refresh, the default: fetch the newest versions of each ref's specs, pin them, and
  rewrite both files.
- `--search`: build each read from the step's own spec, then pin and write as refresh
  does. A ref keeps its spec and window, so a change to `SERIES` or the years needs
  this mode once.

Each series is a DFO spec built here from its StatVar parts with the provider role
open, so one fetch returns every provider and the DAC group totals. The page takes each
monetary series' Search identity from its current-price ref, so the specs here are also
what a reader's currency pick asks Search for.
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

log = logging.getLogger("oda-counts")

FIRST_YEAR, LAST_YEAR = 2015, 2025
BASE_YEAR = 2024
DAC1 = "provenance/OECDDAC1"
HEADLINE = "provenance/ONEOECDHeadlineODA"
GNI = "PrimaryIncome_EconomicUnit_GrossOfFixedCapitalConsumption_Nominal"
# A spec id no definition hashes to. A build refuses it with the id the server computed.
# A conversion posts the identity alone, and Search names the converted spec.
PLACEHOLDER_ID = "spec_" + "0" * 32
RECOMPUTED = re.compile(r"recomputed id '(spec_[0-9a-f]+)'")

REFS = "refs.json"
REFS_QUERY = "oda-counts pinned reads"
LIVE_REFS = "live-refs.json"
LIVE_REFS_QUERY = "oda-counts pinned reads, read by the build at the newest stored versions"


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


def committed_refs(path: Path) -> dict:
    """Return `refs.json`, failing unless it holds exactly the step's reads."""
    if not path.exists():
        raise SystemExit(f"{path.name} does not exist; run the step with --search.")
    refs = json.loads(path.read_text())
    keys = [read.key for read in READS]
    if sorted(refs["data"]) != sorted(keys):
        raise SystemExit(f"{path.name} holds {sorted(refs['data'])}, not the reads {keys}.")
    return refs


def read_all(client: dfo.Client, refs: dict | None) -> Iterator[tuple[Read, dfo.Dataset]]:
    """Fetch each read at its spec's newest version, or from the step's spec without `refs`.

    An anonymous caller may build one dataset at a time, so the fetches run in turn. Each
    read must serve one member, as the page's derivation requires.
    """
    for read in READS:
        if refs is None:
            data = search_read(client, read)
        else:
            ref = dfo.DatasetRef.from_json(json.dumps(refs["data"][read.key]["ref"]))
            data = client.fetch(ref, latest=True, progress=False)
        if len(data.members) != 1:
            raise SystemExit(f"{read.key}: the fetch served {len(data.members)} members, not one.")
        log.info("%s: %d rows, %s", read.key, len(data), data.members[0].spec.spec_id)
        yield read, data


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
    """Return the mode the command line names: refresh, the default, or search."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--refresh", action="store_true", help="fetch the newest versions of each ref and pin them"
    )
    modes.add_argument(
        "--search", action="store_true", help="build each read from the step's specs and pin it"
    )
    return "search" if parser.parse_args().search else "refresh"


def main() -> int:
    mode = parse_mode()
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    log.setLevel(logging.INFO)
    # Each conversion with the provider open says it covers every provider, as asked.
    warnings.filterwarnings("ignore", message=r".*\[role_scope_defaulted\]")
    here = Path(__file__).parent
    started = time.monotonic()
    refs = None if mode == "search" else committed_refs(here / REFS)

    with dfo.Client(timeout=900.0, max_retries=3) as client:
        datasets = {read.key: data for read, data in read_all(client, refs)}
        retrieved = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        # Pin only once every read holds one member, since each new pin counts against a
        # daily allowance.
        datasets = {key: client.pin(data) for key, data in datasets.items()}

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
    log.info("Pinned %d reads (%s) in %.0fs.", len(datasets), mode, time.monotonic() - started)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
