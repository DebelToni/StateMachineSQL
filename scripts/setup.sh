#!/usr/bin/env bash
# scripts/setup.sh (revised)
set -euo pipefail

DB_NAME="repairshop"
DB_USER="repairshop_user"
DB_PASS="repairshop_pass"
PG_PORT=5432

# Allow overriding the PG superuser (in case 'postgres' user doesn't exist):
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"

VENV_DIR="backend/venv"
BACKEND_HOST="0.0.0.0"
BACKEND_PORT=8000
FRONTEND_PORT=5173   # vite default

echo "=== Repair-Shop bootstrap (revised) ==="

# ------------------------------------------------------------------
# Helper: run psql as either sudo -u $PG_SUPERUSER or current user
# ------------------------------------------------------------------
psql_super() {
  # try sudo first
  if sudo -u "$PG_SUPERUSER" true 2>/dev/null; then
    sudo -u "$PG_SUPERUSER" psql -X --set ON_ERROR_STOP=1 "$@"
  else
    # no sudo user available, assume current user can run psql
    PGPASSWORD="${PG_SUPERUSER_PASSWORD:-}" psql -X --set ON_ERROR_STOP=1 -U "$PG_SUPERUSER" "$@"
  fi
}

# ------------------------------------------------------------------
# 1. Install PostgreSQL on Debian/Ubuntu (if missing)
# ------------------------------------------------------------------
if [[ -f /etc/os-release && $(grep -cE 'ID=ubuntu|ID=debian' /etc/os-release) -gt 0 ]]; then
  if ! command -v psql >/dev/null; then
    echo "Installing PostgreSQL 16 (via apt)..."
    sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list'
    wget -qO - https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | sudo apt-key add -
    sudo apt update
    sudo apt install -y postgresql-16
    sudo systemctl enable --now postgresql
  fi
fi

# ------------------------------------------------------------------
# 2. Create DB user & database
# ------------------------------------------------------------------
echo "Configuring database (superuser: $PG_SUPERUSER)..."
psql_super -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
  | grep -q 1 || psql_super -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}'"

psql_super -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 || psql_super -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}"

# ------------------------------------------------------------------
# 3. Load our SQL migrations as $DB_USER
# ------------------------------------------------------------------
echo "Running migrations as ${DB_USER}..."
for f in db/*.sql; do
  PGPASSWORD="${DB_PASS}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
    -d "${DB_NAME}" -f "$f"
done

# ------------------------------------------------------------------
# 4. Python venv & backend deps
# ------------------------------------------------------------------
echo "Setting up Python virtualenv..."
python3 -m venv "${VENV_DIR}"
source "${VENV_DIR}/bin/activate"
pip install --upgrade pip
pip install -r backend/requirements.txt

# write .env for backend
cat > backend/.env <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:${PG_PORT}/${DB_NAME}
SLA_HOURS=24
EOF

# ------------------------------------------------------------------
# 5. Frontend npm install
# ------------------------------------------------------------------
echo "Installing frontend dependencies..."
pushd frontend >/dev/null
npm install
popd >/dev/null

# ------------------------------------------------------------------
# 6. Launch both servers via tmux
# ------------------------------------------------------------------
if ! command -v tmux >/dev/null; then
  echo "tmux not found – installing..."
  if [[ -f /etc/os-release && $(grep -cE 'ID=ubuntu|ID=debian' /etc/os-release) -gt 0 ]]; then
    sudo apt install -y tmux
  else
    echo "Please install tmux manually."
    exit 1
  fi
fi

SESSION="repairshop_demo"
tmux new-session -d -s "${SESSION}" -n backend \
  "source ${VENV_DIR}/bin/activate && uvicorn backend:app --host ${BACKEND_HOST} --port ${BACKEND_PORT} --reload"

tmux new-window -t "${SESSION}" -n frontend \
  "cd frontend && VITE_API_URL=http://${BACKEND_HOST}:${BACKEND_PORT} npm run dev -- --port ${FRONTEND_PORT}"

echo ""
echo "→ Backend   http://${BACKEND_HOST}:${BACKEND_PORT}/docs"
echo "→ Frontend  http://localhost:${FRONTEND_PORT}"
echo ""
echo "Logs are in tmux session: tmux attach -t ${SESSION}"

