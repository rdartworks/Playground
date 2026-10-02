// Zero-framework HTTP server: JSON API + static frontend.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { generate } from './seed.js';
import { loadDataset } from './lib/data.js';
import { AGENTS, CATEGORIES, resolveParams, runAgent } from './agents/index.js';
import { AGENT_BY_ID, computeRoi } from './catalog.js';
import { saasSnapshot } from './agents/reporting.js';
import { askAgent, llmEnabled } from './llm.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const PUBLIC = path.join(ROOT, 'public');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'northwind.db');

export function openDb(dbPath = DB_PATH) {
  if (!fs.existsSync(dbPath)) {
    console.log(`Seeding demo tenant at ${dbPath}…`);
    return generate(dbPath);
  }
  return new DatabaseSync(dbPath);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png' };

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) throw Object.assign(new Error('Payload too large'), { status: 413 });
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}

function usageCounts(db) {
  return Object.fromEntries(db.prepare('SELECT agent_id, COUNT(*) n FROM demo_runs GROUP BY agent_id').all().map((r) => [r.agent_id, r.n]));
}

function agentSummary(a, usage, favs) {
  return {
    id: a.id, num: a.num, name: a.name, category: a.category, categoryName: a.categoryName, maturity: a.maturity,
    tagline: a.tagline, personas: a.personas, hoursSaved: a.hoursSaved, listPrice: a.listPrice,
    integrations: a.integrations, demos: usage[a.id] || 0, favorite: favs.has(a.id), hasRoiLever: Boolean(a.roi),
  };
}

export function createApp(db) {
  const ds = () => loadDataset(db);

  const routes = [
    ['GET', /^\/api\/health$/, () => ({ ok: true })],

    ['GET', /^\/api\/meta$/, () => {
      const d = ds();
      const k = saasSnapshot(d);
      return {
        company: d.company, llm: llmEnabled(), agentCount: AGENTS.length,
        categories: Object.entries(CATEGORIES).map(([id, c]) => ({ id, ...c, count: AGENTS.filter((a) => a.category === id).length })),
        personas: [...new Set(AGENTS.flatMap((a) => a.personas))].sort(),
        snapshot: { arr: k.arr, growth: k.growth, nrr: k.nrr, cash: k.cash, customers: k.customers, headcount: k.headcount, burnMultiple: k.burnMultiple, gm: k.gm },
      };
    }],

    ['GET', /^\/api\/agents$/, (req, _m, url) => {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const cat = url.searchParams.get('category');
      const persona = url.searchParams.get('persona');
      const maturity = url.searchParams.get('maturity');
      const usage = usageCounts(db);
      const favs = new Set(db.prepare('SELECT agent_id FROM favorites').all().map((r) => r.agent_id));
      return AGENTS.filter((a) => (!cat || a.category === cat) && (!persona || a.personas.includes(persona)) && (!maturity || a.maturity === maturity)
        && (!q || [a.name, a.tagline, a.pain, a.categoryName, ...a.value, ...a.integrations, ...a.personas].join(' ').toLowerCase().includes(q)))
        .map((a) => agentSummary(a, usage, favs));
    }],

    ['GET', /^\/api\/agents\/([\w-]+)$/, (_req, m) => {
      const a = AGENT_BY_ID.get(m[1]);
      if (!a) throw Object.assign(new Error('Agent not found'), { status: 404 });
      const usage = usageCounts(db);
      const favs = new Set(db.prepare('SELECT agent_id FROM favorites').all().map((r) => r.agent_id));
      const cat = CATEGORIES[a.category];
      return {
        ...a, ...agentSummary(a, usage, favs), params: resolveParams(ds(), a.id),
        discovery: cat.discovery, objections: cat.objections, categoryBlurb: cat.blurb,
        related: AGENTS.filter((x) => x.category === a.category && x.id !== a.id).map((x) => ({ id: x.id, name: x.name, tagline: x.tagline })),
      };
    }],

    ['POST', /^\/api\/agents\/([\w-]+)\/run$/, async (req, m) => {
      const body = await readJson(req);
      const result = runAgent(ds(), m[1], body.params || {});
      db.prepare('INSERT INTO demo_runs (agent_id, ts, params, rep) VALUES (?,?,?,?)').run(m[1], new Date().toISOString(), JSON.stringify(result.params), String(body.rep || 'Unassigned').slice(0, 60));
      return result;
    }],

    ['POST', /^\/api\/agents\/([\w-]+)\/ask$/, async (req, m) => {
      const a = AGENT_BY_ID.get(m[1]);
      if (!a) throw Object.assign(new Error('Agent not found'), { status: 404 });
      const body = await readJson(req);
      const question = String(body.question || '').trim().slice(0, 1000);
      if (!question) throw Object.assign(new Error('Question is required'), { status: 400 });
      const result = runAgent(ds(), a.id, body.params || {});
      return askAgent({ agent: a, result, question });
    }],

    ['POST', /^\/api\/favorites\/([\w-]+)$/, (_req, m) => {
      if (!AGENT_BY_ID.has(m[1])) throw Object.assign(new Error('Agent not found'), { status: 404 });
      const exists = db.prepare('SELECT 1 FROM favorites WHERE agent_id = ?').get(m[1]);
      if (exists) db.prepare('DELETE FROM favorites WHERE agent_id = ?').run(m[1]);
      else db.prepare('INSERT INTO favorites VALUES (?, ?)').run(m[1], new Date().toISOString());
      return { favorite: !exists };
    }],

    ['GET', /^\/api\/company$/, () => {
      const d = ds();
      return { company: d.company, snapshot: saasSnapshot(d), financials: d.fin, debt: d.debt, capTable: d.capTable };
    }],

    ['POST', /^\/api\/roi$/, async (req) => {
      const body = await readJson(req);
      return computeRoi(Array.isArray(body.agentIds) ? body.agentIds : [], body.inputs || {});
    }],

    ['GET', /^\/api\/proposals$/, () => db.prepare('SELECT id, created, prospect, industry, rep, agent_ids, summary FROM proposals ORDER BY id DESC').all()
      .map((p) => ({ ...p, agent_ids: JSON.parse(p.agent_ids), summary: JSON.parse(p.summary) }))],

    ['GET', /^\/api\/proposals\/(\d+)$/, (_req, m) => {
      const p = db.prepare('SELECT * FROM proposals WHERE id = ?').get(Number(m[1]));
      if (!p) throw Object.assign(new Error('Proposal not found'), { status: 404 });
      const agentIds = JSON.parse(p.agent_ids);
      const inputs = JSON.parse(p.inputs);
      return { ...p, inputs, agent_ids: agentIds, summary: JSON.parse(p.summary), roi: computeRoi(agentIds, inputs), agents: agentIds.map((id) => AGENT_BY_ID.get(id)).filter(Boolean) };
    }],

    ['POST', /^\/api\/proposals$/, async (req) => {
      const body = await readJson(req);
      const prospect = String(body.prospect || '').trim().slice(0, 120);
      if (!prospect) throw Object.assign(new Error('Prospect name is required'), { status: 400 });
      const ids = (body.agentIds || []).filter((id) => AGENT_BY_ID.has(id));
      if (!ids.length) throw Object.assign(new Error('Select at least one agent'), { status: 400 });
      const roi = computeRoi(ids, body.inputs || {});
      const summary = { totalValue: roi.totalValue, totalCost: roi.totalCost, roiMultiple: roi.roiMultiple, paybackMonths: roi.paybackMonths, agents: ids.length };
      const info = db.prepare('INSERT INTO proposals (created, prospect, industry, rep, inputs, agent_ids, summary) VALUES (?,?,?,?,?,?,?)')
        .run(new Date().toISOString(), prospect, String(body.industry || '').slice(0, 80), String(body.rep || '').slice(0, 60), JSON.stringify(roi.inputs), JSON.stringify(ids), JSON.stringify(summary));
      return { id: Number(info.lastInsertRowid), summary };
    }],

    ['DELETE', /^\/api\/proposals\/(\d+)$/, (_req, m) => {
      db.prepare('DELETE FROM proposals WHERE id = ?').run(Number(m[1]));
      return { ok: true };
    }],

    ['GET', /^\/api\/analytics$/, () => {
      const byAgent = db.prepare('SELECT agent_id, COUNT(*) n FROM demo_runs GROUP BY agent_id ORDER BY n DESC').all()
        .map((r) => ({ id: r.agent_id, name: AGENT_BY_ID.get(r.agent_id)?.name ?? r.agent_id, category: AGENT_BY_ID.get(r.agent_id)?.categoryName ?? '', demos: r.n }));
      const byRep = db.prepare('SELECT rep, COUNT(*) n FROM demo_runs GROUP BY rep ORDER BY n DESC').all();
      const byWeek = db.prepare("SELECT strftime('%Y-%W', ts) wk, MIN(substr(ts,1,10)) start, COUNT(*) n FROM demo_runs GROUP BY wk ORDER BY wk").all();
      const byCategory = {};
      for (const r of byAgent) byCategory[r.category] = (byCategory[r.category] || 0) + r.demos;
      const never = AGENTS.filter((a) => !byAgent.some((r) => r.id === a.id)).map((a) => ({ id: a.id, name: a.name, category: a.categoryName }));
      const proposals = db.prepare('SELECT COUNT(*) n FROM proposals').get().n;
      const pipeline = db.prepare('SELECT summary FROM proposals').all().reduce((s, p) => s + (JSON.parse(p.summary).totalCost || 0), 0);
      return { totalDemos: byAgent.reduce((s, r) => s + r.demos, 0), byAgent, byRep, byWeek, byCategory, never, proposals, pipeline };
    }],
  ];

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        for (const [method, re, fn] of routes) {
          const m = url.pathname.match(re);
          if (m && req.method === method) return send(res, 200, await fn(req, m, url));
        }
        return send(res, 404, { error: 'Not found' });
      }
      // static files; unknown paths fall back to the SPA shell
      let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
      if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      send(res, status, { error: err.message });
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb();
  const port = Number(process.env.PORT || 3000);
  http.createServer(createApp(db)).listen(port, () => {
    console.log(`Finance Agent Catalogue running at http://localhost:${port}`);
    console.log(llmEnabled() ? `Claude copilot: enabled (${process.env.CLAUDE_MODEL || 'claude-opus-5-5'})` : 'Claude copilot: offline mode (set ANTHROPIC_API_KEY to enable)');
  });
}
