import { avg, fmtMoney, fmtPct, irr, npv, prng, percentile, sum } from '../lib/fin.js';
import { baseline, project, runwayFrom } from '../lib/model.js';
import { saasSnapshot } from './reporting.js';
import { bar, col, kpi, line, result, s, table, waterfall } from './out.js';

const RISK_FREE = 0.042;

export default {
  'ma-screening': {
    params: [{ key: 'maxEv', label: 'Max enterprise value', type: 'number', min: 10, max: 80, step: 5, default: 45, unit: '$M' }, { key: 'weightGrowth', label: 'Weight on growth vs fit', type: 'number', min: 0, max: 100, step: 10, default: 50, unit: '%' }],
    run(ds, p) {
      const wg = p.weightGrowth / 100;
      const rows = ds.targets.map((t) => {
        const multiple = t.ask_ev / t.revenue;
        const growthScore = Math.min(1, t.growth / 0.6);
        const fit = 0.5 * t.overlap + 0.3 * Math.min(1, (t.nrr - 0.9) / 0.35) + 0.2 * (t.gross_margin - 0.5) / 0.35;
        const valueScore = Math.max(0, 1 - (multiple - 4) / 12);
        const score = 100 * (wg * growthScore + (1 - wg) * fit) * 0.75 + 25 * valueScore;
        return { ...t, multiple, score, inBudget: t.ask_ev <= p.maxEv * 1e6 ? 'Yes' : 'No', ruleOf40: t.growth + t.ebitda_margin };
      }).sort((a, b) => b.score - a.score);
      const shortlist = rows.filter((r) => r.inBudget === 'Yes').slice(0, 3);
      return result({
        headline: shortlist.length ? `Screened ${rows.length} targets; shortlist: ${shortlist.map((r) => r.name).join(', ')}.` : `Screened ${rows.length} targets; none fit a ${fmtMoney(p.maxEv * 1e6)} budget — cheapest ask is ${fmtMoney(Math.min(...rows.map((r) => r.ask_ev)))}.`,
        kpis: [kpi('Targets screened', rows.length, 'number'), kpi('Within budget', rows.filter((r) => r.inBudget === 'Yes').length, 'number'), kpi('Median EV / revenue', percentile(rows.map((r) => r.multiple), 0.5), 'multiple'), kpi('Top score', rows[0].score, 'number1'), kpi('Combined ARR if top-1 acquired', shortlist.length ? ds.last.mrr * 12 + shortlist[0].revenue : '—', shortlist.length ? 'currency' : 'text')],
        charts: [{ type: 'scatter', title: 'Growth vs EV/Revenue (bubble = revenue)', points: rows.map((r) => ({ label: r.name, x: r.growth, y: r.multiple, r: r.revenue, group: r.inBudget === 'Yes' ? 'In budget' : 'Over budget' })), xLabel: 'Revenue growth', yLabel: 'EV / Revenue', xFormat: 'pct', yFormat: 'multiple' }],
        tables: [table('Target ranking', [col('name', 'Target'), col('sector', 'Sector'), col('revenue', 'Revenue', 'currency'), col('growth', 'Growth', 'pct'), col('gross_margin', 'GM', 'pct'), col('nrr', 'NRR', 'pct'), col('ask_ev', 'Ask EV', 'currency'), col('multiple', 'EV/Rev', 'multiple'), col('overlap', 'Customer overlap', 'pct'), col('score', 'Score', 'number1'), col('inBudget', 'In budget', 'status')], rows)],
        insights: [`Score blends growth, strategic fit (customer overlap, NRR, margin) and valuation discipline.`, shortlist.length ? `${shortlist[0].name} trades at ${shortlist[0].multiple.toFixed(1)}x revenue with ${fmtPct(shortlist[0].overlap)} customer overlap — strongest cross-sell thesis.` : `Top-ranked overall is ${rows[0].name}; raise the EV ceiling or consider a minority stake.`],
        actions: ['Open a data-room checklist with the Due Diligence Assistant.', 'Run Valuation Agent on the shortlist.'],
      });
    },
  },

  'due-diligence': {
    params: [{ key: 'target', label: 'Target', type: 'select', options: (ds) => ds.targets.map((t) => t.name), default: null }],
    run(ds, p) {
      const t = ds.targets.find((x) => x.name === p.target) ?? ds.targets[0];
      const R = prng(t.id * 97);
      const areas = ['Financial', 'Commercial', 'Technology', 'Legal', 'People', 'Tax'];
      const items = [
        ['Financial', 'Quality of earnings: normalised EBITDA bridge'], ['Financial', 'Revenue recognition policy (ASC 606)'], ['Financial', 'Working capital peg analysis'], ['Financial', 'Deferred revenue haircut'],
        ['Commercial', 'Top-20 customer concentration'], ['Commercial', 'Cohort retention & NRR validation'], ['Commercial', 'Pipeline quality review'],
        ['Technology', 'Architecture & scalability review'], ['Technology', 'Security posture / SOC 2 report'], ['Technology', 'Open-source licence scan'],
        ['Legal', 'Change-of-control clauses in customer contracts'], ['Legal', 'IP assignment from founders/contractors'], ['Legal', 'Litigation & disputes'],
        ['People', 'Key-person retention plan'], ['People', 'Compensation benchmarking'], ['Tax', 'Sales tax nexus exposure'], ['Tax', 'R&D credit substantiation'],
      ].map(([area, item]) => { const r = R(); return { area, item, status: r < 0.45 ? 'Received' : r < 0.75 ? 'Requested' : 'Not requested', flag: r > 0.9 ? 'Red flag' : r > 0.78 ? 'Follow-up' : '' }; });
      const concentration = 0.18 + R() * 0.25;
      const findings = [
        t.ebitda_margin < 0 ? `Loss-making (${fmtPct(t.ebitda_margin)} EBITDA margin) — model integration cost savings carefully.` : `Profitable at ${fmtPct(t.ebitda_margin)} EBITDA margin.`,
        `Top-10 customers estimated at ${fmtPct(concentration)} of revenue${concentration > 0.35 ? ' — high concentration risk' : ''}.`,
        `NRR ${fmtPct(t.nrr)} ${t.nrr < 1 ? 'below 100%: base is shrinking before new sales' : 'supports expansion thesis'}.`,
        `${fmtPct(t.overlap)} customer overlap with Northwind — synergy and cannibalisation both need validation.`,
      ];
      const progress = items.filter((i) => i.status === 'Received').length / items.length;
      return result({
        headline: `${t.name} diligence is ${fmtPct(progress, 0)} through the request list with ${items.filter((i) => i.flag === 'Red flag').length} red flag(s).`,
        kpis: [kpi('Request items', items.length, 'number'), kpi('Received', progress, 'pct'), kpi('Red flags', items.filter((i) => i.flag === 'Red flag').length, 'number', { tone: items.some((i) => i.flag === 'Red flag') ? 'bad' : 'good' }), kpi('Target revenue', t.revenue), kpi('Ask EV', t.ask_ev)],
        charts: [bar('Request status by workstream', areas, [s('Received', areas.map((a) => items.filter((i) => i.area === a && i.status === 'Received').length)), s('Requested', areas.map((a) => items.filter((i) => i.area === a && i.status === 'Requested').length)), s('Not requested', areas.map((a) => items.filter((i) => i.area === a && i.status === 'Not requested').length))], 'number', { stacked: true })],
        tables: [table('Diligence request list', [col('area', 'Workstream'), col('item', 'Item'), col('status', 'Status', 'status'), col('flag', 'Flag', 'status')], items)],
        insights: findings,
        actions: ['Send outstanding requests to the target data room.', 'Draft the QoE scope letter for the accounting advisor.'],
      });
    },
  },

  'valuation': {
    params: [{ key: 'wacc', label: 'Discount rate (WACC)', type: 'number', min: 10, max: 25, step: 0.5, default: 15, unit: '%' }, { key: 'terminalGrowth', label: 'Terminal growth', type: 'number', min: 1, max: 5, step: 0.5, default: 3, unit: '%' }, { key: 'multiple', label: 'Peer EV / ARR', type: 'number', min: 3, max: 15, step: 0.5, default: 7, unit: 'x' }],
    run(ds, p) {
      const k = saasSnapshot(ds);
      const { rows } = project(ds, 60, { hires: 2, mrrGrowth: baseline(ds).mrrGrowth * 0.85 });
      const years = [0, 1, 2, 3, 4].map((y) => { const yr = rows.slice(y * 12, y * 12 + 12); return { year: `Y${y + 1}`, revenue: sum(yr.map((r) => r.revenue)), ebitda: sum(yr.map((r) => r.ebitda)), fcf: sum(yr.map((r) => r.fcf)) }; });
      // margin convergence: assume EBITDA margin glides to 25% by Y5 in the DCF
      years.forEach((y, i) => { const target = 0.25; const m = y.ebitda / y.revenue; y.margin = m + (target - m) * (i / 4); y.ufcf = y.revenue * y.margin * 0.79 - y.revenue * 0.03; });
      const w = p.wacc / 100, g = p.terminalGrowth / 100;
      const pv = sum(years.map((y, i) => y.ufcf / (1 + w) ** (i + 1)));
      const tv = years[4].ufcf * (1 + g) / (w - g);
      const pvTv = tv / (1 + w) ** 5;
      const dcf = pv + pvTv;
      const comps = k.arr * p.multiple;
      const growthAdj = k.arr * p.multiple * (1 + (k.growth - 0.3));
      const netDebt = ds.last.debt_balance - ds.last.cash_end;
      const methods = [{ method: 'DCF (5-yr + terminal)', ev: dcf }, { method: `Trading comps (${p.multiple}x ARR)`, ev: comps }, { method: 'Growth-adjusted comps', ev: growthAdj }, { method: 'Last round (Series B post)', ev: (32e6 / 7.6e6) * sum(ds.capTable.map((c) => c.shares)) }];
      methods.forEach((m) => { m.equity = m.ev - netDebt; m.evArr = m.ev / k.arr; });
      const lo = Math.min(...methods.map((m) => m.ev)), hi = Math.max(...methods.map((m) => m.ev));
      return result({
        headline: `Enterprise value range ${fmtMoney(lo)}–${fmtMoney(hi)}; blended midpoint ${fmtMoney(avg(methods.map((m) => m.ev)))} (${(avg(methods.map((m) => m.ev)) / k.arr).toFixed(1)}x ARR).`,
        kpis: [kpi('ARR', k.arr), kpi('DCF EV', dcf), kpi('Comps EV', comps), kpi('Blended EV', avg(methods.map((m) => m.ev))), kpi('Terminal value share', pvTv / dcf, 'pct'), kpi('Net debt (cash)', netDebt)],
        charts: [{ type: 'football', title: 'Valuation football field', labels: methods.map((m) => m.method), lo: methods.map((m) => m.ev * 0.88), hi: methods.map((m) => m.ev * 1.12), mid: methods.map((m) => m.ev), format: 'currency' }, waterfall('DCF build', [{ label: 'PV of Y1–Y5 FCF', value: pv }, { label: 'PV of terminal value', value: pvTv }, { label: 'Enterprise value', value: dcf, total: true }, { label: 'Less net debt', value: -netDebt }, { label: 'Equity value', value: dcf - netDebt, total: true }])],
        tables: [table('DCF projection', [col('year', 'Year'), col('revenue', 'Revenue', 'currency'), col('margin', 'EBITDA margin', 'pct'), col('ufcf', 'Unlevered FCF', 'currency')], years), table('Method summary', [col('method', 'Method'), col('ev', 'Enterprise value', 'currency'), col('evArr', 'EV / ARR', 'multiple'), col('equity', 'Equity value', 'currency')], methods)],
        insights: [`Terminal value is ${fmtPct(pvTv / dcf)} of DCF value — typical for a growth company but highly sensitive to WACC.`, `Each 1pt of WACC moves DCF EV by ~${fmtMoney(Math.abs(dcf - (pv + years[4].ufcf * (1 + g) / (w + 0.01 - g) / (1 + w + 0.01) ** 5)))}.`, 'Growth-adjusted comps rewards Northwind for growing faster than the 30% peer median.'],
        actions: ['Use the range to anchor the Fundraising Materials Agent.', 'Run Sensitivity Analysis on WACC and terminal growth.'],
      });
    },
  },

  'fundraising-materials': {
    params: [{ key: 'raise', label: 'Raise amount', type: 'number', min: 10, max: 60, step: 5, default: 30, unit: '$M' }, { key: 'preMoney', label: 'Target pre-money', type: 'number', min: 80, max: 400, step: 10, default: 180, unit: '$M' }],
    run(ds, p) {
      const k = saasSnapshot(ds);
      const post = p.preMoney + p.raise;
      const dilution = p.raise / post;
      const { rows } = project(ds, 36, { hires: 4, extraCash: p.raise * 1e6, growthDelta: 0.004 });
      const rwy = runwayFrom(rows, 0);
      const useOfFunds = [{ use: 'Go-to-market expansion (EMEA, partners)', share: 0.45 }, { use: 'Product & R&D (platform, G3 hardware)', share: 0.3 }, { use: 'Customer success & onboarding', share: 0.1 }, { use: 'Working capital & general corporate', share: 0.15 }].map((u) => ({ ...u, amount: u.share * p.raise * 1e6 }));
      const deck = [
        ['Title & mission', 'Northwind Cloud — the operating system for distributed IoT operations'], ['Problem', 'Operators run fleets of devices with spreadsheets and point tools'], ['Solution & product', 'Per-seat platform + edge gateways + implementation'],
        ['Traction', `ARR ${fmtMoney(k.arr)}, +${fmtPct(k.growth)} YoY, ${k.customers} customers`], ['Unit economics', `NRR ${fmtPct(k.nrr)}, GM ${fmtPct(k.gm)}, CAC payback ${k.cacPayback.toFixed(0)} mo`], ['Efficiency', `Burn multiple ${k.burnMultiple.toFixed(2)}x, Rule of 40 ${fmtPct(k.ruleOf40)}`],
        ['Market', 'Industrial IoT operations software TAM sizing'], ['Competition', 'Positioning vs horizontal IoT platforms'], ['Plan', `36-month plan to ${fmtMoney(rows[35].arr)} ARR`],
        ['The raise', `${fmtMoney(p.raise * 1e6)} at ${fmtMoney(p.preMoney * 1e6)} pre (${fmtPct(dilution)} dilution)`], ['Use of funds', useOfFunds.map((u) => `${fmtPct(u.share, 0)} ${u.use.split(' (')[0]}`).join('; ')],
      ].map(([slide, msg], i) => ({ n: i + 1, slide, msg }));
      return result({
        headline: `${fmtMoney(p.raise * 1e6)} raise at ${fmtMoney(p.preMoney * 1e6)} pre implies ${(p.preMoney * 1e6 / k.arr).toFixed(1)}x ARR and ${fmtPct(dilution)} dilution; extends runway to ${Number.isFinite(rwy) ? rwy.toFixed(0) + ' months' : 'default-alive'}.`,
        kpis: [kpi('Pre-money / ARR', p.preMoney * 1e6 / k.arr, 'multiple'), kpi('Post-money', post * 1e6), kpi('Dilution', dilution, 'pct'), kpi('Runway after raise', rwy, 'months'), kpi('ARR in 36 months', rows[35].arr), kpi('Data-room metrics ready', 24, 'number')],
        charts: [line('Plan ARR with new capital', rows.map((r) => r.month), [s('ARR', rows.map((r) => r.arr))]), bar('Use of funds', useOfFunds.map((u) => u.use.split(' (')[0]), [s('Amount', useOfFunds.map((u) => u.amount))])],
        tables: [table('Pitch deck outline (auto-populated)', [col('n', '#', 'number'), col('slide', 'Slide'), col('msg', 'Key message')], deck), table('Use of funds', [col('use', 'Use'), col('share', 'Share', 'pct'), col('amount', 'Amount', 'currency')], useOfFunds)],
        insights: ['All metrics in the deck and data room are generated from the same source so diligence answers stay consistent.', `Peers growing ${fmtPct(k.growth, 0)} with NRR > 105% have recently priced at 6–10x ARR.`],
        actions: ['Generate the metrics appendix and data-room index.', 'Prepare investor Q&A with the Investor Relations Agent.'],
      });
    },
  },

  'business-case': {
    params: [{ key: 'project', label: 'Initiative', type: 'select', options: (ds) => ds.capex.map((c) => c.name), default: null }, { key: 'benefitHaircut', label: 'Benefit haircut', type: 'number', min: 0, max: 50, step: 5, default: 0, unit: '%' }, { key: 'rate', label: 'Discount rate', type: 'number', min: 8, max: 25, step: 1, default: 15, unit: '%' }],
    run(ds, p) {
      const c = ds.capex.find((x) => x.name === p.project) ?? ds.capex[0];
      const benefit = c.annual_benefit * (1 - p.benefitHaircut / 100);
      const ramp = [0.5, 0.9, 1, 1, 1, 1];
      const flows = [-c.investment, ...Array.from({ length: c.years }, (_, i) => benefit * ramp[i])];
      const r = p.rate / 100;
      const v = npv(r, flows), ir = irr(flows);
      let cum = 0;
      const rows = flows.map((f, i) => { cum += f; return { year: i === 0 ? 'Y0 (invest)' : `Y${i}`, flow: f, pv: f / (1 + r) ** i, cumulative: cum }; });
      const paybackYr = rows.findIndex((x) => x.cumulative >= 0);
      const breakEvenHaircut = (() => { for (let h = 0; h <= 100; h++) { const b = c.annual_benefit * (1 - h / 100); if (npv(r, [-c.investment, ...Array.from({ length: c.years }, (_, i) => b * ramp[i])]) < 0) return h; } return 100; })();
      return result({
        headline: `${c.name}: NPV ${fmtMoney(v)} at ${p.rate}%, IRR ${ir === null ? 'n/a' : fmtPct(ir)}, payback in ${paybackYr < 0 ? `>${c.years} years` : `year ${paybackYr}`} — ${v > 0 ? 'recommend approve' : 'does not clear the hurdle'}.`,
        kpis: [kpi('Investment', c.investment), kpi('Annual benefit (steady state)', benefit), kpi('NPV', v, 'currency', { tone: v > 0 ? 'good' : 'bad' }), kpi('IRR', ir, 'pct'), kpi('Payback year', paybackYr < 0 ? `>${c.years}` : `Y${paybackYr}`, 'text'), kpi('Benefit haircut to break even', breakEvenHaircut / 100, 'pct')],
        charts: [bar('Cash flows & cumulative', rows.map((x) => x.year), [s('Cash flow', rows.map((x) => x.flow)), s('Cumulative', rows.map((x) => x.cumulative), { type: 'line' })])],
        tables: [table('Cash-flow schedule', [col('year', 'Year'), col('flow', 'Cash flow', 'currency'), col('pv', 'Present value', 'currency'), col('cumulative', 'Cumulative', 'currency')], rows)],
        insights: [`Benefits ramp 50% → 90% → 100% over the first three years.`, `The case survives a ${breakEvenHaircut}% haircut to benefits before NPV turns negative.`, `Risk rating: ${c.risk}; strategic score ${c.strategic_score}/10.`],
        actions: ['Attach to the capital allocation committee pack.', 'Define the KPIs that will prove the benefit post-launch.'],
      });
    },
  },

  'strategic-finance-partner': {
    params: [{ key: 'question', label: 'Strategic question', type: 'select', options: ['Should we expand into EMEA?', 'Should we raise prices 10%?', 'Should we slow hiring to reach breakeven?', 'Should we push annual prepay?'], default: 'Should we expand into EMEA?' }],
    run(ds, p) {
      const b = baseline(ds);
      const base = project(ds, 24, { hires: 2 });
      const opts = {
        'Should we expand into EMEA?': { d: { hires: 4, growthDelta: 0.006, opexGrowth: 0.004 }, lever: 'EMEA pod: +2 heads/mo, +0.6pt monthly growth after ramp' },
        'Should we raise prices 10%?': { d: { hires: 2, priceChange: 0.1, churnDelta: 0.0015 }, lever: '+10% list price, modest churn uptick' },
        'Should we slow hiring to reach breakeven?': { d: { hires: 0, growthDelta: -0.003 }, lever: 'Hiring freeze, slight growth slowdown' },
        'Should we push annual prepay?': { d: { hires: 2, dsoDelta: -12, priceChange: -0.03 }, lever: '3% prepay discount, DSO −12 days' },
      }[p.question];
      const alt = project(ds, 24, opts.d);
      const cmp = (r) => ({ arr: r.rows[23].arr, cash: r.rows[23].cash_end, minCash: Math.min(...r.rows.map((x) => x.cash_end)), ebitda: sum(r.rows.slice(12).map((x) => x.ebitda)) });
      const A = cmp(base), B = cmp(alt);
      const score = (B.arr - A.arr) / A.arr * 2 + (B.cash - A.cash) / Math.abs(A.cash || 1);
      const rec = score > 0.02 && B.minCash > 8e6 ? 'Proceed' : B.minCash <= 8e6 ? 'Proceed only with financing' : 'Do not proceed';
      return result({
        headline: `${p.question} → ${rec}. Exit ARR ${B.arr >= A.arr ? '+' : ''}${fmtMoney(B.arr - A.arr)} vs base; trough cash ${fmtMoney(B.minCash)}.`,
        kpis: [kpi('Base exit ARR', A.arr), kpi('Option exit ARR', B.arr, 'currency', { delta: B.arr / A.arr - 1 }), kpi('Base ending cash', A.cash), kpi('Option ending cash', B.cash, 'currency', { delta: (B.cash - A.cash) / Math.abs(A.cash) }), kpi('Option trough cash', B.minCash, 'currency', { tone: B.minCash > 8e6 ? 'good' : 'bad' }), kpi('Recommendation', rec, 'text', { tone: rec === 'Proceed' ? 'good' : rec === 'Do not proceed' ? 'bad' : 'neutral' })],
        charts: [line('ARR: base vs option', base.rows.map((r) => r.month), [s('Base', base.rows.map((r) => r.arr)), s('Option', alt.rows.map((r) => r.arr))]), line('Cash: base vs option', base.rows.map((r) => r.month), [s('Base', base.rows.map((r) => r.cash_end)), s('Option', alt.rows.map((r) => r.cash_end)), s('Covenant', base.rows.map(() => 8e6), { dashed: true })])],
        tables: [table('Side-by-side (24 months)', [col('metric', 'Metric'), col('base', 'Base', 'currency'), col('option', 'Option', 'currency'), col('diff', 'Difference', 'currency')], [['Exit ARR', 'arr'], ['Ending cash', 'cash'], ['Trough cash', 'minCash'], ['Year-2 EBITDA', 'ebitda']].map(([m, key]) => ({ metric: m, base: A[key], option: B[key], diff: B[key] - A[key] })))],
        insights: [`Modelled lever: ${opts.lever}.`, rec === 'Proceed' ? 'Upside outweighs the cash cost and stays inside the covenant.' : rec === 'Proceed only with financing' ? 'Value-accretive but breaches the $8M covenant without new capital.' : 'Destroys value relative to the base plan under current assumptions.'],
        actions: ['Pressure-test assumptions with the Sensitivity Analysis Agent.', 'Bring the recommendation to the CFO Decision Support Agent.'],
      });
    },
  },

  'cfo-decision-support': {
    params: [{ key: 'simulations', label: 'Monte Carlo runs', type: 'number', min: 200, max: 2000, step: 200, default: 1000, unit: 'runs' }, { key: 'hires', label: 'Net hires / month', type: 'number', min: 0, max: 8, step: 1, default: 2, unit: 'heads' }],
    run(ds, p) {
      const b = baseline(ds);
      const R = prng(7);
      const norm = () => { const u = Math.max(R(), 1e-9), v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
      const outcomes = [];
      for (let i = 0; i < p.simulations; i++) {
        const g = b.mrrGrowth + norm() * 0.006;
        const gm = norm() * 0.015;
        const og = Math.max(0, 0.002 + norm() * 0.003);
        const { rows } = project(ds, 24, { mrrGrowth: g, gmDelta: gm, opexGrowth: og, hires: p.hires });
        outcomes.push({ arr: rows[23].arr, cash: rows[23].cash_end, minCash: Math.min(...rows.map((r) => r.cash_end)), breach: rows.some((r) => r.cash_end < 8e6), ebitdaPos: rows[23].ebitda > 0 });
      }
      const arr = outcomes.map((o) => o.arr), cash = outcomes.map((o) => o.cash);
      const pBreach = outcomes.filter((o) => o.breach).length / outcomes.length;
      const pProfit = outcomes.filter((o) => o.ebitdaPos).length / outcomes.length;
      const bins = 14, lo = Math.min(...cash), hi = Math.max(...cash), w = (hi - lo) / bins;
      const hist = Array.from({ length: bins }, (_, i) => ({ label: `${(lo + i * w) / 1e6 >= 0 ? '' : ''}${((lo + (i + 0.5) * w) / 1e6).toFixed(1)}M`, count: cash.filter((c) => c >= lo + i * w && (i === bins - 1 ? c <= hi : c < lo + (i + 1) * w)).length }));
      const decisions = [
        { decision: `Keep hiring at ${p.hires}/mo`, verdict: pBreach < 0.1 ? 'Supported' : 'Risky', why: `${fmtPct(pBreach)} chance of a covenant breach in 24 months` },
        { decision: 'Start fundraise in next 6 months', verdict: pBreach > 0.25 ? 'Recommended' : 'Optional', why: `P10 trough cash ${fmtMoney(percentile(outcomes.map((o) => o.minCash), 0.1))}` },
        { decision: 'Commit to EBITDA-positive in 24 months', verdict: pProfit > 0.7 ? 'Achievable' : 'Stretch', why: `${fmtPct(pProfit)} of simulations end EBITDA-positive` },
      ];
      return result({
        headline: `Across ${p.simulations} simulations, there's a ${fmtPct(pBreach)} chance of breaching the $8M covenant and a ${fmtPct(pProfit)} chance of EBITDA-positive exit in 24 months.`,
        kpis: [kpi('P50 exit ARR', percentile(arr, 0.5)), kpi('P10–P90 ARR', `${fmtMoney(percentile(arr, 0.1))} – ${fmtMoney(percentile(arr, 0.9))}`, 'text'), kpi('P50 ending cash', percentile(cash, 0.5)), kpi('P10 ending cash', percentile(cash, 0.1), 'currency', { tone: percentile(cash, 0.1) < 8e6 ? 'bad' : 'good' }), kpi('Covenant breach probability', pBreach, 'pct', { tone: pBreach > 0.1 ? 'bad' : 'good' }), kpi('P(EBITDA-positive)', pProfit, 'pct')],
        charts: [bar('Distribution of ending cash (24 months)', hist.map((h) => h.label), [s('Simulations', hist.map((h) => h.count))], 'number')],
        tables: [table('Decision guidance', [col('decision', 'Decision'), col('verdict', 'Verdict', 'status'), col('why', 'Evidence')], decisions)],
        insights: ['Simulation varies MRR growth (σ 0.6pt/mo), gross margin (σ 1.5pt) and opex growth (σ 0.3pt/mo) around trailing actuals.', 'Use the P10 path, not the average, for covenant and fundraising decisions.'],
        actions: ['Present the decision memo at the next exec meeting.', 'Re-run monthly after close to update probabilities.'],
      });
    },
  },
};
