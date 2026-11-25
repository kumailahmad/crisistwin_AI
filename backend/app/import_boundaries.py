"""Import district boundaries from a GeoJSON FeatureCollection (e.g. geoBoundaries ADM2).

python -m app.import_boundaries path/to/districts.geojson

Each feature needs properties.name and properties.source. Districts are created as UNVERIFIED so an
administrator can review them; existing boundaries are replaced. Nothing is invented: geometry is stored as given.
"""
import json
import sys

from sqlalchemy import select

from app.core.database import Base, SessionLocal, engine
from app.models import Boundary, District
from app.services.gis_service import GeometryError, validate_polygon

if __name__ == "__main__":
    Base.metadata.create_all(engine)
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    done = skipped = 0
    with SessionLocal() as db:
        for f in data["features"]:
            props, name = f["properties"], f["properties"]["name"]
            try:
                validate_polygon(f["geometry"])
            except GeometryError as exc:
                print(f"skip {name}: {exc}")
                skipped += 1
                continue
            d = db.scalar(select(District).where(District.name == name))
            if not d:
                d = District(name=name, area_km2=props.get("area_km2_approx"), data_source=props.get("source"), verified=False)
                db.add(d)
                db.flush()
            if d.boundary:
                d.boundary.geometry, d.boundary.source = f["geometry"], props["source"]
            else:
                d.boundary = Boundary(geometry=f["geometry"], source=props["source"])
            done += 1
        db.commit()
    print(f"imported {done}, skipped {skipped}")
