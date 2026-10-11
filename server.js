// ElseMail keeper console — persistent Railway web service (uses lib.js).
'use strict';
const http = require('http');
const lib = require('./lib');
const PORT = parseInt(process.env.PORT || '8090', 10);
const STATUS_KEY = process.env.STATUS_KEY || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = {
  started: new Date().toISOString(),
  lastCheck: null,
  online: null,
  run: null,
  runs: [],
  action: 'boot',
  checks: 0,
  fixes: 0,
  alerts: 0,
  history: [],
};
function log(action, ok, detail) {
  state.checks++;
  if (/dispatch|cancel|replace/i.test(action)) state.fixes++;
  state.history.unshift({ t: new Date().toISOString(), action, ok, detail: String(detail || '').slice(0, 200) });
  if (state.history.length > 60) state.history.pop();
}
async function alert(text) {
  const r = await lib.sendAlert(text);
  if (r.startsWith('sent')) state.alerts++;
  return r;
}
async function waitOnline(gapMin, why) {
  for (let i = 1; i <= lib.CHECKS; i++) {
    await sleep(gapMin * 60000);
    if (await lib.health()) { console.log(`online after check ${i}/${lib.CHECKS} (${why})`); return true; }
    console.log(`check ${i}/${lib.CHECKS} (${why}): still off...`);
  }
  return false;
}
async function ensureOnce() {
  const online = await lib.health();
  const runs = await lib.getRuns();
  const active = lib.activeOf(runs);
  const was = state.online;
  state.lastCheck = new Date().toISOString();
  state.online = online;
  state.runs = runs;
  state.run = active ? { id: active.id, status: active.status, ageMin: Math.round(lib.ageMin(active.created) * 10) / 10, created: active.created } : null;
  const d = lib.decide({ online, active });
  if (was === true && !online) {
    state.action = 'went-offline';
    log('offline', false, 'health DOWN');
    await alert(`🔴 ElseMail FS OFFLINE — bringing back online (fs.elsemail.indevs.in)`);
  }
  if (d.kind === 'skip') {
    state.action = 'online-skip';
    log('check', true, active ? `run ${active.id} age ${d.age.toFixed(1)}m` : 'no active run but health OK');
    return d.gap;
  }
  if (d.kind === 'wait-start') {
    state.action = 'run-starting';
    log('check', false, `run ${active.id} starting (${d.age.toFixed(1)}m), waiting`);
    if (await waitOnline(d.gap, 'starting')) { state.online = true; }
    return d.gap;
  }
  // replace (expiring) or redispatch (offline/stuck)
  if (d.kind === 'redispatch' && active) {
    const c = await lib.gh('POST', `/repos/${lib.OWNER}/${lib.REPO}/actions/runs/${active.id}/cancel`);
    log('cancel', c.status === 202, 'stuck run ' + active.id);
  }
  const wfid = await lib.getWorkflowId();
  const p = await lib.gh('POST', `/repos/${lib.OWNER}/${lib.REPO}/actions/workflows/${wfid}/dispatches`, { ref: 'main' });
  const ok = p.status === 204;
  state.action = d.kind === 'replace' ? 'replaced-expiring-run' : 'dispatched-new-run';
  log(d.kind === 'replace' ? 'replace' : 'dispatch', ok, (active ? 'run ' + active.id + ' -> ' : '') + 'dispatch ' + p.status);
  if (ok) await alert(`🟡 ElseMail FS ${d.kind === 'replace' ? 'run expiring — replacement dispatched' : 'was offline — new run dispatched'}`);
  else await alert(`🔴 ElseMail FS dispatch FAILED (${p.status})`);
  if (await waitOnline(d.gap, d.gap === lib.TIGHT_INTERVAL_MIN ? '2m watch' : '5m watch')) {
    state.online = true;
    if (!online) await alert('🟢 ElseMail FS back ONLINE');
  }
  return d.gap;
}
async function loop() {
  try {
    const gap = await ensureOnce();
    state.nextInMin = gap;
    setTimeout(loop, gap * 60000).unref();
  } catch (e) {
    log('error', false, e.message);
    await alert('🔴 Keeper error: ' + String(e.message).slice(0, 150));
    setTimeout(loop, lib.INTERVAL_MIN * 60000).unref();
  }
}
function page() {
  const dot = state.online === null ? 'gray' : state.online ? 'lime' : 'red';
  const runs = state.runs.map((r) => `<tr><td>#${r.id}</td><td>${lib.esc(r.status)}</td><td>${lib.esc(r.conclusion || '-')}</td><td>${lib.esc((r.created || '').slice(5, 16).replace('T', ' '))}</td></tr>`).join('');
  const rows = state.history.map((h) => `<tr><td>${lib.esc(h.t.slice(11, 19))}</td><td>${lib.esc(h.action)}</td><td>${h.ok ? '✅' : '❌'}</td><td>${lib.esc(h.detail)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1">
<title>ElseMail Keeper</title><meta http-equiv=refresh content=60>
<style>body{font-family:Arial;background:#0f172a;color:#e2e8f0;max-width:900px;margin:auto;padding:20px}
.card{background:#1e293b;border-radius:12px;padding:16px;margin:12px 0}.dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:${dot}}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #334155;padding:6px;text-align:left}
small{color:#94a3b8}a{color:#38bdf8}</style></head><body>
<h2><span class=dot></span> ElseMail Keeper</h2>
<div class=card><b>FS backend:</b> ${state.online === null ? 'checking…' : state.online ? 'ONLINE' : 'OFFLINE'}
<small> (last check ${lib.esc(state.lastCheck || '-')})</small><br>
<b>Run:</b> ${state.run ? `#${state.run.id} ${lib.esc(state.run.status)} age ${state.run.ageMin}m` : 'none'}<br>
<b>Action:</b> ${lib.esc(state.action)} | <b>checks:</b> ${state.checks} | <b>fixes:</b> ${state.fixes} | <b>alerts:</b> ${state.alerts}<br>
<small>Health: ${lib.esc(lib.HEALTH_URL)} · <a href=/api/status>JSON</a></small></div>
<div class=card><b>Recent runs</b><table><tr><th>run</th><th>status</th><th>result</th><th>created (UTC)</th></tr>${runs || '<tr><td colspan=4>-</td></tr>'}</table></div>
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
    return res.end(JSON.stringify({ ...state, config: { INTERVAL_MIN: lib.INTERVAL_MIN, TIGHT_INTERVAL_MIN: lib.TIGHT_INTERVAL_MIN, MAX_AGE_MIN: lib.MAX_AGE_MIN, CHECKS: lib.CHECKS } }));
  }
  if (url.pathname === '/healthz') return res.end('ok');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(page());
});
server.listen(PORT, () => {
  console.log(`[keeper] console http://localhost:${PORT}`);
  loop();
});
process.on('SIGTERM', () => { console.log('[keeper] SIGTERM, exiting'); process.exit(0); });
