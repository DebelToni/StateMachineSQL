#!/usr/bin/env bash
# scripts/start.sh

# 1) backend
tmux new-session -d -s repairshop_demo \
  "cd backend && source venv/bin/activate && uvicorn backend:app --reload"

# 2) frontend
tmux split-window -h -t repairshop_demo \
  "cd frontend && npm run dev"

echo "▶ Servers are now running in tmux session 'repairshop_demo'"
echo "  • Backend  http://localhost:8000/docs"
echo "  • Frontend http://localhost:5173"
echo "▶ Attach with: tmux attach -t repairshop_demo"

