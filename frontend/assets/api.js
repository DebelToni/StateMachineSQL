/* assets/api.js  – a few tiny helpers */

const API = (window.API_BASE = window.API_BASE || "http://localhost:8000");

export async function getJSON(path) {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`${r.status} – ${r.statusText}`);
  return r.json();
}

/* Render helpers — quick n’ dirty */

export function $(sel, root = document) { return root.querySelector(sel); }
export function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

/* Fill a <tbody> with rows [{a:"",b:""}]  (keys = <td> order) */
export function fillTable(tbody, rows, keys) {
  tbody.innerHTML = "";
  rows.forEach(r => {
    tbody.insertAdjacentHTML(
      "beforeend",
      `<tr>${keys.map(k => `<td>${r[k]}</td>`).join("")}</tr>`
    );
  });
}

