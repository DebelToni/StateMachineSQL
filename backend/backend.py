# backend.py – FastAPI backend for the repair‑shop state‑machine
# ---------------------------------------------------------------
# Prerequisites (add to requirements.txt):
#   fastapi
#   uvicorn[standard]
#   asyncpg
#   python-dotenv   # optional – load DATABASE_URL from .env
#
# Run: uvicorn backend:app --reload
# ---------------------------------------------------------------

import os
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------
# DATABASE_URL format: "postgresql://user:password@host:port/dbname"
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/repairshop",
)

# Default SLA threshold for /sla‑breaches (hours)
DEFAULT_SLA_HOURS = float(os.getenv("SLA_HOURS", 24))

# ------------------------------------------------------------------
# Application setup
# ------------------------------------------------------------------
app = FastAPI(title="Repair‑Shop State‑Machine API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    """Create a connection pool when the service starts."""
    app.state.pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)


@app.on_event("shutdown")
async def shutdown() -> None:
    """Close the pool gracefully."""
    await app.state.pool.close()


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
async def fetch_rows(query: str, *args) -> List[asyncpg.Record]:
    async with app.state.pool.acquire() as conn:
        return await conn.fetch(query, *args)


def records_to_dicts(rows: List[asyncpg.Record]) -> List[Dict[str, Any]]:
    return [dict(r) for r in rows]


# ------------------------------------------------------------------
# SQL snippets (multi‑line strings for readability)
# ------------------------------------------------------------------
CURRENT_UNITS_SQL = """
SELECT u.id           AS unit_id,
       u.unit_name,
       s.state_name    AS current_state,
       l.ts            AS state_since,
       u.unit_details  AS details
FROM   sm.sm_unit u
JOIN   LATERAL (
        SELECT final_state_id AS state_id, ts
        FROM   sm.sm_log
        WHERE  unit_id = u.id
        ORDER  BY ts DESC
        LIMIT  1
       ) l ON TRUE
JOIN   sm.state s ON s.id = l.state_id
ORDER  BY l.ts DESC;
"""

TECHNICIAN_BOARD_SQL = """
SELECT l.payload->>'tech'          AS technician,
       s.state_name                AS state,
       COUNT(*)                    AS cnt
FROM   sm.sm_log l
JOIN   sm.state s ON s.id = l.final_state_id
JOIN  (
       SELECT DISTINCT ON (unit_id) id
       FROM   sm.sm_log
       ORDER  BY unit_id, ts DESC
      ) last ON last.id = l.id
GROUP  BY technician, state
ORDER  BY technician, state;
"""

SLA_BREACHES_SQL = """
WITH latest AS (
  SELECT unit_id, final_state_id AS state_id, ts AS entered_at
  FROM (
    SELECT unit_id, final_state_id, ts,
           ROW_NUMBER() OVER (PARTITION BY unit_id ORDER BY ts DESC) AS rn
    FROM sm.sm_log
  ) t
  WHERE rn = 1
)
SELECT u.id, u.unit_name, s.state_name, latest.entered_at,
       EXTRACT(EPOCH FROM (clock_timestamp() - latest.entered_at))/3600 AS hours_in_state
FROM   latest
JOIN   sm.sm_unit u ON u.id = latest.unit_id
JOIN   sm.state   s ON s.id = latest.state_id
WHERE  s.state_name = ANY($1::text[])
  AND  clock_timestamp() - latest.entered_at > $2::interval
ORDER  BY hours_in_state DESC;
"""

THROUGHPUT_SQL = """
SELECT date_trunc('day', ts) AS day,
       COUNT(*) FILTER (WHERE sig.signal_name = 'finished work ok')     AS ok_jobs,
       COUNT(*) FILTER (WHERE sig.signal_name = 'finished work failed') AS failed_jobs
FROM   sm.sm_log l
JOIN   sm.signal sig ON sig.id = l.signal_id
WHERE  ts >= $1::timestamptz
  AND  ts <  $2::timestamptz
GROUP  BY 1
ORDER  BY 1;
"""

HEATMAP_SQL = """
SELECT s_in.state_name  AS from_state,
       sig.signal_name,
       s_out.state_name AS to_state,
       COUNT(*)         AS cnt
FROM   sm.sm_log l
JOIN   sm.state  s_in  ON s_in.id  = l.initial_state_id
JOIN   sm.state  s_out ON s_out.id = l.final_state_id
JOIN   sm.signal sig   ON sig.id   = l.signal_id
GROUP  BY 1,2,3
ORDER  BY cnt DESC;
"""

UNIT_DURATIONS_SQL = """
SELECT st.state_name,
       d.entered_at,
       COALESCE(d.left_at, clock_timestamp())                     AS left_at,
       EXTRACT(EPOCH FROM (COALESCE(d.left_at, clock_timestamp())
                           - d.entered_at))/60                    AS minutes_spent
FROM   sm.v_state_durations d
JOIN   sm.state st ON st.id = d.state_id
WHERE  d.unit_id = $1
ORDER  BY d.entered_at;
"""

AVG_STATE_DURATION_SQL = """
SELECT st.state_name,
       ROUND(AVG(EXTRACT(EPOCH FROM (d.left_at - d.entered_at)))/60) AS avg_minutes
FROM   sm.v_state_durations d
JOIN   sm.state st ON st.id = d.state_id
WHERE  d.left_at IS NOT NULL
GROUP  BY st.state_name
ORDER  BY avg_minutes DESC;
"""

# ------------------------------------------------------------------
# REST endpoints
# ------------------------------------------------------------------

@app.get("/health", tags=["meta"])
async def health() -> Dict[str, str]:
    """Simple liveness check."""
    return {"status": "ok"}


@app.get("/units", tags=["live"], summary="Current state for every unit")
async def units() -> List[Dict[str, Any]]:
    rows = await fetch_rows(CURRENT_UNITS_SQL)
    return records_to_dicts(rows)


@app.get("/technicians", tags=["live"], summary="Work‑in‑progress grouped by technician & state")
async def technicians() -> List[Dict[str, Any]]:
    rows = await fetch_rows(TECHNICIAN_BOARD_SQL)
    return records_to_dicts(rows)


@app.get("/sla-breaches", tags=["live"], summary="Units stuck in selected states beyond SLA threshold")
async def sla_breaches(
    hours: float = Query(DEFAULT_SLA_HOURS, ge=1, le=168),
    states: List[str] = Query(["parts missing", "assigned"]),
) -> List[Dict[str, Any]]:
    interval = f"{hours} hours"
    rows = await fetch_rows(SLA_BREACHES_SQL, states, interval)
    return records_to_dicts(rows)


@app.get("/throughput", tags=["stats"], summary="Daily throughput for a date range")
async def throughput(
    days: int = Query(30, ge=1, le=365),
) -> List[Dict[str, Any]]:
    until = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    since = until - timedelta(days=days)
    rows = await fetch_rows(THROUGHPUT_SQL, since, until)
    return records_to_dicts(rows)


@app.get("/heatmap", tags=["stats"], summary="Transition counts (for Sankey / Graphviz)")
async def heatmap() -> List[Dict[str, Any]]:
    rows = await fetch_rows(HEATMAP_SQL)
    return records_to_dicts(rows)


@app.get("/units/{unit_id}/durations", tags=["stats"], summary="Timeline of a unit through states")
async def unit_durations(unit_id: int) -> List[Dict[str, Any]]:
    rows = await fetch_rows(UNIT_DURATIONS_SQL, unit_id)
    if not rows:
        raise HTTPException(status_code=404, detail="Unit not found")
    return records_to_dicts(rows)


@app.get("/states/average-durations", tags=["stats"], summary="Average time spent in every state (minutes)")
async def average_state_durations() -> List[Dict[str, Any]]:
    rows = await fetch_rows(AVG_STATE_DURATION_SQL)
    return records_to_dicts(rows)


# ------------------------------------------------------------------
# Convenience: run with `python backend.py` (development only)
# ------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)

