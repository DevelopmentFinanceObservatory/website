"""The command line entry point of the data step: reads the sources and writes the files git keeps.

`main` is the only place that reads the clock, opens the HTTP clients, sets up
logging or exits. Every DFO read is a pinned ref (`pipeline.sources.pinned`):
a plain run fetches the refs refs.json holds; `--refresh` fetches their newest
versions; `--search` builds each read from its series code. Those two pin the
new reads and write the refs files only after every check passes. `--no-pin`
makes a trial run: it pins nothing and writes into a new temporary folder, or an
`--out` outside `_data`, so the committed refs never name unpinned versions.

The step builds both base years, so a refresh pins only reads that pass every
check, but commits only what comes from outside DFO: the 2024 view, whose IDS
release the DFO no longer holds, and the inputs the page's build needs beside
its DFO reads. The build makes the 2025 view from DFO's newest stored data
(`pipeline.stored`). The step writes, into the output folder:

- `coverage.md`: the countries by series for the 2024 view, the creditor-group
  guard and the lending-terms fallback. The run returns 1 when more than
  `MAX_MISSING` countries lack a core series in it.
- `thresholds-2024.json`: an envelope whose `data` is the 2024 view as
  `pipeline.build.view_data` shapes it; the page merges it with the built 2025
  view into `ThresholdsData` (`types.ts`).
- `inputs-2024.json`: an envelope whose `data` maps ISO3 code to the `inputs`
  dict `pipeline.project.project_service` takes for 2024, shaped as that
  module's docstring describes. Two keys are extra: `contracted_disbursements`,
  the IDS projected disbursements on commitments already made, by creditor
  group, from the base year + 1 to the end year; and `projection_error`, the
  message `project_service` raised for the country, or null.
- `weo-2025.json`: the IMF WEO series of the 2025 view, by ISO3 code, series key
  and year, which the build reads beside the DFO.
- `refs.json`: each DFO read's ref and provenance, and the reading the last
  search made of it (Search's answer to its series code, or the pinned spec), by
  read key; the build reads every ref at DFO's newest stored version.
- `reference.json`: the US rate and IDA status each view is built on. A refresh
  keeps the archived view's values, so the 2024 view does not move.
- the page's transfers parity fixture (`TRANSFERS_FIXTURE`): real net-transfers
  rows and `pipeline.transfers`' output for them, for the page's parity test.
  A trial run writes it into its output folder.

Each JSON file in `_data` but refs.json names its sources in `provenance.outside`,
which `pnpm check:data` requires of a build-read page.

IDS projects service on all commitments already made, including the parts not
yet disbursed, and projects the disbursements of those parts. The schedule in
`contracted` therefore covers loans whose disbursements also fund part of each
year's need; `contracted_disbursements` carries them for the projection to net.
"""

import argparse
import json
import logging
import sys
import tempfile
from collections.abc import Mapping, Sequence
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import dfo
import httpx

from pipeline.build import assemble_view, view_data
from pipeline.config import MAX_MISSING, Paths, View, views
from pipeline.coverage import listed, render_coverage
from pipeline.errors import DataError
from pipeline.output import write_envelope, write_text
from pipeline.provenance import Ledger, base_provenance, outside_provenance, utc_stamp
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
from pipeline.sources.transfers import read_net_transfers
from pipeline.sources.weo import WEO_SERIES, load_weo
from pipeline.transfers import (
    countries_without_values,
    parity_fixture,
    parse_groups,
    transfers_by_country,
)

log = logging.getLogger("pipeline")

# The page's transfers parity test reads this fixture, outside `_data`, so
# `pnpm check:data` does not take its DFO rows for page data.
TRANSFERS_FIXTURE = Paths.default().out.parent / "_lib" / "fixtures" / "transfers-parity.json"

QUERIES = {
    "refs.json": "debt-thresholds reads, each with the reading the last search made of it",
    "reference.json": (
        "debt-thresholds reference reads: FRED GS10 and World Bank lending categories by base year"
    ),
    "thresholds": (
        "External public debt (PPG, and IMF credit for service): stock, service, principal "
        "and disbursements by creditor group, GDP and revenue, for the 58 countries in "
        "FDL's March 2026 note, base year {base}, on the releases FDL used"
    ),
    "inputs": "The projection inputs of each of the 58 countries, base year {base}",
    "weo": "IMF WEO series of the 58 countries for base year {base}: {series}",
    "fixture": (
        "Net-transfers rows of seven countries, one without rows, from the transfers ref, with "
        "pipeline.transfers' output for them"
    ),
}


def main(argv: Sequence[str] | None = None) -> int:
    """Run the data step and return the process exit code."""
    parser = argparse.ArgumentParser(description="Build the debt-thresholds data files.")
    parser.add_argument(
        "--out", type=Path, help="output folder (default _data, or a temporary one with --no-pin)"
    )
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
        "--no-pin",
        action="store_true",
        help="leave new versions unpinned, for a trial run written outside _data",
    )
    args = parser.parse_args(argv)
    mode = Mode.SEARCH if args.search else Mode.REFRESH if args.refresh else Mode.PLAIN
    if args.only and mode is not Mode.PLAIN:
        # refs.json carries one `retrieved` stamp for every output, so a refresh
        # rebuilds them all.
        parser.error("--only builds from the committed refs; refresh or search without it")
    committed_dir = Paths.default().out
    out = trial_out(args.out, no_pin=args.no_pin, committed=committed_dir)
    if out is None:
        parser.error(
            "--no-pin writes refs that name unpinned versions; give an --out outside _data"
        )
    fixture = TRANSFERS_FIXTURE if out == committed_dir else out / TRANSFERS_FIXTURE.name

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("fetch.py: %(message)s"))
    log.handlers[:] = [handler]
    log.setLevel(logging.INFO)
    log.propagate = False

    out.mkdir(parents=True, exist_ok=True)
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
            release = ids_release(dfo_client)
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
                    out,
                    reads=reads,
                    client=client,
                    snapshots=snapshots,
                    ids=release,
                    retrieved=retrieved,
                )
            if args.only != "thresholds":
                build_transfer_fixture(fixture, reads=reads, retrieved=retrieved)
            if mode is not Mode.PLAIN:
                if code != 0:
                    print("fetch.py: the checks failed, so nothing was pinned.", file=sys.stderr)
                    return code
                # Pin only now that check_actuals and the coverage check hold.
                reads.keep()
    except DataError as error:
        print(f"fetch.py: {error}", file=sys.stderr)
        return 1

    if mode is not Mode.PLAIN:
        write_refs(
            out,
            reads,
            committed=refs or {},
            snapshots=snapshots,
            both=views(today, current_ids=release),
            retrieved=retrieved,
        )
        log.info("pinned %d new member(s).", reads.pins)
    if out != committed_dir:
        log.info("wrote the outputs into %s.", out)
    return code


def trial_out(out: Path | None, *, no_pin: bool, committed: Path) -> Path | None:
    """Return the output folder, or None for a `--no-pin` run told to write into `committed`.

    A `--no-pin` run without `--out` writes into a new temporary folder.
    """
    if not no_pin:
        return out or committed
    if out is None:
        return Path(tempfile.mkdtemp(prefix="debt-thresholds-trial-"))
    return None if out.resolve().is_relative_to(committed.resolve()) else out


def read_data(path: Path) -> Any:
    """Return the `data` of a committed envelope, or None when the file is not there."""
    return json.loads(path.read_text())["data"] if path.exists() else None


def read_retrieved(path: Path) -> str:
    """Return the `provenance.retrieved` stamp of a committed envelope."""
    return json.loads(path.read_text())["provenance"]["retrieved"]


def write_refs(
    out: Path,
    reads: Reads,
    *,
    committed: Mapping[str, Any],
    snapshots: Mapping[str, Snapshot],
    both: Sequence[View],
    retrieved: str,
) -> None:
    """Write refs.json, each read with its reading, and reference.json."""
    sdk = dfo.__version__
    write_envelope(
        out / "refs.json",
        base_provenance(sdk_version=sdk, query=QUERIES["refs.json"], retrieved=retrieved),
        {**committed, **reads.records},
    )
    ledger = Ledger()
    for view in both:
        record_reference(ledger, view, snapshots[str(view.base)])
    write_envelope(
        out / "reference.json",
        outside_provenance(
            ledger.preloads, sdk_version=sdk, query=QUERIES["reference.json"], retrieved=retrieved
        ),
        {"views": dict(snapshots)},
    )


def build_thresholds(
    out: Path,
    *,
    reads: Reads,
    client: httpx.Client,
    snapshots: Mapping[str, Snapshot],
    ids: str,
    retrieved: str,
) -> int:
    """Build both views and write the 2024 view's files and the 2025 view's WEO series.

    Return the exit code: 1 when more than `MAX_MISSING` countries lack a core
    series in the 2024 view, which the page falls back to.
    """
    today = date.fromisoformat(retrieved[:10])
    defaults = Paths.default()
    paths = Paths(out=out, cache=defaults.cache)
    archived, current = views(today, current_ids=ids)
    notes = Ledger()
    capacity = load_capacity(defaults.out / "capacity.csv", ledger=notes)

    def assemble(view: View, ledger: Ledger, weo_ledger: Ledger, *, use_dfo: bool):
        snapshot = snapshots[str(view.base)]
        us_rate, ida = snapshot_values(snapshot)
        record_reference(ledger, view, snapshot)
        if use_dfo:
            panel, creditor_sums = fetch_dfo(view, reads=reads, ledger=ledger)
        else:
            panel, creditor_sums = load_ids(view, paths=paths, client=client, ledger=ledger), {}
        weo = load_weo(view, ledger=weo_ledger)
        built = assemble_view(
            view,
            panel,
            creditor_sums=creditor_sums,
            weo=weo,
            us_rate=us_rate,
            ida=ida,
            capacity=capacity,
        )
        return built, weo

    old_ledger = Ledger()
    old, _ = assemble(archived, old_ledger, old_ledger, use_dfo=False)
    old_ledger.preload(
        {
            "name": "IMF-World Bank debt sustainability analyses, as capacity.csv records them",
            "baseYear": archived.base,
            "source": "capacity.csv",
        }
    )
    # The current view is built for its checks, so a refresh pins only reads that
    # pass them; the page's build makes it again from DFO's newest stored data.
    weo_ledger = Ledger()
    new, weo = assemble(current, Ledger(), weo_ledger, use_dfo=True)

    write_text(
        out / "coverage.md",
        render_coverage(
            {archived.base: old.coverage},
            {archived.base: old.missing},
            checks={archived.base: old.check},
            notes=notes.notes,
            views=(archived,),
            today=today,
        ),
    )
    sdk = dfo.__version__

    def provenance(ledger: Ledger, query: str) -> dict:
        return outside_provenance(
            ledger.preloads, sdk_version=sdk, query=query, retrieved=retrieved
        )

    base = archived.base
    write_envelope(
        out / f"thresholds-{base}.json",
        provenance(old_ledger, QUERIES["thresholds"].format(base=base)),
        view_data(archived, old.bases),
    )
    write_envelope(
        out / f"inputs-{base}.json",
        provenance(old_ledger, QUERIES["inputs"].format(base=base)),
        old.inputs,
    )
    write_envelope(
        out / f"weo-{current.base}.json",
        provenance(
            weo_ledger,
            QUERIES["weo"].format(base=current.base, series=", ".join(WEO_SERIES.values())),
        ),
        {
            iso3: {key: series_json(keys.get(key, {})) for key in WEO_SERIES}
            for iso3, keys in weo.items()
        },
    )
    log.info(
        "wrote coverage.md, thresholds-%d.json, inputs-%d.json, weo-%d.json.",
        base,
        base,
        current.base,
    )
    log.info(
        "the %d view, which the build makes again: %s",
        current.base,
        listed("countries lacking a core series", new.missing).removeprefix("- "),
    )

    if len(old.missing) > MAX_MISSING:
        print(
            f"fetch.py: {len(old.missing)} countries lack a core series in {base}: "
            f"{', '.join(old.missing)}.",
            file=sys.stderr,
        )
        return 1
    return 0


def series_json(values: Mapping[int, float]) -> dict[str, float]:
    """Return a series by year with the years as JSON keys, oldest first."""
    return {str(year): values[year] for year in sorted(values)}


def build_transfer_fixture(path: Path, *, reads: Reads, retrieved: str) -> None:
    """Refresh the transfers ref and write the page's parity fixture from groups.csv and it."""
    with (Paths.default().out / "groups.csv").open(newline="") as lines:
        members = parse_groups(lines)
    rows = read_net_transfers([member["iso3"] for member in members], reads=reads)
    years, countries = transfers_by_country(rows, members)
    path.parent.mkdir(parents=True, exist_ok=True)
    write_envelope(
        path,
        base_provenance(sdk_version=dfo.__version__, query=QUERIES["fixture"], retrieved=retrieved),
        parity_fixture(rows, members),
    )
    missing = countries_without_values(countries)
    log.info("net transfers: %d countries, %d-%d.", len(countries), years[0], years[-1])
    log.info("no IDS values: %s.", ", ".join(missing) or "none")
