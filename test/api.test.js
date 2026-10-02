import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { generate } from '../server/seed.js';
import { resetDatasetCache } from '../server/lib/data.js';
import { createApp } from '../server/index.js';

let server, base;
before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fac-api-'));
  resetDatasetCache();
  server = http.createServer(createApp(generate(path.join(dir, 'api.db'))));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };
const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

test('meta and agent listing', async () => {
  const meta = await get('/api/meta');
  assert.equal(meta.body.agentCount, 50);
  assert.equal(meta.body.llm, false);
  const all = await get('/api/agents');
  assert.equal(all.body.length, 50);
  const filtered = await get('/api/agents?q=covenant&category=cash');
  assert.ok(filtered.body.length >= 1 && filtered.body.every((a) => a.category === 'cash'));
});

test('agent detail includes sales kit and resolved params', async () => {
  const { body } = await get('/api/agents/due-diligence');
  assert.ok(body.talkTrack && body.discovery.length && body.objections.length);
  assert.ok(body.params[0].options.length > 0 && body.params[0].default);
  assert.equal((await get('/api/agents/not-real')).status, 404);
});

test('running an agent logs a demo and shows up in analytics', async () => {
  const before = (await get('/api/analytics')).body.totalDemos;
  const run = await post('/api/agents/variance-analysis/run', { params: { threshold: 5 }, rep: 'Test Rep' });
  assert.equal(run.status, 200);
  assert.equal(run.body.params.threshold, 5);
  const a = (await get('/api/analytics')).body;
  assert.equal(a.totalDemos, before + 1);
  assert.ok(a.byRep.some((r) => r.rep === 'Test Rep'));
});

test('ask works offline with a grounded fallback', async () => {
  const r = await post('/api/agents/burn-rate-monitor/ask', { question: 'What is the net burn?' });
  assert.equal(r.body.source, 'offline');
  assert.match(r.body.answer, /burn/i);
  assert.equal((await post('/api/agents/burn-rate-monitor/ask', { question: '' })).status, 400);
});

test('proposal lifecycle', async () => {
  assert.equal((await post('/api/proposals', { prospect: '', agentIds: ['valuation'] })).status, 400);
  const created = await post('/api/proposals', { prospect: 'Acme Test', agentIds: ['valuation', 'accounts-payable', 'bogus'], inputs: { revenue: 80e6 } });
  assert.equal(created.status, 200);
  const p = await get(`/api/proposals/${created.body.id}`);
  assert.equal(p.body.prospect, 'Acme Test');
  assert.deepEqual(p.body.agent_ids, ['valuation', 'accounts-payable']);
  assert.ok(p.body.roi.totalValue > 0);
  const r = await fetch(`${base}/api/proposals/${created.body.id}`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  assert.equal((await get(`/api/proposals/${created.body.id}`)).status, 404);
});

test('favorites toggle', async () => {
  assert.equal((await post('/api/favorites/kpi-dashboard', {})).body.favorite, true);
  assert.equal((await get('/api/agents?q=KPI Dashboard')).body[0].favorite, true);
  assert.equal((await post('/api/favorites/kpi-dashboard', {})).body.favorite, false);
});

test('static frontend and path traversal guard', async () => {
  const html = await fetch(`${base}/`);
  assert.match(await html.text(), /Finance Agent Catalogue/);
  const trav = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.ok(!(await trav.text()).includes('"dependencies"'), 'must not serve files outside public/');
});
