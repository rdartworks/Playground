import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generate } from '../server/seed.js';
import { loadDataset, resetDatasetCache } from '../server/lib/data.js';
import { AGENTS, CATEGORIES, resolveParams, runAgent } from '../server/agents/index.js';
import { computeRoi } from '../server/catalog.js';

let ds;
before(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fac-'));
  resetDatasetCache();
  ds = loadDataset(generate(path.join(dir, 'test.db')));
});

function assertShape(id, out) {
  assert.equal(typeof out.headline, 'string', `${id} headline`);
  assert.ok(out.headline.length > 20, `${id} headline too short`);
  assert.ok(!/NaN|undefined|Infinity/.test(out.headline), `${id} headline has bad value: ${out.headline}`);
  assert.ok(out.kpis.length >= 1, `${id} has KPIs`);
  for (const k of out.kpis) {
    assert.ok(typeof k.value === 'string' || Number.isFinite(k.value), `${id} KPI ${k.label} is ${k.value}`);
  }
  for (const c of out.charts) assert.ok(c.type, `${id} chart type`);
  for (const t of out.tables) {
    assert.ok(Array.isArray(t.rows) && Array.isArray(t.columns), `${id} table ${t.title}`);
  }
  assert.ok(out.insights.length && out.actions.length, `${id} insights & actions`);
  const text = JSON.stringify([out.insights, out.actions]);
  assert.ok(!/NaN|undefined/.test(text), `${id} insight text has bad value`);
}

test('catalogue has exactly 50 agents across 8 categories, each with an engine', () => {
  assert.equal(AGENTS.length, 50);
  assert.deepEqual(AGENTS.map((a) => a.num), Array.from({ length: 50 }, (_, i) => i + 1));
  assert.equal(new Set(AGENTS.map((a) => a.id)).size, 50);
  assert.equal(Object.keys(CATEGORIES).length, 8);
  for (const a of AGENTS) assert.ok(CATEGORIES[a.category], a.id);
});

for (const a of AGENTS) {
  test(`${a.num}. ${a.name} runs with defaults, min and max parameters`, () => {
    assertShape(a.id, runAgent(ds, a.id, {}).output);
    const params = resolveParams(ds, a.id);
    for (const pick of ['min', 'max']) {
      const input = Object.fromEntries(params.map((p) => [p.key, p.type === 'select' ? p.options[pick === 'min' ? 0 : p.options.length - 1] : p[pick]]));
      assertShape(a.id, runAgent(ds, a.id, input).output);
    }
  });
}

test('invalid parameters are clamped, not trusted', () => {
  const r = runAgent(ds, 'runway-calculator', { hires: 9999, raise: 'abc' });
  assert.equal(r.params.hires, 10);
  assert.equal(r.params.raise, 0);
  const s = runAgent(ds, 'revenue-forecasting', { method: 'DROP TABLE' });
  assert.equal(s.params.method, 'Blend');
});

test('demo tenant financials reconcile', () => {
  for (const r of ds.fin) {
    assert.ok(Math.abs(r.revenue - (r.revenue_subscription + r.revenue_services + r.revenue_hardware)) <= 2, `${r.month} revenue lines`);
    assert.ok(Math.abs(r.gross_profit - (r.revenue - r.cogs)) <= 2, `${r.month} gross profit`);
    assert.ok(Math.abs(r.ebitda - (r.gross_profit - r.opex)) <= 2, `${r.month} ebitda`);
  }
  for (let i = 1; i < ds.fin.length; i++) assert.equal(ds.fin[i].cash_begin, ds.fin[i - 1].cash_end, `cash rollforward ${ds.fin[i].month}`);
  const opexSep = ds.opex.filter((o) => o.month === ds.last.month).reduce((s, o) => s + o.amount, 0);
  assert.ok(Math.abs(opexSep - ds.last.opex) <= 5, 'opex detail ties to P&L');
  const mrr = ds.customers.reduce((s, c) => s + (ds.mrrByCustomer.get(c.id)?.get(ds.last.month) ?? 0), 0);
  assert.ok(Math.abs(mrr - ds.last.mrr) <= 2, 'customer MRR ties to P&L subscription revenue');
});

test('accounts payable agent catches the planted duplicate bill', () => {
  const out = runAgent(ds, 'accounts-payable', {}).output;
  const exceptions = out.tables.find((t) => t.title.startsWith('Exceptions')).rows;
  assert.ok(exceptions.some((e) => e.flag === 'Possible duplicate'));
  assert.ok(exceptions.some((e) => e.flag === 'No PO, round amount'));
});

test('ROI scales with bundle size and team size', () => {
  const one = computeRoi(['accounts-payable'], {});
  assert.equal(one.discount, 0);
  assert.ok(one.totalValue > 0 && one.roiMultiple > 0);
  const many = computeRoi(AGENTS.slice(0, 10).map((a) => a.id), {});
  assert.equal(many.discount, 0.2);
  const bigTeam = computeRoi(['monthly-close'], { financeFte: 16 });
  const smallTeam = computeRoi(['monthly-close'], { financeFte: 4 });
  assert.ok(bigTeam.hoursPerMonth > smallTeam.hoursPerMonth);
  assert.deepEqual(computeRoi(['nope'], {}).lines, []);
});
