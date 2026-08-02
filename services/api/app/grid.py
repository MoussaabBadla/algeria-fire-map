"""ML training grid — seed grid_cells over fire-prone northern Algeria.

The first, R2-independent piece of the training-data pipeline (Milestone 6):
a static 0.1° (~11 km) grid, border-clipped and cut off south of ~34°N so the
Sahara's gas-flare detections never become training samples. Each (cell, day)
becomes one sample once feature/label snapshots land on top.

Runs server-side on Railway (it needs the DB pool + the border polygon), driven
by POST /admin/seed-grid. Idempotent: re-running only inserts missing cells.
"""
from __future__ import annotations

import logging
import math

from shapely.geometry import Point, box

from .config import get_settings
from .db import get_pool
# Reuse the exact border polygon (prepared, buffered) the fire clip already uses,
# so the grid covers the same Algeria the detections do — no drift between them.
from .firms import _ALGERIA  # prepared shapely geometry

logger = logging.getLogger(__name__)

# Idempotent schema (mirrors supabase/migrations/20260802090000_grid_cells.sql) so
# the endpoint is self-sufficient even before the migration is pushed via the CLI.
_ENSURE_SCHEMA = """
create extension if not exists postgis;
create table if not exists grid_cells (
    id            bigserial primary key,
    cell_id       text unique not null,
    cx            double precision not null,
    cy            double precision not null,
    geom          geometry(Point, 4326)   not null,
    cell          geometry(Polygon, 4326) not null,
    wilaya_code   integer references wilayas(code),
    elevation_m   real,
    slope_deg     real,
    aspect_deg    real,
    land_cover    text,
    created_at    timestamptz not null default now()
);
create index if not exists grid_cells_geom_gix   on grid_cells using gist (geom);
create index if not exists grid_cells_cell_gix    on grid_cells using gist (cell);
create index if not exists grid_cells_wilaya_idx  on grid_cells (wilaya_code);
"""

# Insert one cell, assigning the nearest wilaya via KNN (<->) on the seeded
# centroids — the same nearest-centroid rule detections use. Idempotent on cell_id.
_UPSERT_SQL = """
insert into grid_cells (cell_id, cx, cy, geom, cell, wilaya_code)
values (
    $1, $2, $3,
    ST_SetSRID(ST_MakePoint($2, $3), 4326),
    ST_GeomFromText($4, 4326),
    (select code from wilayas
      order by geom <-> ST_SetSRID(ST_MakePoint($2, $3), 4326) limit 1)
)
on conflict (cell_id) do nothing
"""


def _generate_cells() -> list[tuple[str, float, float, str]]:
    """Enumerate grid cells on the global 0.1° lattice, clipped to Algeria's border
    and the southern latitude cutoff. Returns (cell_id, cx, cy, cell_wkt) tuples."""
    s = get_settings()
    step = s.grid_step_deg
    # Global lattice indices so cell_ids are stable regardless of the scan bbox.
    i0, i1 = math.floor(s.grid_west_lng / step), math.floor(s.grid_east_lng / step)
    j0, j1 = math.floor(s.grid_south_lat / step), math.floor(s.grid_north_lat / step)
    cells: list[tuple[str, float, float, str]] = []
    for j in range(j0, j1 + 1):
        cy = round((j + 0.5) * step, 5)
        if cy < s.grid_south_lat:  # centre must clear the cutoff
            continue
        for i in range(i0, i1 + 1):
            cx = round((i + 0.5) * step, 5)
            if not _ALGERIA.contains(Point(cx, cy)):
                continue
            poly = box(round(i * step, 5), round(j * step, 5),
                       round((i + 1) * step, 5), round((j + 1) * step, 5))
            cells.append((f"{j}_{i}", cx, cy, poly.wkt))
    return cells


async def seed_grid() -> dict:
    """Create grid_cells if absent and insert any missing cells. Idempotent."""
    pool = await get_pool()
    if pool is None:
        return {"seeded": 0, "total": 0, "reason": "no database configured"}
    cells = _generate_cells()
    async with pool.acquire() as conn:
        await conn.execute(_ENSURE_SCHEMA)
        before = await conn.fetchval("select count(*) from grid_cells")
        await conn.executemany(_UPSERT_SQL, cells)
        after = await conn.fetchval("select count(*) from grid_cells")
    seeded = int(after) - int(before)
    logger.info("grid seed: %d generated, %d new, %d total", len(cells), seeded, after)
    return {"generated": len(cells), "seeded": seeded, "total": int(after)}
