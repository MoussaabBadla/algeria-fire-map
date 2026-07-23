"""Canadian Fire Weather Index (FWI) System — Van Wagner & Pickett (1985/1987).

Given a short sequence of daily noon-ish weather, we spin up the moisture codes
(FFMC/DMC/DC) and return the final day's FWI + sub-indices. This is the same
index EFFIS uses, so it's scientifically defensible without training data.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

# Day-length factors by month (northern hemisphere).
_DMC_LE = [6.5, 7.5, 9.0, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8.0, 7.0, 6.0]
_DC_LF = [-1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5.0, 2.4, 0.4, -1.6, -1.6]


@dataclass
class DayWeather:
    temp: float  # °C
    rh: float  # %
    wind: float  # km/h
    rain: float  # mm (24 h)
    month: int  # 1-12


def _ffmc(ffmc0: float, w: DayWeather) -> float:
    mo = 147.2 * (101.0 - ffmc0) / (59.5 + ffmc0)
    if w.rain > 0.5:
        rf = w.rain - 0.5
        if mo <= 150.0:
            mr = mo + 42.5 * rf * math.exp(-100.0 / (251.0 - mo)) * (1.0 - math.exp(-6.93 / rf))
        else:
            mr = (
                mo
                + 42.5 * rf * math.exp(-100.0 / (251.0 - mo)) * (1.0 - math.exp(-6.93 / rf))
                + 0.0015 * (mo - 150.0) ** 2 * math.sqrt(rf)
            )
        mo = min(mr, 250.0)
    ed = 0.942 * w.rh ** 0.679 + 11.0 * math.exp((w.rh - 100.0) / 10.0) + 0.18 * (21.1 - w.temp) * (1.0 - math.exp(-0.115 * w.rh))
    if mo > ed:
        ko = 0.424 * (1.0 - (w.rh / 100.0) ** 1.7) + 0.0694 * math.sqrt(w.wind) * (1.0 - (w.rh / 100.0) ** 8)
        kd = ko * 0.581 * math.exp(0.0365 * w.temp)
        m = ed + (mo - ed) * 10.0 ** (-kd)
    else:
        ew = 0.618 * w.rh ** 0.753 + 10.0 * math.exp((w.rh - 100.0) / 10.0) + 0.18 * (21.1 - w.temp) * (1.0 - math.exp(-0.115 * w.rh))
        if mo < ew:
            kl = 0.424 * (1.0 - ((100.0 - w.rh) / 100.0) ** 1.7) + 0.0694 * math.sqrt(w.wind) * (1.0 - ((100.0 - w.rh) / 100.0) ** 8)
            kw = kl * 0.581 * math.exp(0.0365 * w.temp)
            m = ew - (ew - mo) * 10.0 ** (-kw)
        else:
            m = mo
    ffmc = 59.5 * (250.0 - m) / (147.2 + m)
    return max(0.0, min(ffmc, 101.0))


def _dmc(dmc0: float, w: DayWeather) -> float:
    t = max(w.temp, -1.1)
    le = _DMC_LE[w.month - 1]
    rk = 1.894 * (t + 1.1) * (100.0 - w.rh) * le * 1e-6
    if w.rain > 1.5:
        re = 0.92 * w.rain - 1.27
        mo = 20.0 + math.exp(5.6348 - dmc0 / 43.43)
        if dmc0 <= 33.0:
            b = 100.0 / (0.5 + 0.3 * dmc0)
        elif dmc0 <= 65.0:
            b = 14.0 - 1.3 * math.log(dmc0)
        else:
            b = 6.2 * math.log(dmc0) - 17.2
        mr = mo + 1000.0 * re / (48.77 + b * re)
        pr = 244.72 - 43.43 * math.log(max(mr - 20.0, 1e-6))
        dmc0 = max(pr, 0.0)
    return dmc0 + rk


def _dc(dc0: float, w: DayWeather) -> float:
    t = max(w.temp, -2.8)
    lf = _DC_LF[w.month - 1]
    pe = max((0.36 * (t + 2.8) + lf) / 2.0, 0.0)
    if w.rain > 2.8:
        rd = 0.83 * w.rain - 1.27
        smi = 800.0 * math.exp(-dc0 / 400.0)
        dr = dc0 - 400.0 * math.log(1.0 + 3.937 * rd / smi)
        dc0 = max(dr, 0.0)
    return dc0 + pe


def _isi(ffmc: float, wind: float) -> float:
    m = 147.2 * (101.0 - ffmc) / (59.5 + ffmc)
    fw = math.exp(0.05039 * wind)
    ff = 91.9 * math.exp(-0.1386 * m) * (1.0 + m ** 5.31 / 4.93e7)
    return 0.208 * fw * ff


def _bui(dmc: float, dc: float) -> float:
    if dmc <= 0.4 * dc:
        bui = 0.8 * dmc * dc / (dmc + 0.4 * dc) if (dmc + 0.4 * dc) > 0 else 0.0
    else:
        bui = dmc - (1.0 - 0.8 * dc / (dmc + 0.4 * dc)) * (0.92 + (0.0114 * dmc) ** 1.7)
    return max(bui, 0.0)


def _fwi(isi: float, bui: float) -> float:
    if bui <= 80.0:
        bb = 0.1 * isi * (0.626 * bui ** 0.809 + 2.0)
    else:
        bb = 0.1 * isi * (1000.0 / (25.0 + 108.64 * math.exp(-0.023 * bui)))
    if bb <= 1.0:
        return bb
    return math.exp(2.72 * (0.434 * math.log(bb)) ** 0.647)


# EFFIS danger classes.
def danger_class(fwi: float) -> str:
    if fwi < 5.2:
        return "very-low"
    if fwi < 11.2:
        return "low"
    if fwi < 21.3:
        return "moderate"
    if fwi < 38.0:
        return "high"
    if fwi < 50.0:
        return "very-high"
    return "extreme"


def compute_fwi(series: list[DayWeather]) -> dict:
    """Spin up moisture codes over the series; return the final day's indices."""
    ffmc, dmc, dc = 85.0, 6.0, 15.0
    for w in series:
        ffmc = _ffmc(ffmc, w)
        dmc = _dmc(dmc, w)
        dc = _dc(dc, w)
    isi = _isi(ffmc, series[-1].wind)
    bui = _bui(dmc, dc)
    fwi = _fwi(isi, bui)
    return {"fwi": round(fwi, 1), "isi": round(isi, 1), "bui": round(bui, 1), "class": danger_class(fwi)}
