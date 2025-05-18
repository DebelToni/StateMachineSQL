# Piton
<br>

## FastAPI backend

The api includes:
| Route                                                             | Purpose                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| `GET /health`                                                     | Liveness probe                                          |
| `GET /units`                                                      | Live list of every unit, its current state & timestamp   |
| `GET /technicians`                                                | Per-technician *kanban* counts                          |
| `GET /sla-breaches?hours=24&states=parts+missing&states=assigned` | Units stuck beyond SLA                                  |
| `GET /throughput?days=30`                                         | Daily OK / failed completions                           |
| `GET /heatmap`                                                    | Transition counts (feed into Sankey)                     |
| `GET /units/{unit_id}/durations`                                  | Full timeline for one unit                              |
| `GET /states/average-durations`                                   | Global average minutes per state                        |


Setup backend:
```bash
# 1. Install deps
pip install -r requirements.txt      # (fastapi, uvicorn, asyncpg)

# 2. Point to your DB
export DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/repairshop

# 3. Run
uvicorn backend:app --reload
```

---
## React frontend

| Route           | What you see                                                              |
| --------------- | ------------------------------------------------------------------------- |
| `/`             | Dashboard – KPI cards, 30-day throughput bar chart, top transitions table   |
| `/technicians`  | Technician “kanban” panels (state counts)                                  |
| `/sla`          | Table of units breaching SLA (click → timeline)                             |
| `/unit/:unitId` | Bar-chart timeline of minutes spent in each state                           |


Setup frontend:
```bash
npm create vite@latest repairshop-frontend -- --template react
cd repairshop-frontend
npm i
npm i react-router-dom recharts lucide-react @tanstack/react-query
npx shadcn-ui@latest init --tailwind
# replace src/App.jsx with the file from the canvas
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```
