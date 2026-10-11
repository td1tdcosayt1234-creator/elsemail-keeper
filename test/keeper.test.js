// Keeper unit tests (pure logic, no network). Run: npm test
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../lib');

test('decide: online + fresh run -> skip', () => {
  const d = lib.decide({ online: true, active: { id: 1, created: new Date(Date.now() - 60 * 60000).toISOString() } });
  assert.equal(d.kind, 'skip');
  assert.equal(d.gap, lib.INTERVAL_MIN);
});

test('decide: online + expiring run -> replace (tight)', () => {
  const d = lib.decide({ online: true, active: { id: 1, created: new Date(Date.now() - 400 * 60000).toISOString() } });
  assert.equal(d.kind, 'replace');
  assert.equal(d.gap, lib.TIGHT_INTERVAL_MIN);
});

test('decide: online + no run -> skip', () => {
  const d = lib.decide({ online: true, active: null });
  assert.equal(d.kind, 'skip');
});

test('decide: offline + starting run -> wait-start', () => {
  const d = lib.decide({ online: false, active: { id: 1, created: new Date(Date.now() - 3 * 60000).toISOString() } });
  assert.equal(d.kind, 'wait-start');
});

test('decide: offline + stuck run -> redispatch (tight)', () => {
  const d = lib.decide({ online: false, active: { id: 1, created: new Date(Date.now() - 60 * 60000).toISOString() } });
  assert.equal(d.kind, 'redispatch');
  assert.equal(d.gap, lib.TIGHT_INTERVAL_MIN);
});

test('decide: offline + no run -> redispatch', () => {
  const d = lib.decide({ online: false, active: null });
  assert.equal(d.kind, 'redispatch');
});

test('activeOf picks queued/in_progress newest-first', () => {
  const now = new Date().toISOString();
  const runs = [
    { id: 3, status: 'completed', created: now },
    { id: 2, status: 'queued', created: now },
    { id: 1, status: 'in_progress', created: now },
  ];
  assert.equal(lib.activeOf(runs).id, 2);
  assert.equal(lib.activeOf([{ id: 9, status: 'completed', created: now }]), null);
});

test('esc neutralizes html', () => {
  assert.equal(lib.esc('<b>"x"&'), '&lt;b&gt;&quot;x&quot;&amp;');
});
