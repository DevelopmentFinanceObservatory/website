# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#     "development-finance[pandas]==0.6.0",
# ]
# [tool.uv]
# # Resolve every package, pandas, numpy and pyarrow included, as PyPI held them
# # on this day, the day after SDK 0.6.0, so a later release of any of them cannot
# # change how the frames read. Move the day forward when the SDK pin moves.
# exclude-newer = "2026-11-23T00:00:00Z"
# ///
"""Entry point of the page's build of the 2025 view; the work lives in `pipeline.stored`.

The page's `_lib/build.ts` runs it with `uv run --script` while `pnpm read` runs.
"""

from pipeline.stored import main

raise SystemExit(main())
