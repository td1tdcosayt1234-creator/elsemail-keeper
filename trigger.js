// ElseMail keeper one-shot (cron/manual) — same rules as server.js via lib.js.
'use strict';
const lib = require('./lib');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  if (!lib.GH) throw new Error('GH_TOKEN env missing');
  const online = await lib.health();
  const runs = await lib.getRuns();
  const active = lib.activeOf(runs);
  const d = lib.decide({ online, active });
  const gapName = d.gap === lib.TIGHT_INTERVAL_MIN ? '2m' : '5m';
  if (d.kind === 'skip') {
    console.log('online, valo — skip');
    return;
  }
  if (d.kind === 'wait-start') {
    console.log(`run ${active.id} just started, watching (${gapName})...`);
  } else {
    if (d.kind === 'redispatch' && active) {
      const c = await lib.gh('POST', `/repos/${lib.OWNER}/${lib.REPO}/actions/runs/${active.id}/cancel`);
      console.log('cancel old: ' + c.status);
    }
    const wfid = await lib.getWorkflowId();
    const p = await lib.gh('POST', `/repos/${lib.OWNER}/${lib.REPO}/actions/workflows/${wfid}/dispatches`, { ref: 'main' });
    if (p.status !== 204) throw new Error('dispatch failed: ' + p.status + ' ' + p.text);
    console.log((d.kind === 'replace' ? 'replacement' : 'new run') + ' dispatched, watching...');
    await lib.sendAlert(`🟡 ElseMail keeper: ${d.kind === 'replace' ? 'replacement' : 'new run'} dispatched (${gapName} watch)`);
  }
  for (let i = 1; i <= lib.CHECKS; i++) {
    await sleep(d.gap * 60000);
    if (await lib.health()) { console.log(`online after check ${i}/${lib.CHECKS}`); return; }
    console.log(`check ${i}/${lib.CHECKS}: still off...`);
  }
  await lib.sendAlert(`🔴 ElseMail FS still offline after ${lib.CHECKS} checks`);
  throw new Error(`still offline after ${lib.CHECKS} checks`);
})().catch((e) => { console.error('KEEPER FAIL: ' + e.message); process.exit(1); });
