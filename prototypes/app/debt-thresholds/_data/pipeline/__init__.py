"""Data step and build of the debt-thresholds prototype.

It builds two base years for the 58 low and lower-middle-income countries in the
Finance for Development Lab's March 2026 note (Annex 1):

- 2024 on the releases FDL used: World Bank International Debt Statistics (IDS),
  December 2025 release (actuals to 2024), and IMF WEO October 2025. The DFO holds
  only the current IDS release, so this base year reads the World Bank's IDS bulk
  files as the Internet Archive saved them on 3 and 4 January 2026. It comes from
  outside DFO, so the data step (`pnpm data debt-thresholds`, `pipeline.run`)
  commits it.
- 2025 on current data: the IDS release the DFO holds, read entirely through the DFO
  API (the refs in refs.json, `pipeline.sources.dfo_api`), and IMF WEO October 2026,
  whose series the data step commits. The page's build makes it from DFO's newest
  stored data (`pipeline.stored`, run by `build.py`), so the repository holds none
  of its figures.

The files the step writes, and the shape of each, are described in `pipeline.run`;
the creditor groups in `pipeline.creditors`; the coverage report in `pipeline.coverage`.

Only `pipeline.sources`, `pipeline.run` and `pipeline.stored` import third-party
packages or touch the network; every other module imports the standard library and
`pipeline`. Library code raises `pipeline.errors.DataError`, and `pipeline.run.main`
and `pipeline.stored.main` are the exits.
"""
