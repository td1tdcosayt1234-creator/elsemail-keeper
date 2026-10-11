// ElseMail keeper — Railway cron (every 5 min). FS backend online ache kina
// dekhe; online thakle kichu kore na, offline thakle online kore.
//
// Flow:
//   - health OK                    -> "online, valo", exit 0
//   - health DOWN + run starting   -> wait loop (6 bar x 5 min), OK hole exit 0
//   - health DOWN + stuck/no run   -> cancel + dispatch, wait loop
//   - run boyos > MAX_AGE_MIN      -> proactive replacement dispatch (zero downtime)
//   - 6 check-eo DOWN              -> exit 1 (Railway failure alert)
//
// Env:
//   GH_TOKEN     (required) PAT with Actions read+write on elsemail-fs
//   OWNER        default td1tdcosayt1234-creator
//   REPO         default elsemail-fs
//   MAX_AGE_MIN  default 330 (5.5h) — older active run = replace
//   START_GRACE_MIN default 12 — younger run = still starting, wait
//   CHECKS       default 6  — mot koybar check
//   INTERVAL_MIN default 5  — koy min por por
//   HEALTH_URL   default https://fs.elsemail.indevs.in/health
'use strict';
const OWNER = process.env.OWNER || 'td1tdcosayt1234-creator';
const REPO = process.env.REPO || 'elsemail-fs';
const MAX_AGE_MIN = parseFloat(process.env.MAX_AGE_MIN || '330');
const START_GRACE_MIN = parseFloat(process.env.START_GRACE_MIN || '12');
const CHECKS = parseInt(process.env.CHECKS || '6', 10);
const INTERVAL_MIN = parseFloat(process.env.INTERVAL_MIN || '5');
const HEALTH_URL = process.env.HEALTH_URL || 'https://fs.elsemail.indevs.in/health';
const GH = process.env.GH_TOKEN;
if (!GH) { console.error('GH_TOKEN env missing'); process.exit(1); }
const H = { Authorization: 'Bearer ' + GH, 'User-Agent': 'elsemail-keeper', Accept: 'application/vnd.github+json' };
const gh = async (m, p, body) => {
  const r = await fetch('https://api.github.com' + p, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (_) {}
  return { status: r.status, json: j, text: t.slice(0, 200) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ageMin = (iso) => (Date.now() - new Date(iso).getTime()) / 60000;
const health = async () => {
  try {
    const r = await fetch(HEALTH_URL);
    return r.ok;
  } catch (_) { return false; }
};
const getActive = async () => {
  const runs = await gh('GET', `/repos/${OWNER}/${REPO}/actions/runs?per_page=5`);
  if (runs.status !== 200) throw new Error('runs list failed: ' + runs.status);
  const list = runs.json.workflow_runs || [];
  return list.find((x) => x.status === 'queued' || x.status === 'in_progress') || null;
};
const getWorkflowId = async () => {
  const w = await gh('GET', `/repos/${OWNER}/${REPO}/actions/workflows`);
  if (w.status !== 200) throw new Error('workflows list failed: ' + w.status);
  const wf = (w.json.workflows || []).find((x) => x.path === '.github/workflows/fs-host.yml') || (w.json.workflows || [])[0];
  if (!wf) throw new Error('no workflow found');
  return wf.id;
};
const waitOnline = async () => {
  for (let i = 1; i <= CHECKS; i++) {
    await sleep(INTERVAL_MIN * 60000);
    if (await health()) { console.log(`online after check ${i}/${CHECKS}`); return true; }
    console.log(`check ${i}/${CHECKS}: still off...`);
  }
  return false;
};
(async () => {
  if (await health()) {
    const active = await getActive();
    if (active && ageMin(active.created_at) > MAX_AGE_MIN) {
      console.log(`online but run ${active.id} expiring, proactive replacement...`);
      const wfid = await getWorkflowId();
      const d = await gh('POST', `/repos/${OWNER}/${REPO}/actions/workflows/${wfid}/dispatches`, { ref: 'main' });
      if (d.status !== 204) throw new Error('dispatch failed: ' + d.status);
      console.log('replacement dispatched');
    } else {
      console.log('online, valo — skip');
    }
    return;
  }
  console.log('OFFLINE detected');
  let active = await getActive();
  if (active && ageMin(active.created_at) < START_GRACE_MIN) {
    console.log(`run ${active.id} just started, waiting...`);
  } else {
    if (active) {
      console.log(`stuck run ${active.id}, cancelling...`);
      console.log('cancel: ' + (await gh('POST', `/repos/${OWNER}/${REPO}/actions/runs/${active.id}/cancel`)).status);
    }
    const wfid = await getWorkflowId();
    const d = await gh('POST', `/repos/${OWNER}/${REPO}/actions/workflows/${wfid}/dispatches`, { ref: 'main' });
    if (d.status !== 204) throw new Error('dispatch failed: ' + d.status + ' ' + d.text);
    console.log('new run dispatched, waiting for online...');
  }
  if (!(await waitOnline())) throw new Error(`still offline after ${CHECKS} checks`);
})().catch((e) => { console.error('KEEPER FAIL: ' + e.message); process.exit(1); });
