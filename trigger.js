// ElseMail keeper — Railway cron (every 6h). Ensures one fresh elsemail-fs
// backend run is alive. Idempotent: skips when a fresh run is active,
// replaces stuck runs, then waits for public health.
//
// Env:
//   GH_TOKEN   (required) PAT with Actions read+write on elsemail-fs
//   OWNER      default td1tdcosayt1234-creator
//   REPO       default elsemail-fs
//   MAX_AGE_MIN default 330 — active run younger than this = fresh, skip
//   HEALTH_URL default https://fs.elsemail.indevs.in/health
'use strict';
const OWNER = process.env.OWNER || 'td1tdcosayt1234-creator';
const REPO = process.env.REPO || 'elsemail-fs';
const MAX_AGE_MIN = parseInt(process.env.MAX_AGE_MIN || '330', 10);
const HEALTH_URL = process.env.HEALTH_URL || 'https://fs.elsemail.indevs.in/health';
const GH = process.env.GH_TOKEN;
if (!GH) { console.error('GH_TOKEN env missing'); process.exit(1); }
const H = { Authorization: 'Bearer ' + GH, 'User-Agent': 'elsemail-keeper', Accept: 'application/vnd.github+json' };
const gh = async (m, p, body) => {
  const r = await fetch('https://api.github.com' + p, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (_) {}
  return { status: r.status, json: j, text: t.slice(0, 300) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const health = async () => {
  try {
    const r = await fetch(HEALTH_URL);
    return r.ok;
  } catch (_) { return false; }
};
(async () => {
  const w = await gh('GET', `/repos/${OWNER}/${REPO}/actions/workflows`);
  if (w.status !== 200) throw new Error('workflows list failed: ' + w.status);
  const wf = (w.json.workflows || []).find((x) => x.path === '.github/workflows/fs-host.yml') || (w.json.workflows || [])[0];
  if (!wf) throw new Error('no workflow found');
  const runs = await gh('GET', `/repos/${OWNER}/${REPO}/actions/runs?per_page=5`);
  if (runs.status !== 200) throw new Error('runs list failed: ' + runs.status);
  const active = (runs.json.workflow_runs || []).find((x) => x.status === 'queued' || x.status === 'in_progress');
  if (active) {
    const ageMin = (Date.now() - new Date(active.created_at).getTime()) / 60000;
    console.log(`active run ${active.id} age ${ageMin.toFixed(1)}m`);
    if (ageMin < MAX_AGE_MIN) {
      if (await health()) { console.log('fresh run + health OK, skip'); return; }
      console.log('fresh run but health DOWN, replacing...');
    } else {
      console.log('run expiring soon, starting replacement...');
    }
    const c = await gh('POST', `/repos/${OWNER}/${REPO}/actions/runs/${active.id}/cancel`);
    console.log('cancel old: ' + c.status);
  }
  const d = await gh('POST', `/repos/${OWNER}/${REPO}/actions/workflows/${wf.id}/dispatches`, { ref: 'main' });
  if (d.status !== 204) throw new Error('dispatch failed: ' + d.status + ' ' + d.text);
  console.log('dispatched, waiting for health...');
  for (let i = 1; i <= 10; i++) {
    await sleep(30000);
    if (await health()) { console.log(`health OK after ~${i * 0.5}m`); return; }
    console.log(`health retry ${i}/10...`);
  }
  throw new Error('health still down after 5m');
})().catch((e) => { console.error('KEEPER FAIL: ' + e.message); process.exit(1); });
