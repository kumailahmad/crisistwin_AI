"""Transparent weighted flood-risk score.

Each factor is normalised to 0..1 (1 = more flood-prone). Missing factors are excluded and the
remaining weights are re-scaled; they are never treated as zero risk. If the available weight
falls below MIN_COVERAGE the engine refuses to produce a score.
These normalisation ranges are heuristics for a prototype, not calibrated hydrology.
"""
DEFAULT_WEIGHTS = {
    "rainfall_mm_24h": 0.35,
    "elevation_m": 0.15,
    "slope_deg": 0.15,
    "flood_history_index": 0.20,
    "exposure_index": 0.15,
}
MIN_COVERAGE = 0.5
CATEGORIES = [(25, "Low"), (50, "Moderate"), (75, "High"), (100.0001, "Severe")]
DISCLAIMER = "Prototype heuristic score. Not a verified flood prediction."


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def normalise(name: str, value: float) -> float:
    if name == "rainfall_mm_24h":
        return _clamp(value / 200.0)
    if name == "elevation_m":  # lower ground collects water
        return 1.0 - _clamp(value / 3000.0)
    if name == "slope_deg":  # flatter terrain drains slowly
        return 1.0 - _clamp(value / 30.0)
    return _clamp(value)


def assess(inputs: dict, statuses: dict | None = None, weights: dict | None = None) -> dict:
    weights = weights or DEFAULT_WEIGHTS
    statuses = statuses or {}
    factors, used_weight = [], 0.0
    for name, w in weights.items():
        v = inputs.get(name)
        if v is None:
            factors.append({"name": name, "value": None, "normalised": None, "weight": w, "status": "missing"})
            continue
        n = normalise(name, v)
        used_weight += w
        factors.append({"name": name, "value": v, "normalised": round(n, 3), "weight": w,
                        "status": statuses.get(name, "unspecified")})
    total = sum(weights.values())
    coverage = round(used_weight / total, 3)
    if coverage < MIN_COVERAGE:
        return {"score": None, "category": "Insufficient data", "coverage": coverage, "factors": factors,
                "missing": [f["name"] for f in factors if f["status"] == "missing"],
                "explanation": "Too many inputs are missing to produce a score.", "disclaimer": DISCLAIMER}
    score = round(sum(f["normalised"] * f["weight"] for f in factors if f["normalised"] is not None) / used_weight * 100, 1)
    category = next(c for limit, c in CATEGORIES if score < limit)
    missing = [f["name"] for f in factors if f["status"] == "missing"]
    note = f" Score is based on {int(coverage*100)}% of factor weight; missing: {', '.join(missing)}." if missing else ""
    return {"score": score, "category": category, "coverage": coverage, "factors": factors, "missing": missing,
            "explanation": "Weighted average of normalised factors." + note, "disclaimer": DISCLAIMER}
