"""The command line entry point: reads the sources and writes the output files.

`main` is the only place that reads the clock, opens the HTTP client, sets up
logging or exits. It writes, into the output folder:

- `coverage.md`: the countries by series for both base years, the creditor-group
  guard and the DFO-against-bulk check. The run returns 1 when more than
  `MAX_MISSING` countries lack a core series in the default year.
- `inputs.json`: an envelope whose `data` maps base year, then ISO3 code, to the
  `inputs` dict `pipeline.project.project_service` takes, shaped as that module's
  docstring describes. Two keys are extra: `contracted_disbursements`, the IDS
  projected disbursements on commitments already made, by creditor group, from
  the base year + 1 to the end year; and `projection_error`, the message
  `project_service` raised for the country, or null.
- `thresholds.json`: an envelope whose `data` is `ThresholdsData` (`types.ts`).
- `transfers.json`: net transfers on external debt by FDL group.

IDS projects service on all commitments already made, including the parts not
yet disbursed, and projects the disbursements of those parts. The schedule in
`contracted` therefore covers loans whose disbursements also fund part of each
year's need; `contracted_disbursements` carries them for the projection to net.
"""

import argparse
import logging
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

import dfo
import httpx

from pipeline.build import build_view
from pipeline.config import MAX_MISSING, Paths, views
from pipeline.countries import COUNTRIES
from pipeline.coverage import coverage_rows, render_coverage
from pipeline.creditors import estimate_imf_charges, guard_groups
from pipeline.errors import DataError
from pipeline.output import write_envelope, write_text
from pipeline.panel import Series, cross_check, merge_panels
from pipeline.provenance import Ledger, citation, envelope_provenance
from pipeline.sources.dfo_api import fetch_dfo, ids_release
from pipeline.sources.ids_bulk import load_ids
from pipeline.sources.reference import load_capacity, load_ida, load_us_rate
from pipeline.sources.transfers import read_net_transfers
from pipeline.sources.weo import load_weo
from pipeline.terms import lending_terms
from pipeline.transfers import (
    build_transfers,
    countries_without_values,
    parse_groups,
    transfers_provenance,
)

log = logging.getLogger("pipeline")


def main(argv: Sequence[str] | None = None) -> int:
    """Run the data step and return the process exit code."""
    parser = argparse.ArgumentParser(description="Build the debt-thresholds data files.")
    parser.add_argument("--out", type=Path, default=Paths.default().out, help="output folder")
    parser.add_argument("--only", choices=("thresholds", "transfers"), help="build one part")
    args = parser.parse_args(argv)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("fetch.py: %(message)s"))
    log.handlers[:] = [handler]
    log.setLevel(logging.INFO)
    log.propagate = False

    now = datetime.now(UTC)
    args.out.mkdir(parents=True, exist_ok=True)
    try:
        release = ids_release()
        with httpx.Client() as client:
            code = 0
            if args.only != "transfers":
                code = build_thresholds(args.out, client=client, now=now, ids=release)
            if args.only != "thresholds":
                build_transfer_file(args.out, now=now, release=release)
    except DataError as error:
        print(f"fetch.py: {error}", file=sys.stderr)
        return 1
    return code


def build_thresholds(out: Path, *, client: httpx.Client, now: datetime, ids: str) -> int:
    """Write coverage.md, inputs.json and thresholds.json; return the exit code."""
    today = now.date()
    defaults = Paths.default()
    paths = Paths(out=out, cache=defaults.cache)
    both = views(today, current_ids=ids)
    ledger = Ledger()

    us_rate = load_us_rate(client=client, ledger=ledger, today=today)
    ida = load_ida(client=client, ledger=ledger, today=today)
    capacity = load_capacity(defaults.out / "capacity.csv", ledger=ledger)

    bases: dict[int, dict[str, dict]] = {}
    inputs: dict[str, dict[str, dict]] = {}
    checks: dict[int, dict] = {}
    for view in both:
        panel = load_ids(view, paths=paths, client=client, ledger=ledger)
        creditor_sums: dict[str, Series] = {}
        cross = None
        if view.use_dfo:
            from_dfo, creditor_sums = fetch_dfo(view, ledger=ledger)
            cross = cross_check(from_dfo, panel, view)
            panel = merge_panels(from_dfo, panel)
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
            "cross": cross,
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
        ledger, sdk_version=dfo.__version__, retrieved=now, citation=citation(both)
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


def build_transfer_file(out: Path, *, now: datetime, release: str) -> None:
    """Write transfers.json from groups.csv and one DFO read."""
    with (Paths.default().out / "groups.csv").open(newline="") as lines:
        members = parse_groups(lines)
    read = read_net_transfers([row["iso3"] for row in members])
    data = build_transfers(read.rows, members, release=release)
    provenance = transfers_provenance(
        sdk_version=dfo.__version__,
        retrieved=now,
        release=release,
        sentence=read.sentence,
        citation=read.citation,
        version=read.version,
    )
    target = out / "transfers.json"
    write_envelope(target, provenance, data)
    years = data["years"]
    missing = countries_without_values(data["countries"])
    print(f"Wrote {target}: {len(data['countries'])} countries, {years[0]}-{years[-1]}.")
    print(f"No IDS values: {', '.join(missing) or 'none'}.")
