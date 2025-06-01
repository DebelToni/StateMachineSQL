# backend_flask_sync.py – Flask backend with synchronous database operations
# ---------------------------------------------------------------
# Prerequisites (add to requirements.txt):
#   Flask>=2.0
#   Flask-CORS
#   psycopg2-binary  # or psycopg2
#   python-dotenv   # optional – load DATABASE_URL from .env
#
# Run: python backend_flask_sync.py
# ---------------------------------------------------------------

import os
import psycopg2
import psycopg2.extras
from typing import List, Dict, Any
from datetime import datetime, timedelta

from flask import Flask, jsonify, request, abort, send_from_directory
from flask_cors import CORS

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------
# DATABASE_URL format: "postgresql://user:password@host:port/dbname"
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/postgres",
)

# Default SLA threshold for /sla-breaches (hours)
DEFAULT_SLA_HOURS = float(os.getenv("SLA_HOURS", 24))

# ------------------------------------------------------------------
# Database Helper Functions
# ------------------------------------------------------------------
def get_db_connection():
    """Creates a new database connection."""
    return psycopg2.connect(DATABASE_URL)

def fetch_rows(query: str, *args) -> List[Dict[str, Any]]:
    """Fetches rows from the database and returns them as dictionaries."""
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, args)
            return [dict(row) for row in cur.fetchall()]

# ------------------------------------------------------------------
# Application setup
# ------------------------------------------------------------------
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
app = Flask(__name__, static_folder=frontend_dir)
app.title = "Repair-Shop State-Machine API (Flask)"
app.version = "1.0.0"

CORS(app)  # Enable CORS for all routes

# ------------------------------------------------------------------
# SQL snippets (same as before)
# ------------------------------------------------------------------
CURRENT_UNITS_SQL = """
                    SELECT u.id           AS unit_id,
                           u.unit_name,
                           s.state_name   AS current_state,
                           l.ts           AS state_since,
                           u.unit_details AS details
                    FROM sm.sm_unit u 
                             JOIN LATERAL (
                        SELECT final_state_id AS state_id, ts
                        FROM sm.sm_log
                        WHERE unit_id = u.id
                        ORDER BY ts DESC
                        LIMIT 1
                        ) l ON TRUE 
                             JOIN sm.state s ON s.id = l.state_id
                    ORDER BY l.ts DESC;
                    """

TECHNICIAN_BOARD_SQL = """
                       SELECT l.payload ->> 'tech' AS technician,
                              s.state_name         AS state,
                              COUNT(*)             AS cnt
                       FROM sm.sm_log l 
                                JOIN sm.state s ON s.id = l.final_state_id 
                                JOIN (SELECT DISTINCT ON (unit_id) id 
                                      FROM sm.sm_log 
                                      ORDER BY unit_id, ts DESC) last ON last.id = l.id
                       GROUP BY technician, state
                       ORDER BY technician, state;
                       """

SLA_BREACHES_SQL = """
                   WITH latest AS (SELECT unit_id, final_state_id AS state_id, ts AS entered_at 
                                   FROM (SELECT unit_id, 
                                                final_state_id, 
                                                ts, 
                                                ROW_NUMBER() OVER (PARTITION BY unit_id ORDER BY ts DESC) AS rn 
                                         FROM sm.sm_log) t 
                                   WHERE rn = 1)
                   SELECT u.id, 
                          u.unit_name, 
                          s.state_name, 
                          latest.entered_at,
                          EXTRACT(EPOCH FROM (clock_timestamp() - latest.entered_at)) / 3600 AS hours_in_state
                   FROM latest 
                            JOIN sm.sm_unit u ON u.id = latest.unit_id 
                            JOIN sm.state s ON s.id = latest.state_id
                   WHERE s.state_name = ANY (%s::text[])
                     AND clock_timestamp() - latest.entered_at > %s::interval
                   ORDER BY hours_in_state DESC;
                   """

THROUGHPUT_SQL = """
                 SELECT date_trunc('day', ts)                                            AS day,
                        COUNT(*) FILTER (WHERE sig.signal_name = 'finished work ok')     AS ok_jobs,
                        COUNT(*) FILTER (WHERE sig.signal_name = 'finished work failed') AS failed_jobs
                 FROM sm.sm_log l 
                          JOIN sm.signal sig ON sig.id = l.signal_id
                 WHERE ts >= %s::timestamptz
                   AND ts < %s::timestamptz
                 GROUP BY 1
                 ORDER BY 1;
                 """

HEATMAP_SQL = """
              SELECT s_in.state_name  AS from_state,
                     sig.signal_name,
                     s_out.state_name AS to_state,
                     COUNT(*)         AS cnt
              FROM sm.sm_log l 
                       JOIN sm.state s_in ON s_in.id = l.initial_state_id 
                       JOIN sm.state s_out ON s_out.id = l.final_state_id 
                       JOIN sm.signal sig ON sig.id = l.signal_id
              GROUP BY 1, 2, 3
              ORDER BY cnt DESC;
              """

UNIT_DURATIONS_SQL = """
                     SELECT st.state_name,
                            d.entered_at,
                            COALESCE(d.left_at, clock_timestamp()) AS left_at,
                            EXTRACT(EPOCH FROM (COALESCE(d.left_at, clock_timestamp())
                                - d.entered_at)) / 60              AS minutes_spent
                     FROM sm.v_state_durations d 
                              JOIN sm.state st ON st.id = d.state_id
                     WHERE d.unit_id = %s
                     ORDER BY d.entered_at;
                     """

AVG_STATE_DURATION_SQL = """
                         SELECT st.state_name,
                                ROUND(AVG(EXTRACT(EPOCH FROM (d.left_at - d.entered_at))) / 60) AS avg_minutes
                         FROM sm.v_state_durations d 
                                  JOIN sm.state st ON st.id = d.state_id
                         WHERE d.left_at IS NOT NULL
                         GROUP BY st.state_name
                         ORDER BY avg_minutes DESC;
                         """

# ------------------------------------------------------------------
# REST endpoints
# ------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    """Simple liveness check."""
    return jsonify({"status": "ok"})

@app.route("/units", methods=["GET"])
def units():
    """Current state for every unit."""
    try:
        rows = fetch_rows(CURRENT_UNITS_SQL)
        return jsonify(rows)
    except Exception as e:
        app.logger.error(f"Error in /units: {e}")
        abort(500, description="Database error")

@app.route("/technicians", methods=["GET"])
def technicians():
    """Work-in-progress grouped by technician & state."""
    try:
        rows = fetch_rows(TECHNICIAN_BOARD_SQL)
        return jsonify(rows)
    except Exception as e:
        app.logger.error(f"Error in /technicians: {e}")
        abort(500, description="Database error")

@app.route("/sla-breaches", methods=["GET"])
def sla_breaches():
    """Units stuck in selected states beyond SLA threshold."""
    try:
        hours_str = request.args.get('hours', default=str(DEFAULT_SLA_HOURS))
        hours = float(hours_str)
        if not (1 <= hours <= 168):
            abort(400, description="Query parameter 'hours' must be between 1 and 168.")
    except ValueError:
        abort(400, description="Query parameter 'hours' must be a valid number.")

    states = request.args.getlist('states')
    if not states:
        states = ["parts missing", "assigned"]

    interval = f"{hours} hours"
    try:
        rows = fetch_rows(SLA_BREACHES_SQL, states, interval)
        return jsonify(rows)
    except Exception as e:
        app.logger.error(f"Error in /sla-breaches: {e}")
        abort(500, description="Database error")

@app.route("/throughput", methods=["GET"])
def throughput():
    """Daily throughput for a date range."""
    try:
        days_str = request.args.get('days', default='30')
        days = int(days_str)
        if not (1 <= days <= 365):
            abort(400, description="Query parameter 'days' must be between 1 and 365.")
    except ValueError:
        abort(400, description="Query parameter 'days' must be a valid integer.")

    until = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    since = until - timedelta(days=days)
    try:
        rows = fetch_rows(THROUGHPUT_SQL, since, until)
        return jsonify(rows)
    except Exception as e:
        app.logger.error(f"Error in /throughput: {e}")
        abort(500, description="Database error")

@app.route("/heatmap", methods=["GET"])
def heatmap():
    """Transition counts (for Sankey / Graphviz)."""
    try:
        rows = fetch_rows(HEATMAP_SQL)
        return jsonify(rows)
    except Exception as e:
        app.logger.error(f"Error in /heatmap: {e}")
        abort(500, description="Database error")

@app.route("/units/<int:unit_id>/durations", methods=["GET"])
def unit_durations(unit_id: int):
    """Timeline of a unit through states."""
    try:
        rows = fetch_rows(UNIT_DURATIONS_SQL, unit_id)
        if not rows:
            abort(404, description="Unit not found")
        return jsonify(rows)
    except Exception as e:
        app.logger.error(f"Error in /units/{unit_id}/durations: {e}")
        abort(500, description="Database error")

@app.route("/states/average-durations", methods=["GET"])
def average_state_durations():
    """Average time spent in every state (minutes)."""
    try:
        rows = fetch_rows(AVG_STATE_DURATION_SQL)
        return jsonify(rows)
    except Exception as e:
        app.logger.error(f"Error in /states/average-durations: {e}")
        abort(500, description="Database error")

# ------------------------------------------------------------------
# Static File Serving
# ------------------------------------------------------------------

@app.route('/')
def serve_index():
    """Serves the index.html from the frontend directory."""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:filename>')
def serve_static_files(filename: str):
    """Serves other static files from the frontend directory."""
    return send_from_directory(app.static_folder, filename)

# ------------------------------------------------------------------
# Development server runner
# ------------------------------------------------------------------
if __name__ == "__main__":
    print("Starting Flask development server...")
    app.run(host="localhost", port=8000, debug=True)