# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#     "development-finance[pandas]==0.6.0",
# ]
# ///
"""Entry point of the page's build of the 2025 view; the work lives in `pipeline.stored`.

The page's `_lib/build.ts` runs it with `uv run --script` while `pnpm read` runs.
"""

from pipeline.stored import main

raise SystemExit(main())
