# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["development-finance==0.6.0"]
# ///
"""The fragility-finance refs step, run by hand with `pnpm data fragility-finance --refresh`.

Rewrites `refs.json`, the reads the page's build makes (`_lib/figures.ts`), for the OECD's 62
fragile contexts in `fragility-2026.tsv`:

- gross ODA disbursements from the OECD CRS, 2015 to 2024, in four reads of 16 recipients;
- gross other official flows (OOF) disbursements from the OECD CRS, in four reads of the same
  recipients;
- each DAC member's total ODA in 2024 and 2025 from DAC1, and EU institutions' in a read of
  its own;
- inward remittances (WDI) and FDI inflows (SDG database), 2015 to 2024;
- public external debt service from World Bank IDS, 2015 to 2033;
- climate finance received from ONE Data in 2024 under ONE's own method, for adaptation,
  mitigation and both;
- population (UNICEF) in 2024 and three living-conditions indicators (SDG database), 2010 to
  2025.

Each ref keeps the spec's full definition, which states what the page reads. The build reads
each at DFO's newest stored version, so the step writes no figures. It runs in one of two
modes:

- `--refresh`: fetch the newest versions of each committed ref, pin them and rewrite
  `refs.json`;
- `--search`: ask each question again, with one context as its example, fetch each reading
  for all 62 contexts, pin it and rewrite `refs.json`. A ref keeps its window and spec, so a
  change to either takes this mode.

Pins come out of a daily allowance.
"""

import argparse
import csv
import json
import logging
from collections.abc import Callable, Iterable
from datetime import UTC, datetime
from functools import cache
from pathlib import Path
from typing import Literal

import dfo

log = logging.getLogger("fragility-finance")

HERE = Path(__file__).parent
CLASSIFICATION = HERE / "fragility-2026.tsv"
REFS = HERE / "refs.json"

EXAMPLE = "Mozambique"
FLOW_YEARS = (2015, 2024)
DEBT_YEARS = (2015, 2033)
CLIMATE_YEAR = 2024
# The page draws each indicator's latest reading, which can be years old.
INDICATOR_YEARS = (2010, 2025)
# The page draws population in 2024 alone, beside that year's flows.
POPULATION_YEAR = 2024
# ONE Data's own climate method: each project's climate share (UNFCCC coefficients, else 40% of
# significant and 100% of principal markers), counted once under its higher marker. Without the
# facet the read returns the OECD's full-value weighting.
CLIMATE_METHOD = {"measurementMethod": "MarkerScoreWeightingHighestMarkerAssignment"}
# The CRS returns one row per provider, purpose, finance type and modality, so a read for all
# 62 recipients over ten years runs in a few groups.
CRS_GROUP = 16
CRS_CHUNKS = 4
CONTEXTS = 62
EU_INSTITUTIONS = "EuropeanUnionInstitutions"

# Living-conditions indicators: the page's key and the question.
INDICATORS = (
    ("stunting", "share of children under five who are stunted in Mozambique"),
    ("water", "share of population using basic drinking water services in Mozambique"),
    ("dtp3", "DTP3 immunisation coverage in Mozambique"),
)

type Mode = Literal["refresh", "search"]


class Reads:
    """The step's DFO reads under one mode, and what `refs.json` records of each.

    Each read has a key in `refs.json`. `--refresh` fetches the newest versions of the
    committed ref, `--search` the answer to the read's question. `keep` pins every read and
    records it.
    """

    def __init__(self, mode: Mode) -> None:
        self.mode = mode
        self.committed = json.loads(REFS.read_text()) if mode == "refresh" else None
        self.fetched: dict[str, dfo.Dataset] = {}
        self.records: dict[str, dict] = {}
        self.pins = 0

    def read(
        self,
        key: str,
        ask: Callable[[], dfo.Answer],
        *,
        role: str | None = None,
        places: Iterable[str] = (),
        window: tuple[int, int] | None = None,
        facets: dict[str, str] | None = None,
    ) -> dfo.Dataset:
        """Fetch read `key`: the committed ref's newest versions, or `ask()`'s answer for
        `places` under `role`. Fails unless each facet of `facets` holds its one value."""
        if key in self.fetched:
            raise SystemExit(f"{key}: read twice")

        if self.committed is None:
            options = {}

            if window is not None:
                options["window"] = window

            if facets is not None:
                options["facets"] = facets

            if role is not None:
                options["entities"] = {role: list(places)}

            data = ask().fetch(**options)
        else:
            if key not in self.committed["data"]:
                raise SystemExit(f"{key}: {REFS.name} holds no ref; run with --search")

            ref = dfo.DatasetRef.from_json(json.dumps(self.committed["data"][key]["ref"]))
            data = dfo.fetch(ref, latest=True)

        for column, value in (facets or {}).items():
            held = set(data.to_arrow().column(column).drop_null().unique().to_pylist())

            if held != {value}:
                raise SystemExit(f"{key}: expected {column} {value}, got {sorted(held)}")

        self.fetched[key] = data
        log.info("%s: %s rows, %s", key, f"{len(data):,}", data.sentence)
        return data

    def keep(self) -> None:
        """Pin each read and record its ref and provenance."""
        for key, data in self.fetched.items():
            self.pins += sum(1 for member in data.members if not member.pinned)
            pinned = dfo.pin(data)
            self.records[key] = {
                "ref": json.loads(pinned.ref.to_json()),
                "provenance": json.loads(pinned.provenance.to_json()),
            }

    def write(self) -> None:
        """Rewrite `refs.json`."""
        retrieved = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        envelope = {
            "provenance": {
                "sdk": f"development-finance=={dfo.__version__}",
                "query": "fragility-finance pinned reads",
                "retrieved": retrieved,
            },
            "data": self.records,
        }
        REFS.write_text(json.dumps(envelope, indent=1, ensure_ascii=False) + "\n")
        log.info("Wrote %s; pinned %d new versions.", REFS, self.pins)


def read_places(path: Path = CLASSIFICATION) -> list[str]:
    """The OECD's 62 contexts in `path`, most fragile first, as places."""
    with path.open(newline="", encoding="utf-8") as file:
        rows = sorted(csv.DictReader(file, delimiter="\t"), key=lambda row: float(row["overall"]))

    if len(rows) != CONTEXTS:
        raise SystemExit(f"{path.name}: expected {CONTEXTS} contexts, found {len(rows)}")

    return [f"country/{row['iso3']}" for row in rows]


def asking(key: str, question: str | None = None, **search) -> Callable[[], dfo.Answer]:
    """A search run at most once, on the first call, failing unless every part of the
    answer has one reading. `--refresh` never calls it."""

    @cache
    def answer() -> dfo.Answer:
        found = dfo.search(question, **search) if question else dfo.search(**search)

        if not found.complete:
            raise SystemExit(f"{key}: the search has no single reading.\n{found}")

        log.info("%s: %s", key, found.sentence)
        return found

    return answer


def crs_groups(places: list[str]) -> list[list[str]]:
    """`places` in groups of `CRS_GROUP`, failing unless there are `CRS_CHUNKS`."""
    groups = [places[start : start + CRS_GROUP] for start in range(0, len(places), CRS_GROUP)]

    if len(groups) != CRS_CHUNKS:
        raise SystemExit(f"{len(groups)} groups of recipients, not {CRS_CHUNKS}")

    return groups


def parse_arguments() -> Mode:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--refresh", action="store_true", help="pin the newest versions of the committed refs"
    )
    group.add_argument(
        "--search", action="store_true", help="search again and pin what the answers build"
    )
    return "search" if parser.parse_args().search else "refresh"


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    reads = Reads(parse_arguments())
    places = read_places()

    def place_reading(key: str, question: str, window: tuple[int, int]) -> None:
        reads.read(key, asking(key, question), role="place", places=places, window=window)

    def recipient_reading(
        key: str, window: tuple[int, int], facets: dict[str, str] | None = None, **search
    ) -> None:
        reads.read(
            key,
            asking(key, **search),
            role="destination",
            places=places,
            window=window,
            facets=facets,
        )

    for key, question in (
        ("aid", f"ODA to {EXAMPLE} by sector"),
        ("oof", f"gross other official flows (OOF) disbursements to {EXAMPLE}"),
    ):
        ask = asking(key, question)

        for index, group in enumerate(crs_groups(places), start=1):
            reads.read(f"{key}-{index}", ask, role="destination", places=group, window=FLOW_YEARS)

    # DFO's DAC members group holds the 32 member countries and leaves out EU institutions,
    # also a DAC member. A question naming EU institutions resolves to the EU's members or to
    # the EU as a recipient, so the EU is read from the same answer, named as the origin.
    # Its DAC1 code, EuropeanUnionInstitutions, is the provider code the CRS uses.
    ask_donors = asking("donors2025", "total ODA of each DAC donor in 2024 and 2025")
    reads.read("donors2025", ask_donors)
    reads.read("donors2025-eu", ask_donors, role="origin", places=[EU_INSTITUTIONS])
    place_reading("remittances", f"inward remittances to {EXAMPLE} in US dollars", FLOW_YEARS)
    place_reading("fdi", f"foreign direct investment inflows to {EXAMPLE}", FLOW_YEARS)
    recipient_reading("debtService", DEBT_YEARS, codes=["DT.TDS.DPPG.CD"])

    for objective, question in (
        ("total", f"climate finance to {EXAMPLE}"),
        ("adaptation", f"climate adaptation finance to {EXAMPLE}"),
        ("mitigation", f"climate mitigation finance to {EXAMPLE}"),
    ):
        recipient_reading(
            f"climate-{objective}",
            (CLIMATE_YEAR, CLIMATE_YEAR),
            facets=CLIMATE_METHOD,
            question=question,
        )

    place_reading("population", f"population of {EXAMPLE}", (POPULATION_YEAR, POPULATION_YEAR))

    for key, question in INDICATORS:
        place_reading(key, question, INDICATOR_YEARS)

    reads.keep()
    reads.write()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
