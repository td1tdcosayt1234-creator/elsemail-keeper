// ElseMail keeper console — persistent Railway web service.
// Every 5 min (2 min in 6h-zone/offline) ensures elsemail-fs is online,
// serves a dashboard at / for checking.
//
// Env: GH_TOKEN (required), PORT (Railway sets it), STATUS_KEY (optional:
//   if set, / and /api/status need ?key=... or header x-status-key)
//   OWNER/REPO/MAX_AGE_MIN/START_GRACE_MIN/CHECKS/INTERVAL_MIN/
//   TIGHT_INTERVAL_MIN/HEALTH_URL (same as trigger.js)
'use strict';
const http = require('http');
const OWNER = process.env.OWNER || 'td1tdcosayt1234-creator';
const REPO = process.env.REPO || 'elsemail-fs';
const PORT = parseInt(process.env.PORT || '8090', 10);
const STATUS_KEY = process.env.STATUS_KEY || '';
const MAX_AGE_MIN = parseFloat(process.env.MAX_AGE_MIN || '330');
const START_GRACE_MIN = parseFloat(process.env.START_GRACE_MIN || '12');
const CHECKS = parseInt(process.env.CHECKS || '6', 10);
const INTERVAL_MIN = parseFloat(process.env.INTERVAL_MIN || '5');
const TIGHT_INTERVAL_MIN = parseFloat(process.env.TIGHT_INTERVAL_MIN || '2');
const HEALTH_URL = process.env.HEALTH_URL || 'https://fs.elsemail.indevs.in/health';
const GH = process.env.GH_TOKEN;
if (!GH) { console.error('GH_TOKEN env missing'); process.exit(1); }
const H = { Authorization: 'Bearer ' + GH, 'User-Agent': 'elsemail-keeper', Accept: 'application/vnd.github+json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ageMin = (iso) => (Date.now() - new Date(iso).getTime()) / 60000;
const gh = async (m, p, body) => {
  const r = await fetch('https://api.github.com' + p, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (_) {}
  return { status: r.status, json: j };
};
const health = async () => {
  try { const r = await fetch(HEALTH_URL); return r.ok; } catch (_) { return false; }
};
const state = {
  started: new Date().toISOString(),
  lastCheck: null,
  online: null,
  run: null,
  action: 'boot',
  checks: 0,
  fixes: 0,
  history: [], // newest first, max 60
};
function log(action, ok, detail) {
  state.checks++;
  if (/dispatch|cancel|replace/i.test(action)) state.fixes++;
  state.history.unshift({ t: new Date().toISOString(), action, ok, detail: String(detail || '').slice(0, 200) });
  if (state.history.length > 60) state.history.pop();
}
async function ensureOnce() {
  const online = await health();
  const runs = await gh('GET', `/repos/${OWNER}/${REPO}/actions/runs?per_page=5`);
  const active = ((runs.json || {}).workflow_runs || []).find((x) => x.status === 'queued' || x.status === 'in_progress') || null;
  const age = active ? ageMin(active.created_at) : null;
  state.lastCheck = new Date().toISOString();
  state.online = online;
  state.run = active ? { id: active.id, status: active.status, ageMin: Math.round(age * 10) / 10, created: active.created_at } : null;
  const expired = age === null || age > MAX_AGE_MIN;
  const gap = expired ? TIGHT_INTERVAL_MIN : INTERVAL_MIN;
  if (online) {
    if (active && age > MAX_AGE_MIN) {
      const w = await gh('GET', `/repos/${OWNER}/${REPO}/actions/workflows`);
      const wf = ((w.json || {}).workflows || []).find((x) => x.path === '.github/workflows/fs-host.yml');
      const d = await gh('POST', `/repos/${OWNER}/${REPO}/actions/workflows/${wf.id}/dispatches`, { ref: 'main' });
      state.action = 'replaced-expiring-run';
      log('replace', d.status === 204, 'run ' + active.id + ' -> dispatch ' + d.status);
    } else {
      state.action = 'online-skip';
      log('check', true, active ? `run ${active.id} age ${age.toFixed(1)}m` : 'no active run but health OK');
    }
    return INTERVAL_MIN;
  }
  // offline
  if (active && age < START_GRACE_MIN) {
    state.action = 'run-starting';
    log('check', false, `run ${active.id} starting (${age.toFixed(1)}m), waiting`);
    return gap;
  }
  if (active) {
    const c = await gh('POST', `/repos/${OWNER}/${REPO}/actions/runs/${active.id}/cancel`);
    log('cancel', c.status === 202, 'stuck run ' + active.id);
  }
  const w = await gh('GET', `/repos/${OWNER}/${REPO}/actions/workflows`);
  const wf = ((w.json || {}).workflows || []).find((x) => x.path === '.github/workflows/fs-host.yml');
  const d = await gh('POST', `/repos/${OWNER}/${REPO}/actions/workflows/${wf.id}/dispatches`, { ref: 'main' });
  state.action = 'dispatched-new-run';
  log('dispatch', d.status === 204, 'after offline');
  return TIGHT_INTERVAL_MIN; // 6h zone/offline: 2m por por
}
async function loop() {
  try {
    const gap = await ensureOnce();
    setTimeout(loop, gap * 60000);
  } catch (e) {
    log('error', false, e.message);
    setTimeout(loop, INTERVAL_MIN * 60000);
  }
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page() {
  const dot = state.online === null ? 'gray' : state.online ? 'lime' : 'red';
  const rows = state.history.map((h) => `<tr><td>${esc(h.t.slice(11, 19))}</td><td>${esc(h.action)}</td><td>${h.ok ? '✅' : '❌'}</td><td>${esc(h.detail)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1">
<title>ElseMail Keeper</title><meta http-equiv=refresh content=60>
<style>body{font-family:Arial;background:#0f172a;color:#e2e8f0;max-width:860px;margin:auto;padding:20px}
.card{background:#1e293b;border-radius:12px;padding:16px;margin:12px 0}.dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:${dot}}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #334155;padding:6px;text-align:left}
small{color:#94a3b8}a{color:#38bdf8}</style></head><body>
<h2><span class=dot></span> ElseMail Keeper</h2>
<div class=card><b>FS backend:</b> ${state.online === null ? 'checking…' : state.online ? 'ONLINE' : 'OFFLINE'}
<small> (last check ${esc(state.lastCheck || '-')})</small><br>
<b>Run:</b> ${state.run ? `#${state.run.id} ${esc(state.run.status)} age ${state.run.ageMin}m` : 'none'}<br>
<b>Action:</b> ${esc(state.action)} | <b>checks:</b> ${state.checks} | <b>fixes:</b> ${state.fixes}<br>
<small>Health: ${esc(HEALTH_URL)} · <a href=/api/status>JSON</a></small></div>
<div class=card><b>History (newest first)</b><table><tr><th>time</th><th>action</th><th>ok</th><th>detail</th></tr>${rows || '<tr><td colspan=4>no checks yet</td></tr>'}</table></div>
</body></html>`;
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (STATUS_KEY) {
    const got = url.searchParams.get('key') || req.headers['x-status-key'];
    if (got !== STATUS_KEY) { res.writeHead(401); return res.end('need ?key='); }
  }
  if (url.pathname === '/api/status') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ...state, config: { INTERVAL_MIN, TIGHT_INTERVAL_MIN, MAX_AGE_MIN, CHECKS } }));
  }
  if (url.pathname === '/healthz') return res.end('ok');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(page());
});
server.listen(PORT, () => {
  console.log(`[keeper] console http://localhost:${PORT}`);
  loop(); // first check immediately, then self-schedules
});
