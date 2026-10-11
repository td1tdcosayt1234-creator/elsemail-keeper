// ElseMail keeper shared lib — config, API helpers, pure decision logic.
'use strict';
const OWNER = process.env.OWNER || 'td1tdcosayt1234-creator';
const REPO = process.env.REPO || 'elsemail-fs';
const MAX_AGE_MIN = parseFloat(process.env.MAX_AGE_MIN || '330');
const START_GRACE_MIN = parseFloat(process.env.START_GRACE_MIN || '12');
const CHECKS = parseInt(process.env.CHECKS || '6', 10);
const INTERVAL_MIN = parseFloat(process.env.INTERVAL_MIN || '5');
const TIGHT_INTERVAL_MIN = parseFloat(process.env.TIGHT_INTERVAL_MIN || '2');
const HEALTH_URL = process.env.HEALTH_URL || 'https://fs.elsemail.indevs.in/health';
const ALERT_URL = process.env.ALERT_URL || '';
const GH = process.env.GH_TOKEN || '';

function headers() {
  return { Authorization: 'Bearer ' + GH, 'User-Agent': 'elsemail-keeper', Accept: 'application/vnd.github+json' };
}
async function gfetch(url, opts = {}, timeoutMs = 20000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}
async function gh(method, path, body) {
  const r = await gfetch('https://api.github.com' + path, {
    method, headers: headers(), body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: r.status, json, text: text.slice(0, 200) };
}
async function health(url = HEALTH_URL) {
  try {
    const r = await gfetch(url, {}, 15000);
    return r.ok;
  } catch (_) {
    return false;
  }
}
const ageMin = (iso) => (Date.now() - new Date(iso).getTime()) / 60000;
async function getRuns() {
  const r = await gh('GET', `/repos/${OWNER}/${REPO}/actions/runs?per_page=5`);
  if (r.status !== 200) throw new Error('runs list failed: ' + r.status);
  return ((r.json || {}).workflow_runs || []).map((x) => ({
    id: x.id, status: x.status, conclusion: x.conclusion,
    created: x.created_at, event: x.event,
  }));
}
const activeOf = (runs) => runs.find((x) => x.status === 'queued' || x.status === 'in_progress') || null;
async function getWorkflowId() {
  const w = await gh('GET', `/repos/${OWNER}/${REPO}/actions/workflows`);
  if (w.status !== 200) throw new Error('workflows list failed: ' + w.status);
  const wf = ((w.json || {}).workflows || []).find((x) => x.path === '.github/workflows/fs-host.yml') || ((w.json || {}).workflows || [])[0];
  if (!wf) throw new Error('no workflow found');
  return wf.id;
}
// Pure decision: same rules everywhere, unit-tested.
function decide({ online, active }) {
  const age = active ? ageMin(active.created) : null;
  if (online) {
    if (active && age > MAX_AGE_MIN) return { kind: 'replace', gap: TIGHT_INTERVAL_MIN, age };
    return { kind: 'skip', gap: INTERVAL_MIN, age };
  }
  if (active && age < START_GRACE_MIN) return { kind: 'wait-start', gap: INTERVAL_MIN, age };
  return { kind: 'redispatch', gap: TIGHT_INTERVAL_MIN, age };
}
async function sendAlert(text) {
  if (!ALERT_URL) return 'disabled';
  try {
    const r = await gfetch(ALERT_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, text }),
    }, 15000);
    return 'sent:' + r.status;
  } catch (e) {
    return 'failed:' + String((e && e.message) || e).slice(0, 80);
  }
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = {
  OWNER, REPO, MAX_AGE_MIN, START_GRACE_MIN, CHECKS, INTERVAL_MIN,
  TIGHT_INTERVAL_MIN, HEALTH_URL, ALERT_URL, GH,
  gh, health, ageMin, getRuns, activeOf, getWorkflowId, decide, sendAlert, esc,
};
