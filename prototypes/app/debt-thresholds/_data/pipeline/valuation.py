"""The present value of external public debt, estimated from IDS concessionality."""

from collections.abc import Mapping

from pipeline.config import FIRST_FLOW_YEAR
from pipeline.panel import Series, span


def present_value(keys: Mapping[str, Series], base: int) -> float | None:
    """Return the base year's PPG debt stock with its concessional part discounted.

    The IMF-World Bank thresholds are set on the present value of debt, which IDS does
    not publish. The estimate takes the concessional share of the stock
    (`DT.DOD.ALLC.CD` over `DT.DOD.DPPG.CD`, capped at one) and the mean grant element
    of new commitments from 2015 to the base year (`DT.GRE.DPPG`, in %), and returns
    face value * (1 - share * grant element). Commercial debt stays at face value.

    Returns None when the stock, the concessional stock or every grant element is missing.
    """
    face = keys.get("ppg_stock", {}).get(base)
    concessional = keys.get("ppg_concessional_stock", {}).get(base)
    elements = [
        value
        for year, value in keys.get("ppg_grant_element", {}).items()
        if year in span(FIRST_FLOW_YEAR, base)
    ]
    if face is None or concessional is None or not elements:
        return None
    if face <= 0:
        return face
    share = min(1.0, concessional / face)
    grant_element = sum(elements) / len(elements) / 100
    return face * (1 - share * grant_element)
