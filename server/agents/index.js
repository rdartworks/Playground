import planning from './planning.js';
import reporting from './reporting.js';
import cash from './cash.js';
import ops from './ops.js';
import saas from './saas.js';
import strategy from './strategy.js';
import cost from './cost.js';
import risk from './risk.js';
import { AGENTS, CATEGORIES } from '../catalog.js';

export const ENGINES = { ...planning, ...reporting, ...cash, ...ops, ...saas, ...strategy, ...cost, ...risk };

for (const a of AGENTS) {
  if (!ENGINES[a.id]) throw new Error(`No engine registered for agent ${a.id}`);
}

/** Params with dynamic options/defaults resolved against the dataset. */
export function resolveParams(ds, id) {
  return (ENGINES[id].params || []).map((p) => {
    const options = typeof p.options === 'function' ? p.options(ds) : p.options;
    const def = p.default ?? (options ? options[0] : p.default);
    return { ...p, options, default: def };
  });
}

export function coerceParams(ds, id, input = {}) {
  const out = {};
  for (const p of resolveParams(ds, id)) {
    let v = input[p.key];
    if (v === undefined || v === '') v = p.default;
    if (p.type === 'number' && v !== null && v !== undefined) {
      v = Number(v);
      if (!Number.isFinite(v)) v = p.default;
      else v = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
    }
    if (p.type === 'select' && p.options && !p.options.includes(String(v))) v = p.default;
    out[p.key] = v;
  }
  return out;
}

export function runAgent(ds, id, input) {
  const engine = ENGINES[id];
  if (!engine) throw Object.assign(new Error(`Unknown agent ${id}`), { status: 404 });
  const params = coerceParams(ds, id, input);
  const t0 = performance.now();
  const output = sanitize(engine.run(ds, params));
  return { agentId: id, params, ms: Math.round(performance.now() - t0), asOf: ds.asOf, tenant: ds.company.name, output };
}

// JSON has no Infinity/NaN: show non-finite KPI values as text, null them elsewhere.
function sanitize(out) {
  for (const k of out.kpis) {
    if (typeof k.value === 'number' && !Number.isFinite(k.value)) {
      k.value = k.format === 'months' ? 'Not reached' : '—';
      k.format = 'text';
    }
  }
  return JSON.parse(JSON.stringify(out, (_, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v)));
}

export { AGENTS, CATEGORIES };
