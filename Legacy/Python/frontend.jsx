// frontend.jsx — Single‑file React app (Vite + Tailwind + shadcn/ui)
// -----------------------------------------------------------------------------
// Instructions
// 1.   npm create vite@latest repairshop-frontend -- --template react
// 2.   cd repairshop-frontend
// 3.   npm i
// 4.   npm i react-router-dom recharts lucide-react @tanstack/react-query
//      # shadcn/ui & Tailwind (vite‑native helper) – run install script:
//      npx shadcn-ui@latest init --tailwind
// 5.   Copy this file over src/App.jsx (or keep the name and adjust main.jsx)
// 6.   echo "VITE_API_URL=http://localhost:8000" > .env.local
// 7.   npm run dev
// -----------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useParams,
  useNavigate,
} from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  Activity,
  Users,
  AlertTriangle,
  TrendingUp,
  Home,
  ArrowLeft,
} from "lucide-react";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const qClient = new QueryClient();

function fetchJSON(path) {
  return fetch(`${API_BASE}${path}`).then((r) => {
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  });
}

// -----------------------------------------------------------------------------
// Nav bar
// -----------------------------------------------------------------------------
function Nav() {
  return (
    <nav className="w-full px-4 py-2 shadow bg-white sticky top-0 z-50 flex gap-4 items-center">
      <Home className="text-sky-600" />
      <Link className="font-semibold" to="/">Dashboard</Link>
      <Link className="font-semibold" to="/technicians">Technicians</Link>
      <Link className="font-semibold" to="/sla">SLA Breaches</Link>
    </nav>
  );
}

// -----------------------------------------------------------------------------
// Dashboard page
// -----------------------------------------------------------------------------
function Dashboard() {
  const unitsQ = useQuery({ queryKey: ["units"], queryFn: () => fetchJSON("/units") });
  const tpQ = useQuery({ queryKey: ["tp"], queryFn: () => fetchJSON("/throughput?days=30") });
  const heatQ = useQuery({ queryKey: ["heat"], queryFn: () => fetchJSON("/heatmap") });

  if (unitsQ.isLoading || tpQ.isLoading || heatQ.isLoading) return <div className="p-4">Loading…</div>;
  if (unitsQ.isError || tpQ.isError || heatQ.isError) return <div className="p-4 text-red-500">Error loading data</div>;

  const total = unitsQ.data.length;
  const finished = unitsQ.data.filter((u) => u.current_state === "reported").length;
  const wip = total - finished;

  // Recharts expects numeric values
  const tpData = tpQ.data.map((d) => ({ ...d, ok_jobs: +d.ok_jobs, failed_jobs: +d.failed_jobs }));

  return (
    <div className="p-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {/* Summary cards */}
      <StatCard icon={<Users />} label="Total Units" value={total} />
      <StatCard icon={<Activity />} label="Work in Progress" value={wip} />
      <StatCard icon={<TrendingUp />} label="Completed" value={finished} />
      <StatCard icon={<AlertTriangle />} label="Transitions" value={heatQ.data.length} />

      {/* Throughput chart */}
      <Card className="col-span-full xl:col-span-2">
        <CardHeader>
          <CardTitle>Throughput (30 days)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tpData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tickFormatter={(v) => v.slice(5, 10)} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="ok_jobs" stackId="a" />
              <Bar dataKey="failed_jobs" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Simple heatmap table (placeholder for Sankey) */}
      <Card className="col-span-full xl:col-span-2">
        <CardHeader>
          <CardTitle>Top transitions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto max-h-72">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1">From</th>
                <th className="text-left py-1">Signal</th>
                <th className="text-left py-1">To</th>
                <th className="text-right py-1">Count</th>
              </tr>
            </thead>
            <tbody>
              {heatQ.data.slice(0, 20).map((t) => (
                <tr key={`${t.from_state}-${t.signal_name}-${t.to_state}`} className="hover:bg-slate-50">
                  <td className="py-1 pr-2">{t.from_state}</td>
                  <td className="py-1 pr-2">{t.signal_name}</td>
                  <td className="py-1 pr-2">{t.to_state}</td>
                  <td className="py-1 text-right pr-2">{t.cnt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <Card className="flex-1 flex flex-col">
      <CardHeader className="flex-row items-center gap-4 pb-0">
        {icon}
        <CardTitle className="text-base font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2 text-3xl font-bold">{value}</CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Technicians page
// -----------------------------------------------------------------------------
function Technicians() {
  const techQ = useQuery({ queryKey: ["tech"], queryFn: () => fetchJSON("/technicians") });
  if (techQ.isLoading) return <div className="p-4">Loading…</div>;
  if (techQ.isError) return <div className="p-4 text-red-500">Error loading data</div>;

  // group by technician
  const grouped = techQ.data.reduce((acc, row) => {
    const tech = row.technician ?? "Unassigned";
    acc[tech] = acc[tech] || [];
    acc[tech].push(row);
    return acc;
  }, {});

  return (
    <div className="p-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {Object.entries(grouped).map(([tech, rows]) => (
        <Card key={tech} className="flex flex-col">
          <CardHeader>
            <CardTitle>{tech}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.state} className="border-b last:border-0">
                    <td className="py-1 capitalize">{r.state}</td>
                    <td className="py-1 text-right pr-2">{r.cnt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SLA breaches page
// -----------------------------------------------------------------------------
function SlaBreaches() {
  const slaQ = useQuery({ queryKey: ["sla"], queryFn: () => fetchJSON("/sla-breaches") });
  const navigate = useNavigate();
  if (slaQ.isLoading) return <div className="p-4">Loading…</div>;
  if (slaQ.isError) return <div className="p-4 text-red-500">Error loading data</div>;

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Units breaching SLA</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1">Unit</th>
                <th className="text-left py-1">State</th>
                <th className="text-right py-1">Hours in state</th>
              </tr>
            </thead>
            <tbody>
              {slaQ.data.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/unit/${u.id}`)}>
                  <td className="py-1 pr-2 underline text-sky-700">{u.unit_name}</td>
                  <td className="py-1 pr-2">{u.state_name}</td>
                  <td className="py-1 text-right pr-2">{u.hours_in_state.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Unit timeline page
// -----------------------------------------------------------------------------
function UnitTimeline() {
  const { unitId } = useParams();
  const nav = useNavigate();
  const durQ = useQuery({ queryKey: ["dur", unitId], queryFn: () => fetchJSON(`/units/${unitId}/durations`) });
  if (durQ.isLoading) return <div className="p-4">Loading…</div>;
  if (durQ.isError) return <div className="p-4 text-red-500">Error loading data</div>;

  const data = durQ.data.map((d) => ({ ...d, minutes_spent: +d.minutes_spent }));

  return (
    <div className="p-6 space-y-4">
      <Button variant="ghost" className="flex items-center gap-2" onClick={() => nav(-1)}>
        <ArrowLeft size={16} /> Back
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Unit {unitId} — state timeline</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="state_name" />
              <YAxis allowDecimals={false} label={{ angle: -90, value: "minutes" }} />
              <Tooltip />
              <Bar dataKey="minutes_spent" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// App root
// -----------------------------------------------------------------------------
export default function App() {
  return (
    <QueryClientProvider client={qClient}>
      <Router>
        <Nav />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/technicians" element={<Technicians />} />
          <Route path="/sla" element={<SlaBreaches />} />
          <Route path="/unit/:unitId" element={<UnitTimeline />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

