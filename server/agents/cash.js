import { avg, fmtMoney, fmtPct, irr, lastN, monthAdd, npv, sum, monthsBetweenKeys } from '../lib/fin.js';
import { burnAt, project } from '../lib/model.js';
import { bar, col, kpi, line, result, s, table, waterfall } from './out.js';

export default {
  'burn-rate-monitor': {
    params: [{ key: 'alert', label: 'Alert if net burn exceeds', type: 'number', min: 100, max: 1500, step: 50, default: 500, unit: '$K/mo' }],
    run(ds, p) {
      const f = ds.fin;
      const rows = f.map((r, i) => ({ month: r.month, gross: r.cogs + r.opex + r.capex + r.interest, net: burnAt(ds, i), revenue: r.revenue }));
      const L = rows[rows.length - 1];
      const t3 = avg(lastN(rows, 3).map((r) => r.net));
      const p3 = avg(rows.slice(-6, -3).map((r) => r.net));
      const breaches = rows.filter((r) => r.net > p.alert * 1000);
      const debtFree = f.map((r) => ({ month: r.month, operating: -(r.ebitda - r.capex) }));
      return result({
        headline: `Net burn averaged ${fmtMoney(t3)}/mo over the last quarter, ${t3 < p3 ? 'down' : 'up'} ${fmtPct(Math.abs(t3 / p3 - 1))} QoQ; ${breaches.filter((b) => lastN(rows, 6).includes(b)).length} of the last 6 months breached the ${fmtMoney(p.alert * 1000)} alert.`,
        kpis: [kpi('Gross burn (last mo)', L.gross), kpi('Net burn (last mo)', L.net, 'currency', { tone: L.net > p.alert * 1000 ? 'bad' : 'good' }), kpi('3-mo avg net burn', t3, 'currency', { delta: t3 / p3 - 1, invert: true }), kpi('Cash', ds.last.cash_end), kpi('Runway at avg burn', t3 > 0 ? ds.last.cash_end / t3 : Infinity, 'months'), kpi('Alert breaches (24 mo)', breaches.length, 'number')],
        charts: [bar('Net burn by month', rows.map((r) => r.month), [s('Net burn', rows.map((r) => r.net)), s('Alert threshold', rows.map(() => p.alert * 1000), { type: 'line', dashed: true })]), line('Operating burn (EBITDA − capex)', debtFree.map((r) => r.month), [s('Operating burn', debtFree.map((r) => r.operating))])],
        tables: [table('Burn detail (last 6 months)', [col('month', 'Month'), col('revenue', 'Revenue', 'currency'), col('gross', 'Gross burn', 'currency'), col('net', 'Net burn', 'currency')], lastN(rows, 6))],
        insights: [`Net burn is measured before financing (debt draws and repayments excluded) and includes working-capital swings; operating burn (EBITDA − capex) was ${fmtMoney(-(ds.last.ebitda - ds.last.capex))} last month.`, `Gross burn is ${fmtMoney(L.gross)}/mo — revenue covers ${fmtPct(L.revenue / L.gross)} of it.`, t3 < p3 ? 'Burn is trending down as gross margin and revenue scale faster than opex.' : 'Burn is rising — check hiring pace and working capital.'],
        actions: ['Send weekly burn alert to CFO when the threshold is crossed.', 'Reconcile net burn to bank balances via Treasury Forecast Agent.'],
      });
    },
  },

  'working-capital': {
    params: [{ key: 'dsoTarget', label: 'Target DSO', type: 'number', min: 20, max: 60, step: 1, default: 35, unit: 'days' }, { key: 'dpoTarget', label: 'Target DPO', type: 'number', min: 20, max: 75, step: 1, default: 40, unit: 'days' }],
    run(ds, p) {
      const rows = ds.fin.map((r) => {
        const dso = r.ar_balance / r.revenue * 30;
        const dpo = r.ap_balance / (r.cogs + r.opex * 0.32) * 30;
        const dio = r.revenue_hardware ? r.inventory_balance / r.cogs_hardware * 30 : 0;
        return { month: r.month, dso, dpo, dio, ccc: dso + dio * (r.revenue_hardware / r.revenue) - dpo, nwc: r.ar_balance + r.inventory_balance - r.ap_balance - r.deferred_revenue };
      });
      const L = rows[rows.length - 1];
      const R = ds.last;
      const dailyRev = R.revenue / 30, dailySpend = (R.cogs + R.opex * 0.32) / 30;
      const arRelease = Math.max(0, (L.dso - p.dsoTarget) * dailyRev);
      const apRelease = Math.max(0, (p.dpoTarget - L.dpo) * dailySpend);
      const invRelease = R.inventory_balance * 0.15;
      return result({
        headline: `Cash conversion cycle is ${L.ccc.toFixed(0)} days; hitting DSO ${p.dsoTarget} and DPO ${p.dpoTarget} would release ${fmtMoney(arRelease + apRelease)} of cash.`,
        kpis: [kpi('DSO', L.dso, 'days', { tone: L.dso > 45 ? 'bad' : 'good' }), kpi('DPO', L.dpo, 'days'), kpi('DIO (hardware)', L.dio, 'days'), kpi('Cash conversion cycle', L.ccc, 'days'), kpi('Cash release opportunity', arRelease + apRelease + invRelease, 'currency', { tone: 'good' })],
        charts: [line('DSO / DPO trend', rows.map((r) => r.month), [s('DSO', rows.map((r) => r.dso)), s('DPO', rows.map((r) => r.dpo)), s('Target DSO', rows.map(() => p.dsoTarget), { dashed: true })], 'days'), waterfall('Cash release bridge', [{ label: 'Today', value: 0, total: true }, { label: 'DSO to target', value: arRelease }, { label: 'DPO to target', value: apRelease }, { label: 'Inventory −15%', value: invRelease }, { label: 'Total release', value: arRelease + apRelease + invRelease, total: true }])],
        tables: [table('Working capital components', [col('item', 'Component'), col('balance', 'Balance', 'currency'), col('days', 'Days', 'days')], [{ item: 'Accounts receivable', balance: R.ar_balance, days: L.dso }, { item: 'Inventory', balance: R.inventory_balance, days: L.dio }, { item: 'Accounts payable', balance: -R.ap_balance, days: L.dpo }, { item: 'Deferred revenue', balance: -R.deferred_revenue, days: R.deferred_revenue / R.revenue * 30 }])],
        insights: [`Each day of DSO is worth ${fmtMoney(dailyRev)} of cash.`, `Deferred revenue (${fmtMoney(R.deferred_revenue)}) is a source of funding — pushing annual prepay would grow it.`, `Hardware inventory covers ~${L.dio.toFixed(0)} days of hardware COGS vs supplier lead times of 20–60 days.`],
        actions: ['Launch collections playbook with the Accounts Receivable Agent.', 'Renegotiate terms on top vendors to Net 45 via Procurement Savings Agent.'],
      });
    },
  },

  'treasury-forecast': {
    params: [{ key: 'yield', label: 'Money-market yield', type: 'number', min: 1, max: 6, step: 0.25, default: 4.25, unit: '%' }, { key: 'buffer', label: 'Operating buffer', type: 'number', min: 1, max: 6, step: 0.5, default: 3, unit: 'months of burn' }],
    run(ds, p) {
      const { rows } = project(ds, 12, { hires: 2 });
      const L = ds.last;
      const burn = Math.max(1, avg([1, 2, 3].map((k) => burnAt(ds, ds.fin.length - k))));
      const operating = Math.max(burn * p.buffer, 2e6);
      const covenantFloor = 8e6;
      const investable = Math.max(0, L.cash_end - operating - Math.max(0, covenantFloor - operating));
      const ladder = [
        { bucket: 'Operating account (T+0)', amount: operating, yield: 0.005, liquidity: 'Same day' },
        { bucket: 'Government MMF (T+0)', amount: Math.min(investable, covenantFloor), yield: p.yield / 100, liquidity: 'Same day' },
        { bucket: '3-month T-bills', amount: Math.max(0, investable - covenantFloor) * 0.6, yield: p.yield / 100 + 0.002, liquidity: '≤ 3 months' },
        { bucket: '6-month T-bills', amount: Math.max(0, investable - covenantFloor) * 0.4, yield: p.yield / 100 + 0.003, liquidity: '≤ 6 months' },
      ];
      ladder.forEach((l) => { l.income = l.amount * l.yield; });
      const income = sum(ladder.map((l) => l.income));
      const banks = [{ bank: 'Silicon Ridge Bank', share: 0.62 }, { bank: 'Harbor National', share: 0.25 }, { bank: 'Treasury MMF (custody)', share: 0.13 }].map((b) => ({ ...b, balance: L.cash_end * b.share, insured: Math.min(250000, L.cash_end * b.share) }));
      return result({
        headline: `Keep ${fmtMoney(operating)} operating cash and ladder the rest to earn ~${fmtMoney(income)}/yr at ${p.yield}% while preserving the $8M covenant.`,
        kpis: [kpi('Total cash', L.cash_end), kpi('Operating buffer', operating), kpi('Investable', Math.max(0, L.cash_end - operating)), kpi('Annual yield income', income, 'currency', { tone: 'good' }), kpi('12-mo projected cash', rows[11].cash_end), kpi('Lowest projected cash', Math.min(...rows.map((r) => r.cash_end)), 'currency', { tone: Math.min(...rows.map((r) => r.cash_end)) < covenantFloor ? 'bad' : 'good' })],
        charts: [line('Projected cash vs covenant floor', rows.map((r) => r.month), [s('Projected cash', rows.map((r) => r.cash_end)), s('Covenant floor', rows.map(() => covenantFloor), { dashed: true })]), bar('Liquidity ladder', ladder.map((l) => l.bucket), [s('Allocation', ladder.map((l) => l.amount))])],
        tables: [table('Recommended allocation', [col('bucket', 'Bucket'), col('amount', 'Amount', 'currency'), col('yield', 'Yield', 'pct'), col('income', 'Annual income', 'currency'), col('liquidity', 'Liquidity')], ladder), table('Bank exposure', [col('bank', 'Institution'), col('balance', 'Balance', 'currency'), col('share', 'Share', 'pct'), col('insured', 'FDIC insured', 'currency')], banks)],
        insights: [`62% of cash sits with the lender bank — consider sweeping excess to an MMF to reduce counterparty concentration.`, `Ladder maturities align with projected burn so no T-bill needs to be sold early.`],
        actions: ['Approve sweep instructions with the bank.', 'Review counterparty limits quarterly.'],
      });
    },
  },

  'debt-schedule': {
    params: [{ key: 'prepay', label: 'Prepay revolver', type: 'number', min: 0, max: 1, step: 0.25, default: 0, unit: '$M' }],
    run(ds, p) {
      const L = ds.last;
      const sched = [];
      let totalInterest = 0;
      const facilities = ds.debt.map((d) => {
        const elapsed = monthsBetweenKeys(d.start_month, L.month);
        let bal = d.drawn;
        if (d.amort_months > 0) { const io = d.type === 'Term loan' ? 6 : 0; bal = Math.max(0, d.drawn * (1 - Math.max(0, elapsed - io) / d.amort_months)); }
        if (d.type === 'Revolver') bal = Math.max(0, bal - p.prepay * 1e6);
        return { ...d, balance: bal, monthlyPrincipal: d.amort_months ? d.drawn / d.amort_months : 0, remaining: monthsBetweenKeys(L.month, d.maturity_month) };
      });
      for (let t = 1; t <= 24; t++) {
        const m = monthAdd(L.month, t);
        const row = { month: m, principal: 0, interest: 0, balance: 0 };
        for (const f of facilities) {
          if (f.balance <= 0 || m > f.maturity_month) continue;
          const i = f.balance * f.rate / 12;
          let pr = Math.min(f.balance, f.monthlyPrincipal);
          if (m === f.maturity_month) pr = f.balance; // bullet at maturity
          f.balance -= pr; row.principal += pr; row.interest += i;
        }
        row.balance = sum(facilities.map((f) => f.balance));
        totalInterest += row.interest;
        sched.push(row);
      }
      const ebitda12 = sum(lastN(ds.fin, 12).map((r) => r.ebitda));
      const current = sum(ds.debt.map((d) => { const el = monthsBetweenKeys(d.start_month, L.month); const io = d.type === 'Term loan' ? 6 : 0; return d.amort_months ? Math.max(0, d.drawn * (1 - Math.max(0, el - io) / d.amort_months)) : d.drawn; }));
      const interestSaved = p.prepay * 1e6 * 0.0925 * 15 / 12;
      return result({
        headline: `${fmtMoney(current)} outstanding across ${ds.debt.length} facilities; ${fmtMoney(sum(sched.slice(0, 12).map((r) => r.principal + r.interest)))} of debt service due in the next 12 months.`,
        kpis: [kpi('Debt outstanding', current), kpi('Weighted avg rate', sum(ds.debt.map((d) => d.drawn * d.rate)) / sum(ds.debt.map((d) => d.drawn)), 'pct'), kpi('12-mo principal', sum(sched.slice(0, 12).map((r) => r.principal))), kpi('12-mo interest', sum(sched.slice(0, 12).map((r) => r.interest))), kpi('Cash / min-cash covenant', L.cash_end / 8e6, 'multiple', { tone: L.cash_end / 8e6 > 1.25 ? 'good' : 'bad' }), kpi('Interest saved by prepay', interestSaved, 'currency', { tone: 'good' })],
        charts: [bar('Debt service schedule', sched.map((r) => r.month), [s('Principal', sched.map((r) => r.principal)), s('Interest', sched.map((r) => r.interest))], 'currency', { stacked: true }), line('Outstanding balance', sched.map((r) => r.month), [s('Balance', sched.map((r) => r.balance))])],
        tables: [table('Facilities', [col('lender', 'Lender'), col('type', 'Type'), col('facility', 'Facility', 'currency'), col('drawn', 'Drawn', 'currency'), col('rate', 'Rate', 'pct'), col('maturity_month', 'Maturity'), col('covenant', 'Covenant')], ds.debt)],
        insights: [`Min-cash covenant headroom is ${fmtMoney(L.cash_end - 8e6)} today.`, ebitda12 < 0 ? 'Leverage ratios are not meaningful while TTM EBITDA is negative — lenders rely on the cash covenant.' : `Debt / TTM EBITDA ${(current / ebitda12).toFixed(1)}x.`, `Revolver is the most expensive floating exposure; prepaying ${fmtMoney(p.prepay * 1e6)} saves ~${fmtMoney(interestSaved)} over its remaining life.`],
        actions: ['Generate the monthly compliance certificate for the lender.', 'Model refinance options before the 2027 revolver maturity.'],
      });
    },
  },

  'capital-allocation': {
    params: [{ key: 'budget', label: 'Capital available', type: 'number', min: 1, max: 6, step: 0.25, default: 3, unit: '$M' }, { key: 'hurdle', label: 'Hurdle rate', type: 'number', min: 8, max: 30, step: 1, default: 15, unit: '%' }],
    run(ds, p) {
      const rate = p.hurdle / 100;
      const projects = ds.capex.map((c) => {
        const flows = [-c.investment, ...Array(c.years).fill(c.annual_benefit)];
        const v = npv(rate, flows);
        const riskAdj = { Low: 1, Medium: 0.85, High: 0.7 }[c.risk];
        return { ...c, npv: v, irr: irr(flows), pi: (v + c.investment) / c.investment, payback: c.investment / c.annual_benefit, score: (v * riskAdj / c.investment) * 50 + c.strategic_score * 5 };
      }).sort((a, b) => b.score - a.score);
      let left = p.budget * 1e6;
      for (const pr of projects) { if (pr.npv > 0 && pr.investment <= left) { pr.decision = 'Fund'; left -= pr.investment; } else pr.decision = pr.npv <= 0 ? 'Reject (NPV<0)' : 'Defer (budget)'; }
      const funded = projects.filter((x) => x.decision === 'Fund');
      return result({
        headline: `Fund ${funded.length} of ${projects.length} projects for ${fmtMoney(sum(funded.map((x) => x.investment)))}, creating ${fmtMoney(sum(funded.map((x) => x.npv)))} of NPV at a ${p.hurdle}% hurdle.`,
        kpis: [kpi('Capital available', p.budget * 1e6), kpi('Allocated', sum(funded.map((x) => x.investment))), kpi('Portfolio NPV', sum(funded.map((x) => x.npv)), 'currency', { tone: 'good' }), kpi('Unallocated', left), kpi('Projects funded', funded.length, 'number')],
        charts: [{ type: 'scatter', title: 'Risk-adjusted return vs strategic fit (bubble = investment)', points: projects.map((x) => ({ label: x.name, x: x.strategic_score, y: x.irr ?? 0, r: x.investment, group: x.decision === 'Fund' ? 'Fund' : 'Defer / reject' })), xLabel: 'Strategic score', yLabel: 'IRR', yFormat: 'pct' }],
        tables: [table('Ranked projects', [col('name', 'Project'), col('category', 'Category'), col('investment', 'Investment', 'currency'), col('npv', 'NPV', 'currency'), col('irr', 'IRR', 'pct'), col('payback', 'Payback (yrs)', 'number1'), col('risk', 'Risk'), col('decision', 'Decision', 'status')], projects)],
        insights: [`Ranking blends risk-adjusted profitability index with strategic score so a high-NPV/low-fit project doesn't crowd out core bets.`, `Deferred: ${projects.filter((x) => x.decision.startsWith('Defer')).map((x) => x.name).join(', ') || 'none'}.`],
        actions: ['Take the funded list to the Business Case Builder for full cases.', 'Track realised benefits quarterly against the cases.'],
      });
    },
  },
};

