"""The present value of external public debt, estimated from IDS concessionality."""

from collections.abc import Mapping

from pipeline.config import FIRST_FLOW_YEAR
from pipeline.panel import Series, amount_of, span


def present_value(keys: Mapping[str, Series], base: int) -> float | None:
    """Return the base year's PPG debt stock with its concessional part discounted.

    The IMF-World Bank thresholds are set on the present value of debt, which IDS does
    not publish. The estimate takes the concessional share of the stock
    (`DT.DOD.ALLC.CD` over `DT.DOD.DPPG.CD`, capped at one) and the grant element of
    new commitments from 2015 to the base year (`DT.GRE.DPPG`, in %), averaged with
    each year weighted by its commitments (`DT.COM.OFFT.CD` plus `DT.COM.PRVT.CD`),
    and returns face value * (1 - share * grant element). A year without commitments
    weighs nothing, whether a source reports its grant element as 0 or leaves it out.
    Commercial debt stays at face value.

    Returns None when the stock or the concessional stock is missing, or no year has
    both a grant element and commitments.
    """
    face = keys.get("ppg_stock", {}).get(base)
    concessional = keys.get("ppg_concessional_stock", {}).get(base)
    if face is None or concessional is None:
        return None
    weighted = total = 0.0
    for year, element in keys.get("ppg_grant_element", {}).items():
        if year not in span(FIRST_FLOW_YEAR, base):
            continue
        weight = amount_of(keys, "com_offt", year) + amount_of(keys, "com_prvt", year)
        weighted += element * weight
        total += weight
    if total <= 0:
        return None
    if face <= 0:
        return face
    share = min(1.0, concessional / face)
    return face * (1 - share * weighted / total / 100)
