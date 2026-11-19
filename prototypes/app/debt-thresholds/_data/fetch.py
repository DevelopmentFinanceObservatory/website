# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#     "development-finance[pandas]==0.4.1",
#     "bblocks-data-importers==0.5.0",
#     "python-calamine==0.9.1",
#     "httpx==0.28.1",
# ]
# [tool.uv]
# # bblocks-data-importers 0.5.0 pins imf-reader below 2, whose WEO reader labels the
# # October 2026 release "October 2025"; imf-reader 2.3.0 reads both releases by
# # name. It also pins pyarrow below 21, which the DFO SDK needs.
# override-dependencies = ["imf-reader==2.3.0", "pyarrow==21.0.0"]
# ///
"""Entry point of the debt-thresholds data step; the work lives in `pipeline`."""

from pipeline.run import main

raise SystemExit(main())
