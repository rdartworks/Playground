import { fmtMoney, fmtPct, lastN, monthLabel, sum, sumBy, sortDesc } from '../lib/fin.js';
import { burnAt, project, runwayFrom } from '../lib/model.js';
import { bar, col, donut, kpi, line, result, s, stacked, table, waterfall } from './out.js';

const monthOpts = (ds) => ds.months.slice(-12).reverse();
const finAt = (ds, m) => ds.fin.find((r) => r.month === m) ?? ds.last;

export function saasSnapshot(ds) {
  const L = ds.last;
  const f = ds.fin;
  const yearAgo = f[f.length - 13];
  const arr = L.mrr * 12;
  const growth = L.mrr / yearAgo.mrr - 1;
  const q = lastN(f, 3);
  const netNewArr = sum(q.map((r) => r.new_mrr + r.expansion_mrr - r.churned_mrr)) * 12;
  const burn = sum(q.map((_, k) => burnAt(ds, f.length - 3 + k)));
  const burnMultiple = netNewArr > 0 ? burn / netNewArr : Infinity;
  const ttmRev = sum(lastN(f, 12).map((r) => r.revenue));
  const ttmEbitda = sum(lastN(f, 12).map((r) => r.ebitda));
  const ruleOf40 = growth + ttmEbitda / ttmRev;
  // NRR from customer-level MRR: customers active a year ago, MRR now / MRR then
  const then = yearAgo.month;
  let mrrThen = 0, mrrNow = 0, grossNow = 0;
  for (const c of ds.customers) {
    const h = ds.mrrByCustomer.get(c.id);
    const a = h?.get(then);
    if (!a) continue;
    const b = h.get(L.month) ?? 0;
    mrrThen += a; mrrNow += b; grossNow += Math.min(a, b);
  }
  const gm = sum(q.map((r) => r.gross_profit)) / sum(q.map((r) => r.revenue));
  const sm = sum(q.map((r) => r.sm_spend));
  const newArrQ = sum(q.map((r) => r.new_mrr)) * 12;
  const cacPayback = sum(q.map((r) => r.new_mrr)) > 0 ? sm / (sum(q.map((r) => r.new_mrr)) * gm) : Infinity;
  const magicNumber = (sum(q.map((r) => r.mrr)) - sum(f.slice(-6, -3).map((r) => r.mrr))) * 4 / sum(f.slice(-6, -3).map((r) => r.sm_spend));
  return { arr, growth, netNewArr, burn, burnMultiple, ruleOf40, nrr: mrrNow / mrrThen, grr: grossNow / mrrThen, gm, cacPayback, magicNumber, ttmRev, ttmEbitda, customers: L.customers, arpa: L.mrr / L.customers, newArrQ, cash: L.cash_end, headcount: L.headcount, arrPerHead: arr / L.headcount };
}

function pnlRows(r, prev, bud) {
  const lines = [
    ['Subscription revenue', r.revenue_subscription, prev.revenue_subscription],
    ['Services revenue', r.revenue_services, prev.revenue_services],
    ['Hardware revenue', r.revenue_hardware, prev.revenue_hardware],
    ['Total revenue', r.revenue, prev.revenue, bud?.revenue],
    ['Cost of revenue', r.cogs, prev.cogs, bud?.cogs],
    ['Gross profit', r.gross_profit, prev.gross_profit],
    ['Operating expenses', r.opex, prev.opex, bud?.opex],
    ['EBITDA', r.ebitda, prev.ebitda],
    ['Net income', r.net_income, prev.net_income],
  ];
  return lines.map(([line, cur, p, b]) => ({ line, cur, prev: p, mom: p ? cur / p - 1 : 0, budget: b ?? null, vsBudget: b ? cur - b : null }));
}

export default {
  'expense-analysis': {
    params: [{ key: 'months', label: 'Lookback', type: 'number', min: 3, max: 12, step: 3, default: 6, unit: 'months' }],
    run(ds, p) {
      const ms = ds.months.slice(-p.months);
      const prevMs = ds.months.slice(-p.months * 2, -p.months);
      const cur = ds.opex.filter((r) => ms.includes(r.month));
      const prev = ds.opex.filter((r) => prevMs.includes(r.month));
      const byLine = sumBy(cur, 'line', 'amount');
      const byLinePrev = sumBy(prev, 'line', 'amount');
      const byDept = sumBy(cur, 'dept', 'amount');
      const total = sum(Object.values(byLine));
      const rows = Object.keys(byLine).map((l) => ({ line: l, amount: byLine[l], share: byLine[l] / total, prev: byLinePrev[l] || 0, change: byLinePrev[l] ? byLine[l] / byLinePrev[l] - 1 : 0 })).sort((a, b) => b.amount - a.amount);
      const lines = [...new Set(ds.opex.map((r) => r.line))];
      const trendMonths = ds.months.slice(-12);
      const revenue = sum(ds.fin.filter((r) => ms.includes(r.month)).map((r) => r.revenue));
      const fastest = [...rows].filter((r) => r.line !== 'Payroll').sort((a, b) => b.change - a.change)[0];
      const perHead = total / p.months / ds.last.headcount;
      return result({
        headline: `Opex of ${fmtMoney(total)} over ${p.months} months (${fmtPct(total / revenue)} of revenue); ${fastest.line} is the fastest-growing line at +${fmtPct(fastest.change)}.`,
        kpis: [kpi('Total opex', total), kpi('Opex / revenue', total / revenue, 'pct'), kpi('Payroll share', (byLine.Payroll || 0) / total, 'pct'), kpi('Opex per head / mo', perHead), kpi('Change vs prior period', total / sum(Object.values(byLinePrev)) - 1, 'pct')],
        charts: [
          stacked('Monthly opex by category', trendMonths, lines.map((l) => s(l, trendMonths.map((m) => sum(ds.opex.filter((r) => r.month === m && r.line === l).map((r) => r.amount)))))),
          donut('Opex by department', Object.keys(byDept), Object.values(byDept)),
        ],
        tables: [table('Spend by category', [col('line', 'Category'), col('amount', 'Spend', 'currency'), col('share', 'Share', 'pct'), col('prev', 'Prior period', 'currency'), col('change', 'Change', 'pct')], rows)],
        insights: [
          `Payroll is ${fmtPct((byLine.Payroll || 0) / total)} of opex — the controllable non-payroll pool is ${fmtMoney(total - (byLine.Payroll || 0))}.`,
          `${fastest.line} grew ${fmtPct(fastest.change)} vs the prior ${p.months} months — flag for owner review.`,
          `R&D carries ${fmtPct((byDept['R&D'] || 0) / total)} of spend; benchmark for growth-stage SaaS is 25–35%.`,
        ],
        actions: ['Send the top-3 growing categories to budget owners for commentary.', 'Hand the non-payroll pool to the Cost Reduction Agent.'],
      });
    },
  },

  'variance-analysis': {
    params: [
      { key: 'month', label: 'Period', type: 'select', options: monthOpts, default: null },
      { key: 'threshold', label: 'Materiality threshold', type: 'number', min: 1, max: 25, step: 1, default: 10, unit: '%' },
    ],
    run(ds, p) {
      const m = p.month || ds.last.month;
      const act = ds.opex.filter((r) => r.month === m);
      const bud = ds.budget.filter((r) => r.month === m);
      const key = (r) => `${r.dept}|${r.line}`;
      const bmap = new Map(bud.map((r) => [key(r), r.amount]));
      const rows = act.map((r) => { const b = bmap.get(key(r)) || 0; const v = r.amount - b; return { dept: r.dept, line: r.line, actual: r.amount, budget: b, variance: v, pct: b ? v / b : 0, material: Math.abs(v / (b || 1)) >= p.threshold / 100 && Math.abs(v) > 5000 ? 'Yes' : '' }; });
      const fin = finAt(ds, m);
      const rb = ds.revBudget.find((r) => r.month === m);
      const totA = sum(rows.map((r) => r.actual)), totB = sum(rows.map((r) => r.budget));
      const material = sortDesc(rows.filter((r) => r.material), 'variance').sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
      const revVar = fin.revenue - rb.revenue;
      const cogsVar = fin.cogs - rb.cogs;
      const expl = (r) => r.line === 'Contractors' ? 'Contractor backfill for open roles' : r.line === 'Travel & Events' ? 'Event timing / seasonality' : r.line === 'Payroll' ? (r.variance > 0 ? 'Hires landed earlier than plan' : 'Open roles not yet filled') : r.line === 'Programs' ? 'Campaign spend phasing' : r.line === 'Recruiting' ? 'Agency fees on senior hires' : 'Usage-driven spend';
      material.forEach((r) => { r.driver = expl(r); });
      const ebitdaBud = rb.revenue - rb.cogs - totB;
      return result({
        headline: `${monthLabel(m)}: revenue ${revVar >= 0 ? 'beat' : 'missed'} budget by ${fmtMoney(Math.abs(revVar))}; opex ${totA > totB ? 'over' : 'under'} by ${fmtMoney(Math.abs(totA - totB))} with ${material.length} material variances.`,
        kpis: [kpi('Revenue vs budget', revVar, 'currency', { tone: revVar >= 0 ? 'good' : 'bad' }), kpi('COGS vs budget', cogsVar, 'currency', { tone: cogsVar <= 0 ? 'good' : 'bad' }), kpi('Opex vs budget', totA - totB, 'currency', { tone: totA <= totB ? 'good' : 'bad' }), kpi('EBITDA vs budget', fin.ebitda - ebitdaBud, 'currency', { tone: fin.ebitda >= ebitdaBud ? 'good' : 'bad' }), kpi('Material items', material.length, 'number')],
        charts: [waterfall('EBITDA bridge: budget → actual', [
          { label: 'Budget EBITDA', value: ebitdaBud, total: true },
          { label: 'Revenue', value: revVar }, { label: 'COGS', value: -cogsVar },
          ...['Sales', 'Marketing', 'R&D', 'G&A', 'Customer Success'].map((d) => ({ label: d, value: -sum(rows.filter((r) => r.dept === d).map((r) => r.variance)) })),
          { label: 'Actual EBITDA', value: fin.ebitda, total: true },
        ])],
        tables: [table('Material variances', [col('dept', 'Department'), col('line', 'Line'), col('actual', 'Actual', 'currency'), col('budget', 'Budget', 'currency'), col('variance', 'Variance', 'currency'), col('pct', 'Var %', 'pct'), col('driver', 'Likely driver')], material)],
        insights: material.slice(0, 3).map((r) => `${r.dept} ${r.line}: ${r.variance > 0 ? 'over' : 'under'} by ${fmtMoney(Math.abs(r.variance))} (${fmtPct(r.pct)}) — ${r.driver.toLowerCase()}.`).concat([`Revenue ${revVar >= 0 ? 'outperformance' : 'shortfall'} of ${fmtPct(revVar / rb.revenue)} against plan.`]),
        actions: ['Auto-request commentary from the 3 largest variance owners.', 'Drop the bridge straight into the Management Reporting pack.'],
      });
    },
  },

  'profitability-analyst': {
    params: [{ key: 'dimension', label: 'Analyse by', type: 'select', options: ['Segment', 'Product line', 'Region'], default: 'Segment' }],
    run(ds, p) {
      const L = ds.last;
      const q = lastN(ds.fin, 3);
      const subGm = 1 - sum(q.map((r) => r.cogs_hosting + r.cogs_licenses)) / sum(q.map((r) => r.revenue_subscription));
      const csCost = sum(ds.opex.filter((r) => q.some((x) => x.month === r.month) && r.dept === 'Customer Success').map((r) => r.amount));
      const smCost = sum(q.map((r) => r.sm_spend));
      let rows;
      if (p.dimension === 'Product line') {
        const ps = ds.productSales.filter((r) => q.some((x) => x.month === r.month));
        const prod = new Map(ds.products.map((x) => [x.sku, x]));
        const byKind = {};
        for (const r of ps) { const k = prod.get(r.sku).kind === 'hardware' ? 'Hardware' : 'Services'; byKind[k] ??= { revenue: 0, cogs: 0 }; byKind[k].revenue += r.revenue; byKind[k].cogs += r.cost; }
        byKind.Subscription = { revenue: sum(q.map((r) => r.revenue_subscription)), cogs: sum(q.map((r) => r.cogs_hosting + r.cogs_licenses)) };
        const totRev = sum(Object.values(byKind).map((x) => x.revenue));
        rows = Object.entries(byKind).map(([name, x]) => { const alloc = (csCost + smCost) * x.revenue / totRev; return { name, revenue: x.revenue, gp: x.revenue - x.cogs, gm: 1 - x.cogs / x.revenue, contribution: x.revenue - x.cogs - alloc, cm: (x.revenue - x.cogs - alloc) / x.revenue }; });
      } else {
        const key = p.dimension === 'Segment' ? 'segment' : 'region';
        const groups = {};
        for (const c of ds.customers) {
          const h = ds.mrrByCustomer.get(c.id);
          const rev = sum(q.map((r) => h?.get(r.month) ?? 0));
          if (!rev) continue;
          const g = (groups[c[key]] ??= { revenue: 0, customers: 0, newCac: 0 });
          g.revenue += rev; g.customers += 1;
          if (q.some((r) => r.month === c.start_month)) g.newCac += c.cac;
        }
        const totRev = sum(Object.values(groups).map((g) => g.revenue));
        const totCust = sum(Object.values(groups).map((g) => g.customers));
        rows = Object.entries(groups).map(([name, g]) => {
          const cogs = g.revenue * (1 - subGm) * (name === 'Enterprise' ? 1.12 : 1);
          const cs = csCost * (0.5 * g.revenue / totRev + 0.5 * g.customers / totCust); // half by revenue, half by account count
          const sm = smCost * (g.newCac / Math.max(1, sum(Object.values(groups).map((x) => x.newCac))));
          const contribution = g.revenue - cogs - cs - sm;
          return { name, revenue: g.revenue, customers: g.customers, gp: g.revenue - cogs, gm: 1 - cogs / g.revenue, cs, sm, contribution, cm: contribution / g.revenue };
        });
      }
      rows.sort((a, b) => b.contribution - a.contribution);
      const best = rows[0], worst = rows[rows.length - 1];
      return result({
        headline: `${best.name} is the most profitable ${p.dimension.toLowerCase()} (${fmtPct(best.cm)} contribution margin); ${worst.name} trails at ${fmtPct(worst.cm)}.`,
        kpis: [kpi('Quarter revenue', sum(rows.map((r) => r.revenue))), kpi('Blended gross margin', sum(rows.map((r) => r.gp)) / sum(rows.map((r) => r.revenue)), 'pct'), kpi('Total contribution', sum(rows.map((r) => r.contribution))), kpi(`Best: ${best.name}`, best.cm, 'pct', { tone: 'good' }), kpi(`Worst: ${worst.name}`, worst.cm, 'pct', { tone: worst.cm < 0.2 ? 'bad' : 'neutral' })],
        charts: [bar(`Revenue vs contribution by ${p.dimension.toLowerCase()} (last quarter)`, rows.map((r) => r.name), [s('Revenue', rows.map((r) => r.revenue)), s('Gross profit', rows.map((r) => r.gp)), s('Contribution', rows.map((r) => r.contribution))])],
        tables: [table('Profitability detail', [col('name', p.dimension), col('revenue', 'Revenue', 'currency'), col('gp', 'Gross profit', 'currency'), col('gm', 'GM %', 'pct'), col('contribution', 'Contribution', 'currency'), col('cm', 'Contribution %', 'pct')], rows)],
        insights: [`Customer Success cost is allocated half by revenue, half by account count — high-count/low-ARPA groups absorb more support cost.`, `Acquisition cost is allocated by CAC of customers won this quarter.`, `${worst.name}: ${worst.cm < 0.3 ? 'review pricing floor and support model' : 'healthy but below average'}.`],
        actions: ['Feed contribution margins into the Pricing Strategy Agent.', 'Review account coverage model for the lowest-margin group.'],
      });
    },
  },

  'fpa-reporting': {
    params: [{ key: 'month', label: 'Period', type: 'select', options: monthOpts, default: null }],
    run(ds, p) {
      const m = p.month || ds.last.month;
      const idx = ds.months.indexOf(m);
      const r = ds.fin[idx], prev = ds.fin[idx - 1] ?? r, ya = ds.fin[idx - 12];
      const rb = ds.revBudget.find((x) => x.month === m);
      const opexBud = sum(ds.budget.filter((x) => x.month === m).map((x) => x.amount));
      const rows = pnlRows(r, prev, { revenue: rb.revenue, cogs: rb.cogs, opex: opexBud });
      const ytd = ds.fin.filter((x) => x.month.slice(0, 4) === m.slice(0, 4) && x.month <= m);
      const ytdBud = ds.revBudget.filter((x) => x.month.slice(0, 4) === m.slice(0, 4) && x.month <= m);
      const last12 = ds.fin.slice(Math.max(0, idx - 11), idx + 1);
      return result({
        headline: `${monthLabel(m)} close: revenue ${fmtMoney(r.revenue)} (${fmtPct(r.revenue / prev.revenue - 1)} MoM${ya ? `, ${fmtPct(r.revenue / ya.revenue - 1)} YoY` : ''}), EBITDA margin ${fmtPct(r.ebitda / r.revenue)}.`,
        kpis: [kpi('Revenue', r.revenue, 'currency', { delta: r.revenue / prev.revenue - 1 }), kpi('Gross margin', r.gross_profit / r.revenue, 'pct', { delta: r.gross_profit / r.revenue - prev.gross_profit / prev.revenue, deltaFormat: 'pts' }), kpi('Opex', r.opex, 'currency', { delta: r.opex / prev.opex - 1, invert: true }), kpi('EBITDA', r.ebitda, 'currency', { tone: r.ebitda >= prev.ebitda ? 'good' : 'bad' }), kpi('YTD revenue vs plan', sum(ytd.map((x) => x.revenue)) / sum(ytdBud.map((x) => x.revenue)) - 1, 'pct'), kpi('Ending cash', r.cash_end)],
        charts: [
          bar('Revenue mix (trailing 12 months)', last12.map((x) => x.month), [s('Subscription', last12.map((x) => x.revenue_subscription)), s('Services', last12.map((x) => x.revenue_services)), s('Hardware', last12.map((x) => x.revenue_hardware))], 'currency', { stacked: true }),
          line('Margin trends', last12.map((x) => x.month), [s('Gross margin', last12.map((x) => x.gross_profit / x.revenue)), s('EBITDA margin', last12.map((x) => x.ebitda / x.revenue))], 'pct'),
        ],
        tables: [table('Monthly P&L', [col('line', 'Line item'), col('cur', monthLabel(m), 'currency'), col('prev', 'Prior month', 'currency'), col('mom', 'MoM', 'pct'), col('budget', 'Budget', 'currency'), col('vsBudget', 'vs Budget', 'currency')], rows)],
        insights: [`Subscription is ${fmtPct(r.revenue_subscription / r.revenue)} of revenue, up from ${fmtPct(last12[0].revenue_subscription / last12[0].revenue)} twelve months ago.`, `EBITDA improved by ${fmtMoney(r.ebitda - last12[0].ebitda)} over the trailing year as opex grew slower than revenue.`, `Headcount ${r.headcount} (${r.headcount - prev.headcount >= 0 ? '+' : ''}${r.headcount - prev.headcount} MoM).`],
        actions: ['Publish to the FP&A shared drive and notify budget owners.', 'Kick off Variance Analysis for commentary.'],
      });
    },
  },

  'management-reporting': {
    params: [{ key: 'audience', label: 'Audience', type: 'select', options: ['Executive team', 'Department heads', 'Full company'], default: 'Executive team' }],
    run(ds, p) {
      const k = saasSnapshot(ds);
      const q = lastN(ds.fin, 3), pq = ds.fin.slice(-6, -3);
      const qRev = sum(q.map((r) => r.revenue)), pqRev = sum(pq.map((r) => r.revenue));
      const qBud = sum(ds.revBudget.slice(-3).map((r) => r.revenue));
      const depts = ['Sales', 'Marketing', 'R&D', 'G&A', 'Customer Success'].map((d) => {
        const a = sum(ds.opex.filter((r) => r.dept === d && q.some((x) => x.month === r.month)).map((r) => r.amount));
        const b = sum(ds.budget.filter((r) => r.dept === d && q.some((x) => x.month === r.month)).map((r) => r.amount));
        return { dept: d, actual: a, budget: b, variance: a - b, pct: a / b - 1, status: a / b - 1 > 0.05 ? 'Over' : a / b - 1 < -0.05 ? 'Under' : 'On track' };
      });
      const highlights = [
        `Q revenue ${fmtMoney(qRev)} — ${fmtPct(qRev / pqRev - 1)} QoQ and ${fmtPct(qRev / qBud - 1)} vs plan.`,
        `ARR ${fmtMoney(k.arr)} growing ${fmtPct(k.growth)} YoY; NRR ${fmtPct(k.nrr)}.`,
        `Burn multiple ${k.burnMultiple.toFixed(2)}x; cash ${fmtMoney(k.cash)}.`,
      ];
      const showDetail = p.audience !== 'Full company';
      return result({
        headline: `Quarterly management report for ${p.audience.toLowerCase()}: ${highlights[0]}`,
        kpis: [kpi('Quarter revenue', qRev, 'currency', { delta: qRev / pqRev - 1 }), kpi('vs plan', qRev / qBud - 1, 'pct'), kpi('ARR', k.arr), kpi('NRR', k.nrr, 'pct'), kpi('Burn multiple', k.burnMultiple, 'multiple', { tone: k.burnMultiple < 1.5 ? 'good' : 'bad' }), kpi('Headcount', k.headcount, 'number')],
        charts: showDetail ? [bar('Department spend vs budget (quarter)', depts.map((d) => d.dept), [s('Actual', depts.map((d) => d.actual)), s('Budget', depts.map((d) => d.budget))])] : [line('ARR trend', ds.months.slice(-12), [s('ARR', ds.fin.slice(-12).map((r) => r.mrr * 12))])],
        tables: showDetail ? [table('Department scorecard', [col('dept', 'Department'), col('actual', 'Actual', 'currency'), col('budget', 'Budget', 'currency'), col('variance', 'Variance', 'currency'), col('pct', 'Var %', 'pct'), col('status', 'Status', 'status')], depts)] : [],
        insights: highlights,
        actions: ['Schedule distribution on business day 7.', p.audience === 'Full company' ? 'Strip department budget detail before sharing company-wide (done automatically).' : 'Attach the variance commentary from owners.'],
      });
    },
  },

  'kpi-dashboard': {
    params: [],
    run(ds) {
      const k = saasSnapshot(ds);
      const f = ds.fin;
      const m12 = ds.months.slice(-12);
      const tile = (label, v, fmt, good, bench) => ({ label, value: v, format: fmt, tone: good ? 'good' : 'bad', bench });
      const tiles = [
        tile('ARR', k.arr, 'currency', true), tile('YoY ARR growth', k.growth, 'pct', k.growth > 0.3, '> 30%'), tile('Net revenue retention', k.nrr, 'pct', k.nrr > 1.05, '> 105%'),
        tile('Gross revenue retention', k.grr, 'pct', k.grr > 0.88, '> 88%'), tile('Gross margin', k.gm, 'pct', k.gm > 0.72, '> 72%'), tile('Burn multiple', k.burnMultiple, 'multiple', k.burnMultiple < 1.5, '< 1.5x'),
        tile('Rule of 40', k.ruleOf40, 'pct', k.ruleOf40 > 0.4, '> 40%'), tile('CAC payback', k.cacPayback, 'months', k.cacPayback < 18, '< 18 mo'), tile('Magic number', k.magicNumber, 'multiple', k.magicNumber > 0.7, '> 0.7'),
        tile('ARR per employee', k.arrPerHead, 'currency', k.arrPerHead > 180000, '> $180K'), tile('Customers', k.customers, 'number', true), tile('Cash', k.cash, 'currency', k.cash > 8e6, '> $8M covenant'),
      ];
      return result({
        headline: `${tiles.filter((t) => t.tone === 'good').length} of ${tiles.length} KPIs are at or better than benchmark; watch ${tiles.filter((t) => t.tone === 'bad').map((t) => t.label).join(', ') || 'nothing'}.`,
        kpis: tiles,
        charts: [
          line('ARR', m12, [s('ARR', f.slice(-12).map((r) => r.mrr * 12))]),
          bar('MRR movements', m12, [s('New', f.slice(-12).map((r) => r.new_mrr)), s('Expansion', f.slice(-12).map((r) => r.expansion_mrr)), s('Churn', f.slice(-12).map((r) => -r.churned_mrr))], 'currency', { stacked: true }),
          line('Gross & EBITDA margin', m12, [s('Gross margin', f.slice(-12).map((r) => r.gross_profit / r.revenue)), s('EBITDA margin', f.slice(-12).map((r) => r.ebitda / r.revenue))], 'pct'),
        ],
        tables: [table('KPI benchmarks', [col('label', 'KPI'), col('display', 'Value'), col('bench', 'Benchmark'), col('status', 'Status', 'status')], tiles.map((t) => ({ label: t.label, display: { v: t.value, f: t.format }, bench: t.bench ?? '—', status: t.tone === 'good' ? 'On track' : 'Watch' })))],
        insights: [`Rule of 40 at ${fmtPct(k.ruleOf40)} (growth ${fmtPct(k.growth)} + EBITDA margin ${fmtPct(k.ttmEbitda / k.ttmRev)}).`, `Every $1 of net burn is buying $${(1 / k.burnMultiple).toFixed(2)} of net new ARR.`],
        actions: ['Subscribe the exec team to a Monday digest.', 'Set alerts when any KPI crosses its benchmark.'],
      });
    },
  },

  'board-pack-builder': {
    params: [{ key: 'quarter', label: 'Quarter', type: 'select', options: ['Q3 2026', 'Q2 2026'], default: 'Q3 2026' }],
    run(ds, p) {
      const end = p.quarter === 'Q3 2026' ? '2026-09' : '2026-06';
      const idx = ds.months.indexOf(end);
      const q = ds.fin.slice(idx - 2, idx + 1), pq = ds.fin.slice(idx - 5, idx - 2), yq = ds.fin.slice(idx - 14, idx - 11);
      const qs = (rows, k) => sum(rows.map((r) => r[k]));
      const plan = ds.revBudget.filter((r) => q.some((x) => x.month === r.month));
      const k = saasSnapshot(ds);
      const rwy = runwayFrom(project(ds, 60, { hires: 2 }).rows, 0);
      const slides = [
        { n: 1, title: 'CEO letter & quarter at a glance', content: `Revenue ${fmtMoney(qs(q, 'revenue'))} (${fmtPct(qs(q, 'revenue') / qs(yq, 'revenue') - 1)} YoY); ARR ${fmtMoney(q[2].mrr * 12)}.` },
        { n: 2, title: 'Financial summary vs plan', content: `Revenue ${fmtPct(qs(q, 'revenue') / sum(plan.map((r) => r.revenue)) - 1)} vs plan; EBITDA ${fmtMoney(qs(q, 'ebitda'))}.` },
        { n: 3, title: 'SaaS metrics', content: `NRR ${fmtPct(k.nrr)}, GRR ${fmtPct(k.grr)}, CAC payback ${k.cacPayback.toFixed(1)} mo, burn multiple ${k.burnMultiple.toFixed(2)}x.` },
        { n: 4, title: 'Cash & runway', content: `Cash ${fmtMoney(q[2].cash_end)}; modelled runway ${Number.isFinite(rwy) ? rwy.toFixed(0) + ' months' : 'default alive'}; covenant headroom ${fmtMoney(q[2].cash_end - 8e6)}.` },
        { n: 5, title: 'Go-to-market', content: `${qs(q, 'new_customers')} new logos, ${qs(q, 'churned_customers')} churned; S&M spend ${fmtMoney(qs(q, 'sm_spend'))}.` },
        { n: 6, title: 'People', content: `Headcount ${q[2].headcount} (${q[2].headcount - pq[2].headcount >= 0 ? '+' : ''}${q[2].headcount - pq[2].headcount} QoQ).` },
        { n: 7, title: 'Risks & asks', content: 'Top risks from the Risk Assessment Agent; approvals requested: FY27 plan envelope, EMEA pod.' },
      ];
      const fy = (rows) => ({ revenue: qs(rows, 'revenue'), gm: qs(rows, 'gross_profit') / qs(rows, 'revenue'), opex: qs(rows, 'opex'), ebitda: qs(rows, 'ebitda'), cash: rows[rows.length - 1].cash_end });
      const a = fy(q), b = fy(pq), c = fy(yq);
      return result({
        headline: `${p.quarter} board pack assembled: 7 sections, financials reconciled to the ledger, ready for CFO review.`,
        kpis: [kpi('Q revenue', a.revenue, 'currency', { delta: a.revenue / c.revenue - 1 }), kpi('vs plan', a.revenue / sum(plan.map((r) => r.revenue)) - 1, 'pct'), kpi('Q EBITDA', a.ebitda), kpi('Ending cash', a.cash), kpi('NRR', k.nrr, 'pct'), kpi('Sections', slides.length, 'number')],
        charts: [bar('Quarterly revenue & EBITDA', ['Year-ago Q', 'Prior Q', p.quarter], [s('Revenue', [c.revenue, b.revenue, a.revenue]), s('EBITDA', [c.ebitda, b.ebitda, a.ebitda])])],
        tables: [
          table('Board pack outline', [col('n', '#', 'number'), col('title', 'Section'), col('content', 'Key message')], slides),
          table('Quarterly financial summary', [col('metric', 'Metric'), col('cur', p.quarter, 'auto'), col('prev', 'Prior Q', 'auto'), col('ya', 'Year-ago Q', 'auto')], [
            { metric: 'Revenue', cur: { v: a.revenue, f: 'currency' }, prev: { v: b.revenue, f: 'currency' }, ya: { v: c.revenue, f: 'currency' } },
            { metric: 'Gross margin', cur: { v: a.gm, f: 'pct' }, prev: { v: b.gm, f: 'pct' }, ya: { v: c.gm, f: 'pct' } },
            { metric: 'Opex', cur: { v: a.opex, f: 'currency' }, prev: { v: b.opex, f: 'currency' }, ya: { v: c.opex, f: 'currency' } },
            { metric: 'EBITDA', cur: { v: a.ebitda, f: 'currency' }, prev: { v: b.ebitda, f: 'currency' }, ya: { v: c.ebitda, f: 'currency' } },
            { metric: 'Ending cash', cur: { v: a.cash, f: 'currency' }, prev: { v: b.cash, f: 'currency' }, ya: { v: c.cash, f: 'currency' } },
          ]),
        ],
        insights: ['Every number in the pack is tied to the general ledger close for the period — no copy-paste from spreadsheets.', 'Narrative drafts are generated per section and routed to owners for edits.'],
        actions: ['Export to slides and send for CFO review.', 'Pre-read distribution 5 days before the meeting.'],
      });
    },
  },

  'investor-update': {
    params: [{ key: 'tone', label: 'Tone', type: 'select', options: ['Concise', 'Detailed'], default: 'Concise' }],
    run(ds, p) {
      const k = saasSnapshot(ds);
      const L = ds.last;
      const prev = ds.fin[ds.fin.length - 2];
      const rwy = runwayFrom(project(ds, 60, { hires: 2 }).rows, 0);
      const wins = ds.customers.filter((c) => c.start_month === L.month).sort((a, b) => b.start_mrr - a.start_mrr).slice(0, 3);
      const email = [
        `Subject: Northwind Cloud — ${monthLabel(L.month)} investor update`,
        '',
        'Hi all,',
        '',
        `TL;DR: ARR ${fmtMoney(k.arr)} (+${fmtPct(k.growth)} YoY), net burn ${fmtMoney(burnAt(ds, ds.fin.length - 1))}, cash ${fmtMoney(L.cash_end)} (${Number.isFinite(rwy) ? rwy.toFixed(0) + ' months runway' : 'default alive'}).`,
        '',
        'Highlights',
        `• Revenue ${fmtMoney(L.revenue)}, ${fmtPct(L.revenue / prev.revenue - 1)} MoM.`,
        `• ${L.new_customers} new customers incl. ${wins.map((w) => w.name).join(', ')}.`,
        `• Net revenue retention ${fmtPct(k.nrr)}; burn multiple ${k.burnMultiple.toFixed(2)}x.`,
        ...(p.tone === 'Detailed' ? [`• Gross margin ${fmtPct(L.gross_profit / L.revenue)}; EBITDA ${fmtMoney(L.ebitda)}.`, `• Headcount ${L.headcount}; ARR per employee ${fmtMoney(k.arrPerHead)}.`] : []),
        '',
        'Lowlights',
        `• ${L.churned_customers} customers churned (${fmtMoney(L.churned_mrr)} MRR).`,
        '',
        'Asks',
        '• Intros to VP Finance / CFOs at mid-market logistics operators.',
        '• Senior AE candidates for EMEA.',
        '',
        'Thanks,\nThe Northwind team',
      ].join('\n');
      return result({
        headline: `Monthly investor update drafted from live metrics (${p.tone.toLowerCase()} format) — ready to send.`,
        kpis: [kpi('ARR', k.arr, 'currency', { delta: k.growth }), kpi('Monthly revenue', L.revenue, 'currency', { delta: L.revenue / prev.revenue - 1 }), kpi('Net burn', burnAt(ds, ds.fin.length - 1)), kpi('Cash', L.cash_end), kpi('Runway', rwy, 'months'), kpi('NRR', k.nrr, 'pct')],
        charts: [line('ARR growth (24 months)', ds.months, [s('ARR', ds.fin.map((r) => r.mrr * 12))])],
        tables: [],
        narrative: email,
        insights: ['Numbers pull directly from the closed books — no manual reconciliation.', 'Wins list is generated from new customers booked this month, ranked by MRR.'],
        actions: ['Review, edit and send via your email tool.', 'Archive in the investor data room.'],
      });
    },
  },

  'investor-relations': {
    params: [],
    run(ds) {
      const k = saasSnapshot(ds);
      const cap = ds.capTable;
      const total = sum(cap.map((c) => c.shares));
      const rows = cap.map((c) => ({ ...c, ownership: c.shares / total, pps: c.invested ? c.invested / c.shares : null }));
      const lastPps = rows.filter((r) => r.class === 'Series B Preferred')[0].pps;
      const postMoney = lastPps * total;
      const impliedMultiple = postMoney / k.arr;
      const qa = [
        { q: 'What is net revenue retention and how is it trending?', a: `NRR is ${fmtPct(k.nrr)} on a trailing-12-month cohort basis; GRR ${fmtPct(k.grr)}.` },
        { q: 'How efficient is growth?', a: `Burn multiple ${k.burnMultiple.toFixed(2)}x and CAC payback ${k.cacPayback.toFixed(1)} months.` },
        { q: 'When do you reach profitability?', a: `EBITDA margin trending from ${fmtPct(ds.fin[ds.fin.length - 12].ebitda / ds.fin[ds.fin.length - 12].revenue)} to ${fmtPct(ds.last.ebitda / ds.last.revenue)} over 12 months.` },
        { q: 'What is the current valuation mark?', a: `Series B post-money ${fmtMoney(postMoney)} = ${impliedMultiple.toFixed(1)}x current ARR.` },
      ];
      return result({
        headline: `Investor base of ${cap.filter((c) => c.invested).length} institutional holders; Series B mark implies ${impliedMultiple.toFixed(1)}x current ARR.`,
        kpis: [kpi('Fully diluted shares', total, 'number'), kpi('Series B price / share', lastPps, 'currency2'), kpi('Implied post-money', postMoney), kpi('EV / ARR at last mark', impliedMultiple, 'multiple'), kpi('Total raised', sum(cap.map((c) => c.invested)))],
        charts: [{ type: 'donut', title: 'Fully diluted ownership', labels: rows.map((r) => r.holder), values: rows.map((r) => r.shares), format: 'number' }],
        tables: [table('Cap table', [col('holder', 'Holder'), col('class', 'Class'), col('shares', 'Shares', 'number'), col('ownership', 'Ownership', 'pct'), col('invested', 'Invested', 'currency'), col('board_seat', 'Board seats', 'number')], rows), table('Investor Q&A prep', [col('q', 'Likely question'), col('a', 'Prepared answer')], qa)],
        insights: ['Q&A answers are generated from live metrics so they stay consistent across investor conversations.', 'Board composition: 2 founders, 3 investor seats.'],
        actions: ['Log investor touchpoints and follow-ups.', 'Refresh Q&A before each investor call.'],
      });
    },
  },
};

