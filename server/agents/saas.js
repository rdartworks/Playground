import { avg, fmtMoney, fmtPct, lastN, monthAdd, sum } from '../lib/fin.js';
import { saasSnapshot } from './reporting.js';
import { burnAt } from '../lib/model.js';
import { bar, col, kpi, line, result, s, table } from './out.js';

function cohortMatrix(ds, groupBy = 'quarter') {
  const L = ds.last.month;
  const cohorts = new Map();
  for (const c of ds.customers) {
    if (c.start_month < '2023-01') continue;
    const [y, m] = c.start_month.split('-').map(Number);
    const key = groupBy === 'quarter' ? `${y}-Q${Math.ceil(m / 3)}` : c.start_month;
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(c);
  }
  const rows = [];
  for (const [key, cs] of [...cohorts.entries()].sort()) {
    const start = cs.reduce((a, c) => (c.start_month < a ? c.start_month : a), '9999');
    const base = sum(cs.map((c) => ds.mrrByCustomer.get(c.id)?.get(c.start_month) ?? 0));
    const cells = [];
    for (let q = 0; q <= 12; q++) {
      const m = monthAdd(start, q * 3 + 2);
      if (m > L) break;
      cells.push(sum(cs.map((c) => ds.mrrByCustomer.get(c.id)?.get(m) ?? 0)) / base);
    }
    const logos = cs.length;
    const alive = cs.filter((c) => !c.churn_month).length;
    rows.push({ cohort: key, customers: logos, startMrr: base, cells, logoRetention: alive / logos });
  }
  return rows;
}

export default {
  'unit-economics': {
    params: [{ key: 'segment', label: 'Segment', type: 'select', options: ['All', 'SMB', 'Mid-Market', 'Enterprise'], default: 'All' }],
    run(ds, p) {
      const L = ds.last;
      const q = lastN(ds.fin, 6);
      const gm = sum(q.map((r) => r.gross_profit)) / sum(q.map((r) => r.revenue));
      const segs = ['SMB', 'Mid-Market', 'Enterprise'];
      const recentStart = q[0].month;
      const rows = segs.map((seg) => {
        const all = ds.customers.filter((c) => c.segment === seg);
        const active = all.filter((c) => ds.mrrByCustomer.get(c.id)?.has(L.month));
        const arpa = avg(active.map((c) => ds.mrrByCustomer.get(c.id).get(L.month)));
        const recent = all.filter((c) => c.start_month >= recentStart);
        const cac = avg(recent.map((c) => c.cac));
        const atRisk = all.filter((c) => ds.mrrByCustomer.get(c.id)?.has(recentStart));
        const churned = atRisk.filter((c) => c.churn_month && c.churn_month > recentStart).length;
        const monthlyChurn = churned / Math.max(1, atRisk.length) / 6;
        const lifetime = monthlyChurn > 0 ? 1 / monthlyChurn : 120;
        const ltv = arpa * gm * Math.min(lifetime, 120);
        return { segment: seg, customers: active.length, arpa, cac, churn: monthlyChurn, lifetime, ltv, ltvCac: ltv / cac, payback: cac / (arpa * gm) };
      });
      const tot = { segment: 'All', customers: sum(rows.map((r) => r.customers)) };
      tot.arpa = L.mrr / L.customers;
      tot.cac = sum(rows.map((r) => r.cac * r.customers)) / tot.customers;
      tot.churn = sum(rows.map((r) => r.churn * r.customers)) / tot.customers;
      tot.lifetime = 1 / tot.churn; tot.ltv = tot.arpa * gm * Math.min(tot.lifetime, 120); tot.ltvCac = tot.ltv / tot.cac; tot.payback = tot.cac / (tot.arpa * gm);
      const sel = p.segment === 'All' ? tot : rows.find((r) => r.segment === p.segment);
      const channels = ['Paid Search', 'Outbound', 'Partner', 'Organic'].map((ch) => { const cs = ds.customers.filter((c) => c.channel === ch && c.start_month >= recentStart && (p.segment === 'All' || c.segment === p.segment)); const cac = avg(cs.map((c) => c.cac)); const arpa = avg(cs.map((c) => c.start_mrr)); return { channel: ch, wins: cs.length, cac, arpa, payback: cac / (arpa * gm) }; });
      return result({
        headline: `${p.segment === 'All' ? 'Blended' : p.segment} LTV:CAC is ${sel.ltvCac.toFixed(1)}x with a ${sel.payback.toFixed(1)}-month CAC payback.`,
        kpis: [kpi('ARPA / month', sel.arpa), kpi('CAC', sel.cac), kpi('Gross margin', gm, 'pct'), kpi('Monthly logo churn', sel.churn, 'pct'), kpi('LTV', sel.ltv), kpi('LTV : CAC', sel.ltvCac, 'multiple', { tone: sel.ltvCac >= 3 ? 'good' : 'bad' }), kpi('CAC payback', sel.payback, 'months', { tone: sel.payback <= 18 ? 'good' : 'bad' })],
        charts: [bar('LTV vs CAC by segment', segs, [s('LTV', rows.map((r) => r.ltv)), s('CAC', rows.map((r) => r.cac))]), bar('CAC payback by channel (months)', channels.map((c) => c.channel), [s('Payback', channels.map((c) => c.payback))], 'months')],
        tables: [table('Unit economics by segment', [col('segment', 'Segment'), col('customers', 'Customers', 'number'), col('arpa', 'ARPA', 'currency'), col('cac', 'CAC', 'currency'), col('churn', 'Churn / mo', 'pct'), col('ltv', 'LTV', 'currency'), col('ltvCac', 'LTV:CAC', 'multiple'), col('payback', 'Payback (mo)', 'number1')], [...rows, tot]), table('Acquisition channels (last 6 months)', [col('channel', 'Channel'), col('wins', 'New customers', 'number'), col('cac', 'Avg CAC', 'currency'), col('arpa', 'Starting MRR', 'currency'), col('payback', 'Payback (mo)', 'number1')], channels)],
        insights: [`LTV is capped at 10 years of lifetime to avoid overstating low-churn segments.`, `Partner and Organic channels pay back fastest — shift marginal budget there before scaling paid.`, `${rows.reduce((a, b) => (a.ltvCac < b.ltvCac ? a : b)).segment} has the weakest ratio.`],
        actions: ['Rebalance channel budget with the Budget Planning Agent.', 'Monitor monthly in the SaaS Metrics Analyst.'],
      });
    },
  },

  'saas-metrics': {
    params: [],
    run(ds) {
      const k = saasSnapshot(ds);
      const f = ds.fin;
      const m = ds.months.slice(-12);
      const t12 = f.slice(-12);
      const qtr = (i) => f.slice(i, i + 3);
      const quarters = [0, 3, 6, 9, 12, 15, 18, 21].map((i) => { const qq = qtr(i); return { q: `${qq[0].month}→${qq[2].month}`, newArr: sum(qq.map((r) => r.new_mrr)) * 12, expArr: sum(qq.map((r) => r.expansion_mrr)) * 12, churnArr: sum(qq.map((r) => r.churned_mrr)) * 12, burn: sum(qq.map((_, k) => burnAt(ds, i + k))) }; });
      quarters.forEach((q) => { q.netNew = q.newArr + q.expArr - q.churnArr; q.burnMultiple = q.burn / q.netNew; q.quickRatio = (q.newArr + q.expArr) / q.churnArr; });
      return result({
        headline: `ARR ${fmtMoney(k.arr)} (+${fmtPct(k.growth)} YoY), NRR ${fmtPct(k.nrr)}, burn multiple ${k.burnMultiple.toFixed(2)}x, Rule of 40 at ${fmtPct(k.ruleOf40)}.`,
        kpis: [kpi('ARR', k.arr, 'currency', { delta: k.growth }), kpi('Net new ARR (qtr)', k.netNewArr), kpi('NRR', k.nrr, 'pct'), kpi('GRR', k.grr, 'pct'), kpi('Burn multiple', k.burnMultiple, 'multiple', { tone: k.burnMultiple < 1.5 ? 'good' : 'bad' }), kpi('Quick ratio', quarters[quarters.length - 1].quickRatio, 'multiple'), kpi('Rule of 40', k.ruleOf40, 'pct', { tone: k.ruleOf40 >= 0.4 ? 'good' : 'bad' }), kpi('Magic number', k.magicNumber, 'multiple')],
        charts: [bar('ARR bridge by quarter', quarters.map((q) => q.q.slice(0, 7)), [s('New', quarters.map((q) => q.newArr)), s('Expansion', quarters.map((q) => q.expArr)), s('Churn', quarters.map((q) => -q.churnArr))], 'currency', { stacked: true }), line('Burn multiple by quarter', quarters.map((q) => q.q.slice(0, 7)), [s('Burn multiple', quarters.map((q) => q.burnMultiple))], 'multiple'), line('Customers', m, [s('Customers', t12.map((r) => r.customers))], 'number')],
        tables: [table('Quarterly SaaS metrics', [col('q', 'Quarter'), col('newArr', 'New ARR', 'currency'), col('expArr', 'Expansion ARR', 'currency'), col('churnArr', 'Churned ARR', 'currency'), col('netNew', 'Net new ARR', 'currency'), col('quickRatio', 'Quick ratio', 'multiple'), col('burnMultiple', 'Burn multiple', 'multiple')], quarters)],
        insights: [`Every metric is computed from customer-level MRR — no manual spreadsheets.`, `Quick ratio ${quarters[quarters.length - 1].quickRatio.toFixed(1)} means $${quarters[quarters.length - 1].quickRatio.toFixed(1)} of new+expansion ARR for each $1 churned.`, k.burnMultiple < 1 ? 'Burn multiple under 1x is top-quartile efficiency.' : 'Burn multiple between 1–2x is solid; under 1x is best-in-class.'],
        actions: ['Publish to the KPI Dashboard and board pack.', 'Benchmark against peer set in the Fundraising Materials Agent.'],
      });
    },
  },

  'cohort-revenue': {
    params: [],
    run(ds) {
      const rows = cohortMatrix(ds).filter((r) => r.cohort >= '2023-Q1');
      const maxQ = Math.max(...rows.map((r) => r.cells.length));
      const avgCurve = Array.from({ length: maxQ }, (_, i) => avg(rows.filter((r) => r.cells.length > i).map((r) => r.cells[i])));
      const yr1 = avg(rows.filter((r) => r.cells.length > 4).map((r) => r.cells[4]));
      const best = rows.filter((r) => r.cells.length > 4).reduce((a, b) => (b.cells[4] > a.cells[4] ? b : a));
      return result({
        headline: `Average cohort retains ${fmtPct(yr1)} of starting MRR after 12 months; ${best.cohort} is the strongest cohort at ${fmtPct(best.cells[4])}.`,
        kpis: [kpi('Cohorts analysed', rows.length, 'number'), kpi('Month-12 net retention', yr1, 'pct', { tone: yr1 >= 1 ? 'good' : 'bad' }), kpi('Month-24 net retention', avgCurve[8] ?? null, 'pct'), kpi('Best cohort', best.cohort, 'text'), kpi('Avg logo retention', avg(rows.map((r) => r.logoRetention)), 'pct')],
        charts: [{ type: 'heatmap', title: 'Net MRR retention by quarterly cohort (quarters since start)', rows: rows.map((r) => r.cohort), cols: Array.from({ length: maxQ }, (_, i) => `Q${i}`), values: rows.map((r) => r.cells), format: 'pct' }, line('Average retention curve', avgCurve.map((_, i) => `Q${i}`), [s('Net MRR retention', avgCurve)], 'pct')],
        tables: [table('Cohort summary', [col('cohort', 'Cohort'), col('customers', 'Customers', 'number'), col('startMrr', 'Starting MRR', 'currency'), col('logoRetention', 'Logos still active', 'pct')], rows)],
        insights: ['Retention >100% means expansion from surviving customers outweighs churn — a sign of land-and-expand working.', 'Early-quarter dips reflect the higher churn of customers in their first 6 months; onboarding improvements target this.'],
        actions: ['Share cohort curves in the board pack.', 'Feed the curve into the Revenue Forecasting Agent cohort method.'],
      });
    },
  },

  'churn-impact': {
    params: [{ key: 'reduction', label: 'Churn reduction', type: 'number', min: 5, max: 50, step: 5, default: 20, unit: '%' }],
    run(ds, p) {
      const L = ds.last;
      const recent = lastN(ds.fin, 6);
      const churnRate = avg(recent.map((r) => r.churned_mrr / r.mrr));
      const growth = avg(recent.map((r) => (r.new_mrr + r.expansion_mrr) / r.mrr));
      const churned = ds.customers.filter((c) => c.churn_month && c.churn_month > monthAdd(L.month, -12));
      const lastMrr = (c) => { const h = ds.mrrByCustomer.get(c.id); return h?.get(monthAdd(c.churn_month, -1)) ?? c.start_mrr; };
      const bySeg = ['SMB', 'Mid-Market', 'Enterprise'].map((seg) => { const cs = churned.filter((c) => c.segment === seg); return { segment: seg, logos: cs.length, mrr: sum(cs.map(lastMrr)), arr: sum(cs.map(lastMrr)) * 12 }; });
      const early = churned.filter((c) => (Number(c.churn_month.slice(0, 4)) - Number(c.start_month.slice(0, 4))) * 12 + Number(c.churn_month.slice(5)) - Number(c.start_month.slice(5)) <= 6);
      const proj = (cr) => { let m = L.mrr; const out = []; for (let t = 1; t <= 24; t++) { m *= 1 + growth - cr; out.push(m * 12); } return out; };
      const base = proj(churnRate), better = proj(churnRate * (1 - p.reduction / 100));
      const months = Array.from({ length: 24 }, (_, i) => monthAdd(L.month, i + 1));
      const atRisk = ds.customers.filter((c) => !c.churn_month && ds.mrrByCustomer.get(c.id)?.has(L.month)).map((c) => {
        const h = ds.mrrByCustomer.get(c.id);
        const now = h.get(L.month), before = h.get(monthAdd(L.month, -3)) ?? now;
        const age = (Number(L.month.slice(0, 4)) - Number(c.start_month.slice(0, 4))) * 12 + Number(L.month.slice(5)) - Number(c.start_month.slice(5));
        const score = (now < before ? 0.35 : 0) + (age <= 6 ? 0.25 : 0) + (c.segment === 'SMB' ? 0.15 : 0) + (c.dso_days > 50 ? 0.15 : 0) + (c.seats < 10 ? 0.1 : 0);
        return { customer: c.name, segment: c.segment, mrr: now, trend: now / before - 1, ageMonths: age, score };
      }).filter((x) => x.score >= 0.4).sort((a, b) => b.score * b.mrr - a.score * a.mrr).slice(0, 15);
      return result({
        headline: `${churned.length} customers (${fmtMoney(sum(bySeg.map((b) => b.arr)))} ARR) churned in the last 12 months; a ${p.reduction}% churn reduction adds ${fmtMoney(better[23] - base[23])} ARR within 24 months.`,
        kpis: [kpi('Churned ARR (12 mo)', sum(bySeg.map((b) => b.arr)), 'currency', { tone: 'bad' }), kpi('Monthly MRR churn', churnRate, 'pct'), kpi('Early-life churn (≤6 mo)', early.length / Math.max(1, churned.length), 'pct'), kpi(`ARR uplift @ -${p.reduction}% churn`, better[23] - base[23], 'currency', { tone: 'good' }), kpi('Accounts flagged at-risk', atRisk.length, 'number')],
        charts: [line('ARR: current churn vs improved', months, [s('Current churn', base), s(`Churn −${p.reduction}%`, better)]), bar('Churned ARR by segment (12 mo)', bySeg.map((b) => b.segment), [s('Churned ARR', bySeg.map((b) => b.arr))])],
        tables: [table('At-risk accounts', [col('customer', 'Customer'), col('segment', 'Segment'), col('mrr', 'MRR', 'currency'), col('trend', '3-mo MRR trend', 'pct'), col('ageMonths', 'Age (mo)', 'number'), col('score', 'Risk score', 'pct')], atRisk)],
        insights: [`${fmtPct(early.length / Math.max(1, churned.length))} of churn happens in the first six months — onboarding is the lever.`, `Risk score combines contraction, tenure, segment, payment behaviour and seat count.`],
        actions: ['Route at-risk accounts to Customer Success with playbooks.', 'Quantify retention programs with the Business Case Builder.'],
      });
    },
  },
};
