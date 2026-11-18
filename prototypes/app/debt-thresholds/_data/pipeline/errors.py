"""The one exception the pipeline raises for a failure it can explain."""


class DataError(Exception):
    """A run cannot continue because of the data or its sources.

    The message is the text the run prints to stderr, without the `fetch.py: `
    prefix that `pipeline.run.main` adds.
    """
