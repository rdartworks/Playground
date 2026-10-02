// Finance math helpers shared by the agents.
export const sum = (a) => a.reduce((s, x) => s + (Number(x) || 0), 0);
export const avg = (a) => (a.length ? sum(a) / a.length : 0);
export const lastN = (a, n) => a.slice(Math.max(0, a.length - n));
export const round = (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; };
export const pct = (a, b) => (b ? a / b : 0);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const groupBy = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};
export const sumBy = (rows, key, val) => {
  const out = {};
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : r[key];
    out[k] = (out[k] || 0) + (typeof val === 'function' ? val(r) : r[val]);
  }
  return out;
};
export const sortDesc = (rows, key) => [...rows].sort((a, b) => b[key] - a[key]);

export function monthAdd(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function monthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}
export function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

/** Compound monthly growth between first and last of a series. */
export function cmgr(series) {
  const a = series[0], b = series[series.length - 1];
  if (!a || a <= 0 || series.length < 2) return 0;
  return (b / a) ** (1 / (series.length - 1)) - 1;
}

export function linreg(ys) {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const mx = avg(xs), my = avg(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den ? num / den : 0;
  const intercept = my - slope * mx;
  const pred = xs.map((x) => intercept + slope * x);
  const ssRes = sum(ys.map((y, i) => (y - pred[i]) ** 2));
  const ssTot = sum(ys.map((y) => (y - my) ** 2));
  return { slope, intercept, r2: ssTot ? 1 - ssRes / ssTot : 1, predict: (x) => intercept + slope * x };
}

export function npv(rate, flows) { return sum(flows.map((f, t) => f / (1 + rate) ** t)); }
export function irr(flows) {
  let lo = -0.99, hi = 5;
  if (npv(lo, flows) * npv(hi, flows) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo, flows) * npv(mid, flows) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
export function paybackMonths(investment, monthlyBenefit) { return monthlyBenefit > 0 ? investment / monthlyBenefit : Infinity; }
export function stdev(a) { const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); }
export function percentile(a, p) {
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
/** Seeded PRNG so Monte Carlo demos are reproducible. */
export function prng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const fmtMoney = (x) => {
  const a = Math.abs(x), s = x < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};
export const fmtPct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
export function monthsBetweenKeys(a, b) {
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}
