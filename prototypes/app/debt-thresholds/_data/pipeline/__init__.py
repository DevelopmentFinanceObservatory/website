"""Data step for the debt-thresholds prototype, run with `pnpm data debt-thresholds`.

It builds two base years for the 58 low and lower-middle-income countries in the
Finance for Development Lab's March 2026 note (Annex 1):

- 2024 on the releases FDL used: World Bank International Debt Statistics (IDS),
  December 2025 release (actuals to 2024), and IMF WEO October 2025. The DFO holds
  only the current IDS release, so this base year reads the World Bank's IDS bulk
  files as the Internet Archive saved them on 3 and 4 January 2026.
- 2025 on current data: the IDS release the DFO holds, read entirely through the DFO
  API (the pinned readings in `pipeline.sources.dfo_api`), and IMF WEO October 2026.

The files it writes, and the shape of each, are described in `pipeline.run`; the
creditor groups in `pipeline.creditors`; the coverage report in `pipeline.coverage`.

Only `pipeline.sources` and `pipeline.run` import third-party packages or touch the
network; every other module imports the standard library and `pipeline`. Library
code raises `pipeline.errors.DataError`, and `pipeline.run.main` is the one exit.
"""
