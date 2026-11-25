from app.services import risk_engine

ASSUMPTIONS = [
    "Rainfall is treated as uniform over the whole district for the stated duration.",
    "The rainfall factor uses the heaviest 24-hour accumulation of the scenario (intensity x min(duration, 24 h)), compared against a fixed 200 mm reference.",
    "Terrain, history and exposure factors use only the values supplied; absent values are excluded, not zeroed.",
]
LIMITATIONS = [
    "This is an indicator-based scenario, not a hydrological or hydraulic flood inundation model.",
    "It does not model drainage networks, soil saturation, upstream inflow, dams or river channels.",
    "Results must not be used for evacuation or operational decisions.",
]


def run(params: dict, boundary_geojson: dict | None) -> dict:
    total = params["rainfall_intensity_mm_h"] * params["duration_h"]
    inputs = {"rainfall_mm_24h": min(params["rainfall_intensity_mm_h"] * min(params["duration_h"], 24.0), 1000.0)}
    for k in ("elevation_m", "slope_deg", "flood_history_index", "exposure_index"):
        inputs[k] = params.get(k)
    status = {"rainfall_mm_24h": "assumption", **params.get("input_status", {})}
    indicators = risk_engine.assess(inputs, status)
    viz = ({"type": "Feature", "geometry": boundary_geojson,
            "properties": {"category": indicators["category"], "score": indicators["score"]}}
           if boundary_geojson else None)
    return {"total_rainfall_mm": round(total, 1), "risk_indicators": indicators, "visualization": viz,
            "visualization_note": None if viz else "No verified boundary is stored for this district.",
            "assumptions": ASSUMPTIONS, "limitations": LIMITATIONS, "processing_status": "completed"}
