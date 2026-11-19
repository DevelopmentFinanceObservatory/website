"""The command line entry point: reads the sources and writes the output files.

`main` is the only place that reads the clock, opens the HTTP clients, sets up
logging or exits. Every DFO read is a pinned ref (`pipeline.sources.pinned`):
a plain run fetches the refs refs.json holds and reproduces every output byte
for byte; `--refresh` fetches their newest versions; `--search` builds each read
from its series code. It writes, into the output folder:

- `coverage.md`: the countries by series for both base years, the creditor-group
  guard and the lending-terms fallback. The run returns 1 when more than
  `MAX_MISSING` countries lack a core series in the default year.
- `inputs.json`: an envelope whose `data` maps base year, then ISO3 code, to the
  `inputs` dict `pipeline.project.project_service` takes, shaped as that module's
  docstring describes. Two keys are extra: `contracted_disbursements`, the IDS
  projected disbursements on commitments already made, by creditor group, from
  the base year + 1 to the end year; and `projection_error`, the message
  `project_service` raised for the country, or null.
- `thresholds.json`: an envelope whose `data` is `ThresholdsData` (`types.ts`).
- `transfers.json`: the IDS release label and the 75 countries of groups.csv; the
  page reads their net transfers from the ref in `live-refs.json`.
- `transfers-fixture.json`: real net-transfers rows and `pipeline.transfers`'
  output for them, for the page's parity test.
- `refs.json`: each read's ref and provenance, by read key; `live-refs.json`: the
  refs the page reads in the browser; `readings.json`: Search's answer to each
  series code, or the pinned spec, as the last `--search` run made them.
- `reference.json`: the IDS release label, and the US rate and IDA status each
  view was built on. A refresh keeps the archived view's values, so the 2024
  view does not move.

IDS projects service on all commitments already made, including the parts not
yet disbursed, and projects the disbursements of those parts. The schedule in
`contracted` therefore covers loans whose disbursements also fund part of each
year's need; `contracted_disbursements` carries them for the projection to net.
"""

import argparse
import json
import logging
import sys
from collections.abc import Mapping, Sequence
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import dfo
import httpx

from pipeline.build import build_view
from pipeline.config import MAX_MISSING, Paths, views
from pipeline.countries import COUNTRIES
from pipeline.coverage import coverage_rows, render_coverage
from pipeline.creditors import estimate_imf_charges, guard_groups
from pipeline.errors import DataError
from pipeline.output import write_envelope, write_text
from pipeline.panel import Series
from pipeline.provenance import (
    Ledger,
    base_provenance,
    citation,
    envelope_provenance,
    utc_stamp,
)
from pipeline.sources.dfo_api import fetch_dfo, ids_release
from pipeline.sources.ids_bulk import load_ids
from pipeline.sources.pinned import Mode, Reads
from pipeline.sources.reference import (
    Snapshot,
    load_capacity,
    record_reference,
    snapshot_values,
    view_snapshots,
)
from pipeline.sources.transfers import KEY as TRANSFERS_KEY
from pipeline.sources.transfers import read_net_transfers
from pipeline.sources.weo import load_weo
from pipeline.terms import lending_terms
from pipeline.transfers import (
    build_transfers,
    countries_without_values,
    parity_fixture,
    parse_groups,
    transfers_by_country,
    transfers_provenance,
)

log = logging.getLogger("pipeline")

QUERIES = {
    "refs.json": "debt-thresholds pinned reads",
    "live-refs.json": "debt-thresholds browser reads",
    "readings.json": "debt-thresholds readings: Search's answer to each series code",
    "reference.json": (
        "debt-thresholds reference reads: the IDS release the DFO holds, and FRED GS10 "
        "and World Bank lending categories by base year"
    ),
    "transfers-fixture.json": (
        "Net-transfers rows of seven countries, one without rows, from the transfers ref, with "
        "pipeline.transfers' output for them"
    ),
}


def main(argv: Sequence[str] | None = None) -> int:
    """Run the data step and return the process exit code."""
    parser = argparse.ArgumentParser(description="Build the debt-thresholds data files.")
    parser.add_argument("--out", type=Path, default=Paths.default().out, help="output folder")
    parser.add_argument(
        "--only", choices=("thresholds", "transfers"), help="build one part from the committed refs"
    )
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--refresh", action="store_true", help="fetch the newest versions of the refs and pin them"
    )
    modes.add_argument(
        "--search", action="store_true", help="build each read from its series code and pin it"
    )
    parser.add_argument(
        "--no-pin", action="store_true", help="leave new versions unpinned, for a trial run"
    )
    args = parser.parse_args(argv)
    mode = Mode.SEARCH if args.search else Mode.REFRESH if args.refresh else Mode.PLAIN
    if args.only and mode is not Mode.PLAIN:
        # refs.json carries one `retrieved` stamp for every output, so a refresh
        # rebuilds them all.
        parser.error("--only builds from the committed refs; refresh or search without it")

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("fetch.py: %(message)s"))
    log.handlers[:] = [handler]
    log.setLevel(logging.INFO)
    log.propagate = False

    committed_dir = Paths.default().out
    args.out.mkdir(parents=True, exist_ok=True)
    try:
        refs = read_data(committed_dir / "refs.json")
        reference = read_data(committed_dir / "reference.json") or {}
        if mode is Mode.PLAIN:
            if refs is None:
                raise DataError("refs.json is missing; run with --search.")
            retrieved = read_retrieved(committed_dir / "refs.json")
        else:
            retrieved = utc_stamp(datetime.now(UTC))
        today = date.fromisoformat(retrieved[:10])

        with dfo.Client(timeout=900.0, max_retries=3) as dfo_client, httpx.Client() as client:
            reads = Reads(dfo_client, mode=mode, committed=refs or {}, pin=not args.no_pin)
            release = reference_release(reference, mode=mode)
            snapshots = view_snapshots(
                views(today, current_ids=release),
                reference.get("views", {}),
                mode=mode,
                client=client,
                today=today,
            )
            code = 0
            if args.only != "transfers":
                code = build_thresholds(
                    args.out,
                    reads=reads,
                    client=client,
                    snapshots=snapshots,
                    ids=release,
                    retrieved=retrieved,
                )
            if args.only != "thresholds":
                build_transfer_file(args.out, reads=reads, release=release, retrieved=retrieved)
    except DataError as error:
        print(f"fetch.py: {error}", file=sys.stderr)
        return 1

    if mode is not Mode.PLAIN:
        write_refs(
            args.out,
            reads,
            committed=refs or {},
            reference={"idsRelease": release, "views": snapshots},
            retrieved=retrieved,
        )
        log.info("pinned %d new member(s).", reads.pins)
    return code


def read_data(path: Path) -> Any:
    """Return the `data` of a committed envelope, or None when the file is not there."""
    return json.loads(path.read_text())["data"] if path.exists() else None


def read_retrieved(path: Path) -> str:
    """Return the `provenance.retrieved` stamp of a committed envelope."""
    return json.loads(path.read_text())["provenance"]["retrieved"]


def reference_release(reference: Mapping[str, Any], *, mode: Mode) -> str:
    """Return the IDS release label: the committed one in a plain run, else the DFO's."""
    if mode is not Mode.PLAIN:
        return ids_release()
    if "idsRelease" not in reference:
        raise DataError("reference.json has no idsRelease; run with --refresh.")
    return reference["idsRelease"]


def write_refs(
    out: Path,
    reads: Reads,
    *,
    committed: Mapping[str, Any],
    reference: dict,
    retrieved: str,
) -> None:
    """Write refs.json, live-refs.json, reference.json and, after a search, readings.json."""
    sdk = dfo.__version__
    records = {**committed, **reads.records}

    def envelope(name: str, data: object) -> None:
        provenance = base_provenance(sdk_version=sdk, query=QUERIES[name], retrieved=retrieved)
        write_envelope(out / name, provenance, data)

    envelope("refs.json", records)
    if TRANSFERS_KEY in records:
        envelope("live-refs.json", {TRANSFERS_KEY: records[TRANSFERS_KEY]["ref"]})
    envelope("reference.json", reference)
    if reads.readings:
        readings = read_data(Paths.default().out / "readings.json") or {}
        envelope("readings.json", {**readings, **reads.readings})


def build_thresholds(
    out: Path,
    *,
    reads: Reads,
    client: httpx.Client,
    snapshots: Mapping[str, Snapshot],
    ids: str,
    retrieved: str,
) -> int:
    """Write coverage.md, inputs.json and thresholds.json; return the exit code."""
    today = date.fromisoformat(retrieved[:10])
    defaults = Paths.default()
    paths = Paths(out=out, cache=defaults.cache)
    both = views(today, current_ids=ids)
    ledger = Ledger()
    capacity = load_capacity(defaults.out / "capacity.csv", ledger=ledger)

    bases: dict[int, dict[str, dict]] = {}
    inputs: dict[str, dict[str, dict]] = {}
    checks: dict[int, dict] = {}
    for view in both:
        snapshot = snapshots[str(view.base)]
        us_rate, ida = snapshot_values(snapshot)
        record_reference(ledger, view, snapshot)
        creditor_sums: dict[str, Series] = {}
        if view.use_dfo:
            panel, creditor_sums = fetch_dfo(view, reads=reads, ledger=ledger)
        else:
            panel = load_ids(view, paths=paths, client=client, ledger=ledger)
        weo = load_weo(view, ledger=ledger)
        panel = estimate_imf_charges(panel, view)
        terms, fallback = lending_terms(panel)
        bases[view.base], inputs[str(view.base)] = build_view(
            view,
            panel,
            weo=weo,
            us_rate=us_rate,
            ida=ida,
            terms=terms,
            capacity=capacity,
        )
        checks[view.base] = {
            "guard": guard_groups(panel, view, creditor_sums),
            "terms_fallback": fallback,
        }

    coverage = {v.base: coverage_rows(bases[v.base], v) for v in both}
    missing = {
        base: [row["iso3"] for row in rows if row["missing"]] for base, rows in coverage.items()
    }
    default_year = 2025 if len(missing[2025]) <= MAX_MISSING else 2024
    write_text(
        out / "coverage.md",
        render_coverage(
            coverage,
            missing,
            checks=checks,
            default_year=default_year,
            notes=ledger.notes,
            views=both,
            today=today,
        ),
    )

    provenance = envelope_provenance(
        ledger, sdk_version=dfo.__version__, retrieved=retrieved, citation=citation(both)
    )
    data = {
        "baseYears": [v.base for v in both],
        "defaultYear": default_year,
        "measure": "pv",
        "vintages": {
            str(v.base): {
                "ids": v.ids,
                "weo": f"{v.weo[0]} {v.weo[1]}",
                "capacityAsOf": v.capacity_as_of,
                "archived": v.archived,
            }
            for v in both
        },
        "countries": [
            {
                "iso3": country.iso3,
                "name": country.name,
                "fdl2024": country.fdl2024,
                "bases": {str(v.base): bases[v.base][country.iso3] for v in both},
            }
            for country in COUNTRIES
        ],
    }
    write_envelope(out / "thresholds.json", provenance, data)
    write_envelope(out / "inputs.json", provenance, inputs)
    log.info("wrote coverage.md, inputs.json, thresholds.json; default %d.", default_year)

    lacking = missing[default_year]
    if len(lacking) > MAX_MISSING:
        print(
            f"fetch.py: {len(lacking)} countries lack a core series in {default_year}: "
            f"{', '.join(lacking)}.",
            file=sys.stderr,
        )
        return 1
    return 0


def build_transfer_file(out: Path, *, reads: Reads, release: str, retrieved: str) -> None:
    """Write transfers.json and transfers-fixture.json from groups.csv and one pinned ref."""
    with (Paths.default().out / "groups.csv").open(newline="") as lines:
        members = parse_groups(lines)
    rows = read_net_transfers([member["iso3"] for member in members], reads=reads)
    years, countries = transfers_by_country(rows, members)
    record = reads.provenance(TRANSFERS_KEY)
    provenance = transfers_provenance(
        sdk_version=dfo.__version__,
        retrieved=retrieved,
        release=release,
        sentence=record["sentence"],
        citation=record["citation"]["text"],
        version=record["members"][0]["content_version"],
    )
    write_envelope(out / "transfers.json", provenance, build_transfers(members, release=release))
    write_envelope(
        out / "transfers-fixture.json",
        base_provenance(
            sdk_version=dfo.__version__,
            query=QUERIES["transfers-fixture.json"],
            retrieved=retrieved,
        ),
        parity_fixture(rows, members),
    )
    missing = countries_without_values(countries)
    print(f"Wrote {out / 'transfers.json'}: {len(countries)} countries, {years[0]}-{years[-1]}.")
    print(f"No IDS values: {', '.join(missing) or 'none'}.")
