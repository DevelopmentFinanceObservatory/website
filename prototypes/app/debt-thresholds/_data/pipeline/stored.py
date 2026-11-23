"""The page's build of the 2025 view, from DFO's newest stored data.

The prototypes build (`pnpm read`) runs `build.py` as a child process of the
page's `_lib/build.ts`. `main` reads every DFO read refs.json holds at the
version DFO stores as the newest of its spec (`Mode.STORED`), one request at a
time, so the child holds one of the build's read slots. It reads nothing else
over the network: the WEO series, the US rate, IDA status and capacities come
from the files the data step committed (weo-2025.json, reference.json,
capacity.csv), and it makes no FRED, World Bank or IMF request.

It prints one JSON object on stdout:

- `view`: the 2025 view, as `pipeline.build.view_data` shapes it.
- `defaultYear`: 2025, or 2024 when more than `MAX_MISSING` countries lack a
  core series in 2025, so the page opens on the committed 2024 view.
- `sources`: by read key, the dataset versions read (`specId`, `contentVersion`)
  and DFO's freshness, the worst of the key's reads.

Its log goes to stderr. A failed read or a refused check (`DataError`), such as
a release whose actuals no longer end in 2025, exits 1 with the reason.
"""

import argparse
import json
import logging
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import dfo

from pipeline.build import assemble_view, view_data
from pipeline.config import MAX_MISSING, Paths, views
from pipeline.coverage import listed
from pipeline.errors import DataError
from pipeline.provenance import Ledger
from pipeline.sources.dfo_api import fetch_dfo, ids_release
from pipeline.sources.pinned import Mode, Reads
from pipeline.sources.reference import load_capacity, snapshot_values
from pipeline.sources.weo import read_weo_file

log = logging.getLogger("pipeline")

# How long each DFO call may take, retries and a cold build included, as the
# build's own reads may (BUILD_TIMEOUT_MS in lib/buildRead.ts).
CALL_TIMEOUT_S = 300.0


def main(argv: Sequence[str] | None = None) -> int:
    """Build the 2025 view from DFO's newest stored data and print it; return the exit code."""
    parser = argparse.ArgumentParser(
        description="Build the debt-thresholds 2025 view from DFO's newest stored data."
    )
    parser.parse_args(argv)

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("build.py: %(message)s"))
    log.handlers[:] = [handler]
    log.setLevel(logging.INFO)
    log.propagate = False

    data = Paths.default().out
    try:
        committed = read_data(data / "refs.json")
        reference = read_data(data / "reference.json")
        with dfo.Client(api_key=False, timeout=CALL_TIMEOUT_S, max_retries=3) as client:
            reads = Reads(client, mode=Mode.STORED, committed=committed)
            archived, current = views(datetime.now(UTC).date(), current_ids=ids_release(client))
            snapshot = reference["views"].get(str(current.base))
            if snapshot is None:
                raise DataError(f"reference.json has no {current.base} view; run the data step.")
            us_rate, ida = snapshot_values(snapshot)
            ledger = Ledger()
            panel, creditor_sums = fetch_dfo(current, reads=reads, ledger=ledger)
        built = assemble_view(
            current,
            panel,
            creditor_sums=creditor_sums,
            weo=read_weo_file(data / f"weo-{current.base}.json"),
            us_rate=us_rate,
            ida=ida,
            capacity=load_capacity(data / "capacity.csv", ledger=ledger),
        )
    except (DataError, dfo.errors.DfoError) as error:
        print(f"build.py: {error}", file=sys.stderr)
        return 1

    lacking = listed("countries lacking a core series", built.missing).removeprefix("- ")
    if len(built.missing) > MAX_MISSING:
        log.warning("%d: %s, so the page opens on %d.", current.base, lacking, archived.base)
    else:
        log.info("%d: %s.", current.base, lacking)
    guard = built.check["guard"]
    log.info(
        "creditor-group guard, 1%%: %d of %d country-years pass.",
        guard["checked"] - guard["failed"],
        guard["checked"],
    )
    for note in ledger.notes:
        log.info("%s", note)

    print(
        json.dumps(
            {
                "view": view_data(current, built.bases),
                "defaultYear": current.base if len(built.missing) <= MAX_MISSING else archived.base,
                "sources": reads.sources,
            },
            ensure_ascii=False,
        )
    )
    return 0


def read_data(path: Path) -> Any:
    """Return the `data` of a committed envelope.

    Raises `DataError` when the file is not there.
    """
    if not path.exists():
        raise DataError(f"{path.name} is missing; run the data step.")
    return json.loads(path.read_text())["data"]
