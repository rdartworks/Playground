import { avg, cmgr, fmtMoney, fmtPct, lastN, linreg, monthAdd, sum, groupBy, stdev } from '../lib/fin.js';
import { baseline, burnAt, project, runwayFrom } from '../lib/model.js';
import { bar, col, kpi, line, result, s, stacked, table } from './out.js';

const yearly = (rows, key) => sum(rows.slice(0, 12).map((r) => r[key]));

export default {
  'financial-modeling': {
    params: [
      { key: 'horizon', label: 'Horizon', type: 'number', min: 12, max: 36, step: 6, default: 24, unit: 'months' },
      { key: 'growth', label: 'Monthly MRR growth', type: 'number', min: 0, max: 6, step: 0.25, default: null, unit: '%', hint: 'Blank = trailing 6-month rate' },
      { key: 'hires', label: 'Net hires / month', type: 'number', min: 0, max: 8, step: 1, default: 2, unit: 'heads' },
      { key: 'gmDelta', label: 'Gross margin change', type: 'number', min: -5, max: 5, step: 0.5, default: 0, unit: 'pts' },
    ],
    run(ds, p) {
      const drivers = { hires: p.hires, gmDelta: p.gmDelta / 100 };
      if (p.growth !== null && p.growth !== '' && p.growth !== undefined) drivers.mrrGrowth = p.growth / 100;
      const { rows, baseline: b, growth } = project(ds, p.horizon, drivers);
      const hist = lastN(ds.fin, 12);
      const y1 = rows.slice(0, 12);
      const lastRow = rows[rows.length - 1];
      const ebitdaBreakeven = rows.find((r) => r.ebitda > 0);
      const histRev = hist.map((r) => r.revenue);
      return result({
        headline: `Three-statement driver model: ARR reaches ${fmtMoney(lastRow.arr)} in ${p.horizon} months at ${fmtPct(growth, 2)} monthly MRR growth${ebitdaBreakeven ? `, EBITDA positive from ${ebitdaBreakeven.month}` : ''}.`,
        kpis: [
          kpi('Current ARR', b.mrr * 12), kpi(`ARR in ${p.horizon} mo`, lastRow.arr, 'currency', { delta: lastRow.arr / (b.mrr * 12) - 1 }),
          kpi('Next-12-mo revenue', yearly(rows, 'revenue')), kpi('Next-12-mo EBITDA', yearly(rows, 'ebitda'), 'currency', { tone: yearly(rows, 'ebitda') < 0 ? 'bad' : 'good' }),
          kpi('Ending cash', lastRow.cash_end, 'currency', { tone: lastRow.cash_end < 8e6 ? 'bad' : 'good' }), kpi('Ending headcount', lastRow.headcount, 'number'),
        ],
        charts: [
          line('Revenue: actual vs model', [...hist.map((r) => r.month), ...rows.map((r) => r.month)], [
            s('Actual', [...histRev, ...rows.map(() => null)]),
            s('Model', [...hist.map(() => null), ...rows.map((r) => r.revenue)], { dashed: true }),
          ]),
          bar('Monthly EBITDA (model)', rows.map((r) => r.month), [s('EBITDA', rows.map((r) => r.ebitda))]),
          line('Cash balance (model)', rows.map((r) => r.month), [s('Cash', rows.map((r) => r.cash_end))]),
        ],
        tables: [table('Model output (quarterly)', [col('period', 'Quarter'), col('revenue', 'Revenue', 'currency'), col('gm', 'Gross margin', 'pct'), col('opex', 'Opex', 'currency'), col('ebitda', 'EBITDA', 'currency'), col('fcf', 'Free cash flow', 'currency'), col('cash', 'Ending cash', 'currency'), col('heads', 'Headcount', 'number')],
          Array.from({ length: Math.ceil(rows.length / 3) }, (_, q) => {
            const qr = rows.slice(q * 3, q * 3 + 3);
            return { period: `Q+${q + 1} (${qr[0].month}→${qr[qr.length - 1].month})`, revenue: sum(qr.map((r) => r.revenue)), gm: sum(qr.map((r) => r.gross_profit)) / sum(qr.map((r) => r.revenue)), opex: sum(qr.map((r) => r.opex)), ebitda: sum(qr.map((r) => r.ebitda)), fcf: sum(qr.map((r) => r.fcf)), cash: qr[qr.length - 1].cash_end, heads: qr[qr.length - 1].headcount };
          }))],
        insights: [
          `Model is anchored on actuals through ${b.month}: MRR ${fmtMoney(b.mrr)}, blended gross margin ${fmtPct(b.gm)}, opex ${fmtMoney(b.opex)}/month.`,
          `Subscription gross margin is ${fmtPct(b.subGm)} vs ${fmtPct(b.otherGm)} on hardware & services — mix shift toward subscription lifts blended margin.`,
          ebitdaBreakeven ? `EBITDA turns positive in ${ebitdaBreakeven.month} under these drivers.` : `EBITDA stays negative through the horizon; minimum cash ${fmtMoney(Math.min(...rows.map((r) => r.cash_end)))}.`,
        ],
        actions: ['Lock this as the base case and save the driver set for reforecasting.', 'Run Scenario Planning to bracket upside/downside.', 'Feed the model into Board Pack Builder for the next meeting.'],
      });
    },
  },

  'budget-planning': {
    params: [
      { key: 'growthTarget', label: 'FY revenue growth target', type: 'number', min: 10, max: 80, step: 5, default: 35, unit: '%' },
      { key: 'opexRatio', label: 'Opex as % of revenue', type: 'number', min: 50, max: 130, step: 5, default: 85, unit: '%' },
    ],
    run(ds, p) {
      const ttm = lastN(ds.fin, 12);
      const ttmRev = sum(ttm.map((r) => r.revenue));
      const ttmOpex = sum(ttm.map((r) => r.opex));
      const target = ttmRev * (1 + p.growthTarget / 100);
      const opexBudget = target * p.opexRatio / 100;
      const byDept = groupBy(ds.opex.filter((r) => ttm.some((t) => t.month === r.month)), 'dept');
      const rows = [...byDept.entries()].map(([dept, rs]) => {
        const actual = sum(rs.map((r) => r.amount));
        return { dept, actual, share: actual / ttmOpex };
      });
      // growth-weighted allocation: GTM gets more when growth target is ambitious
      const tilt = { Sales: 1 + (p.growthTarget - 30) / 200, Marketing: 1 + (p.growthTarget - 30) / 160, 'R&D': 1, 'G&A': 0.93, 'Customer Success': 1.02 };
      const raw = rows.map((r) => r.share * (tilt[r.dept] || 1));
      const norm = sum(raw);
      rows.forEach((r, i) => { r.budget = opexBudget * raw[i] / norm; r.change = r.budget / r.actual - 1; r.monthly = r.budget / 12; });
      const payroll = sum(ds.opex.filter((r) => r.line === 'Payroll' && ttm.some((t) => t.month === r.month)).map((r) => r.amount));
      const costPerHead = payroll / ds.last.headcount;
      const headroom = opexBudget - ttmOpex;
      const impliedHires = Math.max(0, Math.floor(headroom * 0.7 / costPerHead));
      return result({
        headline: `FY plan: ${fmtMoney(target)} revenue (+${p.growthTarget}%) with an opex envelope of ${fmtMoney(opexBudget)} — room for ~${impliedHires} net hires.`,
        kpis: [kpi('TTM revenue', ttmRev), kpi('Revenue target', target, 'currency', { delta: p.growthTarget / 100 }), kpi('TTM opex', ttmOpex), kpi('Opex budget', opexBudget, 'currency', { delta: opexBudget / ttmOpex - 1 }), kpi('Implied net hires', impliedHires, 'number'), kpi('Planned EBITDA margin', (target * ds.fin.slice(-6).reduce((a, r) => a + r.gross_profit, 0) / sum(ds.fin.slice(-6).map((r) => r.revenue)) - opexBudget) / target, 'pct')],
        charts: [bar('Department budget vs TTM actual', rows.map((r) => r.dept), [s('TTM actual', rows.map((r) => r.actual)), s('FY budget', rows.map((r) => r.budget))])],
        tables: [table('Department allocation', [col('dept', 'Department'), col('actual', 'TTM actual', 'currency'), col('budget', 'FY budget', 'currency'), col('change', 'Change', 'pct'), col('monthly', 'Monthly run-rate', 'currency')], rows)],
        insights: [
          `Allocation tilts toward Sales & Marketing because a ${p.growthTarget}% growth target needs more pipeline; G&A held below its historical share.`,
          `Fully-loaded cost per head is ${fmtMoney(costPerHead)}/year — every 10 hires adds ${fmtMoney(costPerHead * 10)} to the run-rate.`,
          headroom < 0 ? `The envelope is ${fmtMoney(-headroom)} below TTM spend: a cost-reduction plan is required to hit it.` : `Headroom of ${fmtMoney(headroom)} over TTM spend; 70% reserved for hiring, 30% for programs.`,
        ],
        actions: ['Send department templates to budget owners with these envelopes pre-filled.', 'Gate hiring plan by quarter against ARR milestones.'],
      });
    },
  },

  'cash-flow-forecast': {
    params: [
      { key: 'weeks', label: 'Horizon', type: 'number', min: 4, max: 26, step: 1, default: 13, unit: 'weeks' },
      { key: 'collectionsSlip', label: 'Collections slip', type: 'number', min: 0, max: 30, step: 5, default: 0, unit: 'days' },
    ],
    run(ds, p) {
      const L = ds.last;
      const open = ds.invoices.filter((i) => i.status !== 'paid');
      const custById = new Map(ds.customers.map((c) => [c.id, c]));
      const start = new Date('2026-10-01T00:00:00Z');
      const weeks = Array.from({ length: p.weeks }, (_, w) => ({ w: w + 1, label: `W${w + 1}`, start: new Date(start.getTime() + w * 7 * 86400000), collections: 0, newBillings: 0, payroll: 0, vendors: 0, debt: 0, other: 0 }));
      const weekOf = (d) => Math.floor((d - start) / (7 * 86400000));
      // collections on open AR using each customer's historical payment behaviour
      for (const inv of open) {
        const c = custById.get(inv.customer_id);
        const terms = c.segment === 'Enterprise' ? 45 : 30;
        let pay = new Date(new Date(inv.issue_date).getTime() + (c.dso_days + p.collectionsSlip) * 86400000);
        if (pay < start) pay = new Date(start.getTime() + (inv.status === 'overdue' ? 14 : 3) * 86400000);
        const wk = weekOf(pay);
        if (wk >= 0 && wk < p.weeks) weeks[wk].collections += inv.amount * (inv.status === 'overdue' && pay - new Date(inv.due_date) > 60 * 86400000 ? 0.85 : 1);
        void terms;
      }
      // future billings: monthly invoices on the 1st collected after avg DSO
      const avgDso = L.ar_balance / L.revenue * 30 + p.collectionsSlip;
      for (let m = 0; m < Math.ceil(p.weeks / 4.3) + 1; m++) {
        const bill = new Date(Date.UTC(2026, 9 + m, 1));
        const amt = L.revenue * (1 + 0.02) ** (m + 1);
        const wk = weekOf(new Date(bill.getTime() + avgDso * 86400000));
        if (wk >= 0 && wk < p.weeks) weeks[wk].newBillings += amt;
      }
      const payrollMonthly = sum(ds.opex.filter((r) => r.month === L.month && r.line === 'Payroll').map((r) => r.amount));
      const openBills = ds.bills.filter((b) => b.status === 'open');
      for (const b of openBills) { const wk = weekOf(new Date(b.due_date)); weeks[Math.max(0, Math.min(p.weeks - 1, wk))].vendors += b.amount; }
      const nonPayroll = L.opex - payrollMonthly + L.cogs;
      weeks.forEach((w, i) => {
        if (i % 2 === 1) w.payroll = payrollMonthly / 2.17;
        w.vendors += nonPayroll / 4.33 * (i < 4 ? 0.45 : 1); // near-term partly covered by open bills
        if (w.start.getUTCDate() <= 7) { w.debt = 5000000 / 30 + L.interest; w.other = L.capex || 90000; }
      });
      let cash = L.cash_end;
      for (const w of weeks) {
        w.inflow = w.collections + w.newBillings;
        w.outflow = w.payroll + w.vendors + w.debt + w.other;
        w.net = w.inflow - w.outflow;
        w.begin = cash;
        cash += w.net;
        w.end = cash;
      }
      const minW = weeks.reduce((a, b) => (b.end < a.end ? b : a));
      const net = cash - L.cash_end;
      return result({
        headline: `${p.weeks}-week cash forecast: ending cash ${fmtMoney(cash)} (${net >= 0 ? '+' : ''}${fmtMoney(net)}); low point ${fmtMoney(minW.end)} in ${minW.label}.`,
        kpis: [kpi('Opening cash', L.cash_end), kpi('Total receipts', sum(weeks.map((w) => w.inflow))), kpi('Total disbursements', sum(weeks.map((w) => w.outflow))), kpi('Ending cash', cash, 'currency', { delta: net / L.cash_end }), kpi('Low point', minW.end, 'currency', { tone: minW.end < 8e6 ? 'bad' : 'neutral' }), kpi('Open AR in forecast', sum(open.map((i) => i.amount)))],
        charts: [
          stacked('Weekly receipts vs disbursements', weeks.map((w) => w.label), [s('Collections (open AR)', weeks.map((w) => w.collections)), s('New billings collected', weeks.map((w) => w.newBillings)), s('Payroll', weeks.map((w) => -w.payroll)), s('Vendors', weeks.map((w) => -w.vendors)), s('Debt & capex', weeks.map((w) => -(w.debt + w.other)))]),
          line('Ending cash by week', weeks.map((w) => w.label), [s('Cash', weeks.map((w) => w.end))]),
        ],
        tables: [table('13-week view', [col('label', 'Week'), col('begin', 'Opening', 'currency'), col('inflow', 'Receipts', 'currency'), col('payroll', 'Payroll', 'currency'), col('vendors', 'Vendors', 'currency'), col('net', 'Net', 'currency'), col('end', 'Closing', 'currency')], weeks)],
        insights: [
          `Collections are modelled invoice-by-invoice using each customer's historical DSO (${open.length} open invoices, ${fmtMoney(sum(open.map((i) => i.amount)))}).`,
          `Payroll lands bi-weekly at ~${fmtMoney(payrollMonthly / 2.17)}; ${openBills.length} open vendor bills are scheduled on due date.`,
          p.collectionsSlip ? `A ${p.collectionsSlip}-day collections slip moves the low point to ${fmtMoney(minW.end)}.` : 'Try a 15-day collections slip to stress-test the low point against the $8M covenant.',
        ],
        actions: ['Share the forecast with Treasury and refresh weekly from the bank feed.', 'Escalate the top overdue invoices via the Accounts Receivable Agent.'],
      });
    },
  },

  'revenue-forecasting': {
    params: [
      { key: 'months', label: 'Horizon', type: 'number', min: 6, max: 24, step: 3, default: 12, unit: 'months' },
      { key: 'method', label: 'Method', type: 'select', options: ['Cohort build-up', 'Trend (regression)', 'Blend'], default: 'Blend' },
    ],
    run(ds, p) {
      const f = ds.fin;
      const L = ds.last;
      const recent = lastN(f, 6);
      const newMrr = avg(recent.map((r) => r.new_mrr));
      const expRate = avg(recent.map((r) => r.expansion_mrr / r.mrr));
      const churnRate = avg(recent.map((r) => r.churned_mrr / r.mrr));
      const reg = linreg(lastN(f, 18).map((r) => r.revenue));
      const other = avg(recent.map((r) => r.revenue_services + r.revenue_hardware));
      let mrr = L.mrr;
      const rows = [];
      for (let t = 1; t <= p.months; t++) {
        mrr = mrr * (1 + expRate - churnRate) + newMrr * (1 + 0.012 * t);
        const cohort = mrr + other * (1 + 0.01 * t);
        const trend = reg.predict(17 + t);
        const v = p.method === 'Cohort build-up' ? cohort : p.method === 'Trend (regression)' ? trend : (cohort * 0.6 + trend * 0.4);
        const sd = v * 0.012 * Math.sqrt(t);
        rows.push({ month: monthAdd(L.month, t), forecast: v, low: v - 1.64 * sd, high: v + 1.64 * sd, cohort, trend, mrr });
      }
      const hist = lastN(f, 12);
      const fy = sum(rows.slice(0, 12).map((r) => r.forecast));
      return result({
        headline: `Next-12-month revenue forecast ${fmtMoney(fy)} (${p.method}); exit ARR ${fmtMoney(rows[rows.length - 1].mrr * 12)}.`,
        kpis: [kpi('Last-month revenue', L.revenue), kpi('Forecast (next 12 mo)', fy, 'currency', { delta: fy / sum(hist.map((r) => r.revenue)) - 1 }), kpi('New MRR / month', newMrr), kpi('Expansion rate / mo', expRate, 'pct'), kpi('Churn rate / mo', churnRate, 'pct'), kpi('Trend fit (R²)', reg.r2, 'number', { decimals: 3 })],
        charts: [line('Revenue forecast with 90% band', [...hist.map((r) => r.month), ...rows.map((r) => r.month)], [
          s('Actual', [...hist.map((r) => r.revenue), ...rows.map(() => null)]),
          s('Forecast', [...hist.map(() => null), ...rows.map((r) => r.forecast)], { dashed: true }),
          s('Low (5%)', [...hist.map(() => null), ...rows.map((r) => r.low)], { band: true }),
          s('High (95%)', [...hist.map(() => null), ...rows.map((r) => r.high)], { band: true }),
        ])],
        tables: [table('Forecast detail', [col('month', 'Month'), col('cohort', 'Cohort build-up', 'currency'), col('trend', 'Trend', 'currency'), col('forecast', 'Forecast', 'currency'), col('low', 'Low', 'currency'), col('high', 'High', 'currency')], rows)],
        insights: [
          `Cohort build-up: start MRR ${fmtMoney(L.mrr)} + ${fmtMoney(newMrr)}/mo new bookings, ${fmtPct(expRate, 2)} expansion and ${fmtPct(churnRate, 2)} churn per month.`,
          `Linear trend on 18 months explains ${fmtPct(reg.r2)} of variance — strong momentum, but trend models miss churn shocks, so the blend weights cohorts 60/40.`,
          `Services & hardware contribute ~${fmtMoney(other)}/mo and are forecast separately with lower confidence.`,
        ],
        actions: ['Publish this forecast to the Forecast Accuracy Agent to track error over time.', 'Overlay CRM pipeline coverage for next quarter bookings.'],
      });
    },
  },

  'scenario-planning': {
    params: [
      { key: 'months', label: 'Horizon', type: 'number', min: 12, max: 36, step: 6, default: 24, unit: 'months' },
      { key: 'downside', label: 'Downside growth hit', type: 'number', min: 0, max: 3, step: 0.25, default: 1.5, unit: 'pts/mo' },
      { key: 'upside', label: 'Upside growth lift', type: 'number', min: 0, max: 3, step: 0.25, default: 0.75, unit: 'pts/mo' },
    ],
    run(ds, p) {
      const sc = [
        { name: 'Downside', d: { growthDelta: -p.downside / 100, churnDelta: 0.003, hires: 0, opexGrowth: 0.002 } },
        { name: 'Base', d: { hires: 2 } },
        { name: 'Upside', d: { growthDelta: p.upside / 100, hires: 4 } },
        { name: 'Efficiency', d: { growthDelta: -0.004, hires: 0, opexCut: 0.08, opexGrowth: 0 } },
      ].map((x) => ({ ...x, ...project(ds, p.months, x.d) }));
      for (const x of sc) {
        x.runway = runwayFrom(x.rows, 0);
        x.endArr = x.rows[x.rows.length - 1].arr;
        x.minCash = Math.min(...x.rows.map((r) => r.cash_end));
        x.be = x.rows.find((r) => r.ebitda > 0)?.month ?? 'Not in horizon';
        x.covenant = x.rows.find((r) => r.cash_end < 8e6)?.month ?? 'No breach';
      }
      const months = sc[0].rows.map((r) => r.month);
      const base = sc[1];
      return result({
        headline: `Base case ends at ${fmtMoney(base.endArr)} ARR; ${sc[0].covenant === 'No breach' ? 'even the downside stays above the $8M min-cash covenant' : 'the downside breaches the $8M min-cash covenant in ' + sc[0].covenant}.`,
        kpis: sc.map((x) => kpi(`${x.name} exit ARR`, x.endArr)).concat([kpi('Downside min cash', sc[0].minCash, 'currency', { tone: sc[0].minCash < 8e6 ? 'bad' : 'good' }), kpi('Base min cash', base.minCash)]),
        charts: [
          line('Cash balance by scenario', months, sc.map((x) => s(x.name, x.rows.map((r) => r.cash_end)))),
          line('ARR by scenario', months, sc.map((x) => s(x.name, x.rows.map((r) => r.arr)))),
        ],
        tables: [table('Scenario comparison', [col('name', 'Scenario'), col('growth', 'MRR growth / mo', 'pct'), col('endArr', 'Exit ARR', 'currency'), col('minCash', 'Min cash', 'currency'), col('be', 'EBITDA breakeven'), col('covenant', '$8M covenant')], sc.map((x) => ({ name: x.name, growth: x.growth, endArr: x.endArr, minCash: x.minCash, be: x.be, covenant: x.covenant })))],
        insights: [
          `Spread between upside and downside exit ARR is ${fmtMoney(sc[2].endArr - sc[0].endArr)} — that's the planning range to communicate to the board.`,
          `The Efficiency case (8% opex cut, hiring freeze) trades ${fmtMoney(base.endArr - sc[3].endArr)} of exit ARR for ${fmtMoney(sc[3].minCash - base.minCash)} more trough cash.`,
          `Trigger points: if trailing 3-month MRR growth falls below ${fmtPct(base.growth - p.downside / 200, 2)}, move to the Efficiency playbook.`,
        ],
        actions: ['Agree trigger metrics and pre-approved actions for each scenario.', 'Share the scenario deck with the CFO Decision Support Agent.'],
      });
    },
  },

  'break-even': {
    params: [
      { key: 'priceChange', label: 'Price change', type: 'number', min: -20, max: 30, step: 5, default: 0, unit: '%' },
      { key: 'opexCut', label: 'Fixed cost reduction', type: 'number', min: 0, max: 25, step: 2.5, default: 0, unit: '%' },
    ],
    run(ds, p) {
      const b = baseline(ds);
      const fixed = b.opex * (1 - p.opexCut / 100);
      const cmRatio = b.gm + p.priceChange / 100 * (1 - b.gm) / (1 + p.priceChange / 100);
      const beRevenue = fixed / cmRatio;
      const cur = ds.last.revenue;
      const gap = beRevenue - cur;
      const growth = cmgr(lastN(ds.fin, 7).map((r) => r.revenue));
      const monthsTo = gap <= 0 ? 0 : Math.log(beRevenue / cur) / Math.log(1 + growth);
      const arpa = ds.last.mrr / ds.last.customers;
      const custNeeded = Math.ceil(gap / arpa);
      const pts = Array.from({ length: 11 }, (_, i) => cur * (0.6 + i * 0.12));
      // hardware unit break-even
      const hw = ds.products.filter((x) => x.kind === 'hardware').map((x) => ({ sku: x.sku, name: x.name, price: x.price * (1 - x.list_discount), cost: x.unit_cost, cm: x.price * (1 - x.list_discount) - x.unit_cost }));
      return result({
        headline: gap <= 0 ? `Already above break-even: revenue ${fmtMoney(cur)} vs break-even ${fmtMoney(beRevenue)}/month.` : `Break-even at ${fmtMoney(beRevenue)}/month revenue — ${fmtMoney(gap)} above today, ~${monthsTo.toFixed(1)} months at current growth.`,
        kpis: [kpi('Monthly fixed costs', fixed), kpi('Contribution margin', cmRatio, 'pct'), kpi('Break-even revenue / mo', beRevenue), kpi('Current revenue / mo', cur), kpi('Gap to close', Math.max(0, gap), 'currency', { tone: gap > 0 ? 'bad' : 'good' }), kpi('Months to break-even', monthsTo, 'months')],
        charts: [line('Cost-volume-profit', pts.map((x) => fmtMoney(x)), [s('Revenue', pts), s('Total costs', pts.map((x) => fixed + x * (1 - cmRatio))), s('Profit', pts.map((x) => x * cmRatio - fixed))])],
        tables: [table('Hardware unit economics', [col('name', 'Product'), col('price', 'Net price', 'currency'), col('cost', 'Unit cost', 'currency'), col('cm', 'Contribution / unit', 'currency')], hw)],
        insights: [
          `Equivalent to ~${custNeeded} additional customers at today's ARPA of ${fmtMoney(arpa)}/month.`,
          `Each 1% of fixed cost removed lowers break-even revenue by ${fmtMoney(b.opex * 0.01 / cmRatio)}.`,
          p.priceChange ? `A ${p.priceChange}% price change shifts contribution margin to ${fmtPct(cmRatio)} (before volume effects).` : 'Try a 10% price increase to see contribution leverage.',
        ],
        actions: ['Pair with Pricing Strategy Agent to test price-led paths to break-even.', 'Use Cost Reduction Agent to size fixed-cost levers.'],
      });
    },
  },

  'runway-calculator': {
    params: [
      { key: 'hires', label: 'Net hires / month', type: 'number', min: 0, max: 10, step: 1, default: 2, unit: 'heads' },
      { key: 'growthDelta', label: 'Growth change', type: 'number', min: -3, max: 3, step: 0.25, default: 0, unit: 'pts/mo' },
      { key: 'raise', label: 'New funding', type: 'number', min: 0, max: 50, step: 5, default: 0, unit: '$M' },
    ],
    run(ds, p) {
      const L = ds.last;
      const trailingBurn = avg([1, 2, 3].map((k) => burnAt(ds, ds.fin.length - k)));
      const simple = trailingBurn > 0 ? L.cash_end / trailingBurn : Infinity;
      const { rows } = project(ds, 60, { hires: p.hires, growthDelta: p.growthDelta / 100, extraCash: p.raise * 1e6 });
      const runway = runwayFrom(rows, 0);
      const covenant = runwayFrom(rows, 8e6);
      const zero = rows.find((r) => r.cash_end < 0);
      const be = rows.find((r) => r.fcf > 0);
      const shown = rows.slice(0, Math.min(60, Math.max(24, Number.isFinite(runway) ? Math.ceil(runway) + 3 : 36)));
      return result({
        headline: Number.isFinite(runway) ? `${runway.toFixed(1)} months of runway (cash-out ${zero?.month}); the $8M covenant is hit in ${covenant.toFixed(1)} months.` : `Default alive: the model reaches cash-flow breakeven (${be?.month}) before cash runs out.`,
        kpis: [kpi('Cash on hand', L.cash_end), kpi('Trailing 3-mo net burn', trailingBurn), kpi('Simple runway', simple, 'months'), kpi('Modelled runway', runway, 'months', { tone: runway < 18 ? 'bad' : 'good' }), kpi('Months to covenant floor', covenant, 'months', { tone: covenant < 12 ? 'bad' : 'neutral' }), kpi('Cash-flow breakeven', be ? be.month : 'Beyond 5 yrs', 'text')],
        charts: [line('Projected cash balance', shown.map((r) => r.month), [s('Cash', shown.map((r) => r.cash_end)), s('Covenant floor', shown.map(() => 8e6), { dashed: true })])],
        tables: [table('Runway sensitivity to hiring', [col('hires', 'Net hires / mo', 'number'), col('runway', 'Runway (months)', 'months'), col('covenant', 'To $8M floor', 'months'), col('be', 'FCF breakeven')],
          [0, 2, 4, 6].map((h) => { const pr = project(ds, 60, { hires: h, growthDelta: p.growthDelta / 100, extraCash: p.raise * 1e6 }).rows; return { hires: h, runway: runwayFrom(pr, 0), covenant: runwayFrom(pr, 8e6), be: pr.find((r) => r.fcf > 0)?.month ?? '—' }; }))],
        insights: [
          `Simple runway (cash ÷ trailing burn) is ${Number.isFinite(simple) ? simple.toFixed(1) : '∞'} months, but it ignores improving margins — the modelled view accounts for growth and hiring.`,
          `Net burn (before financing) was ${fmtMoney(burnAt(ds, ds.fin.length - 7))} six months ago vs ${fmtMoney(burnAt(ds, ds.fin.length - 1))} last month.`,
          'Venture debt amortisation (~$167K/month) is included in the cash projection.',
        ],
        actions: ['Set a 12-month-to-floor trigger for starting a fundraise.', 'Share runway view in the Investor Update Agent.'],
      });
    },
  },

  'sensitivity-analysis': {
    params: [
      { key: 'swing', label: 'Driver swing', type: 'number', min: 5, max: 50, step: 5, default: 20, unit: '%' },
      { key: 'metric', label: 'Output metric', type: 'select', options: ['12-mo EBITDA', 'Ending cash (18 mo)', 'Exit ARR (18 mo)'], default: '12-mo EBITDA' },
    ],
    run(ds, p) {
      const b = baseline(ds);
      const sw = p.swing / 100;
      const measure = (d) => {
        const { rows } = project(ds, 18, d);
        if (p.metric === '12-mo EBITDA') return sum(rows.slice(0, 12).map((r) => r.ebitda));
        if (p.metric === 'Ending cash (18 mo)') return rows[17].cash_end;
        return rows[17].arr;
      };
      const base = measure({});
      const drivers = [
        ['MRR growth rate', (k) => ({ mrrGrowth: b.mrrGrowth * (1 + k) })],
        ['Gross margin', (k) => ({ gmDelta: b.subGm * k })],
        ['Opex growth', (k) => ({ opexGrowth: 0.002 + 0.006 * k })],
        ['Price', (k) => ({ priceChange: k * 0.5 })],
        ['Churn', (k) => ({ churnDelta: b.grossChurn * k })],
        ['Hiring pace', (k) => ({ hires: Math.max(0, 2 * (1 + k * 2.5)) })],
        ['DSO', (k) => ({ dsoDelta: b.dso * k })],
      ].map(([name, fn]) => {
        const lo = measure(fn(-sw)), hi = measure(fn(sw));
        return { name, lo, hi, range: Math.abs(hi - lo) };
      }).sort((a, z) => z.range - a.range);
      return result({
        headline: `${drivers[0].name} is the biggest swing factor on ${p.metric}: ±${p.swing}% moves it by ${fmtMoney(drivers[0].range)}.`,
        kpis: [kpi(`Base ${p.metric}`, base), ...drivers.slice(0, 3).map((d) => kpi(`${d.name} range`, d.range))],
        charts: [{ type: 'tornado', title: `Tornado: ±${p.swing}% driver swing on ${p.metric}`, base, labels: drivers.map((d) => d.name), lo: drivers.map((d) => d.lo), hi: drivers.map((d) => d.hi), format: 'currency' }],
        tables: [table('Sensitivity table', [col('name', 'Driver'), col('lo', `-${p.swing}%`, 'currency'), col('hi', `+${p.swing}%`, 'currency'), col('range', 'Range', 'currency')], drivers)],
        insights: [`Top three drivers explain most of the variance: ${drivers.slice(0, 3).map((d) => d.name).join(', ')}.`, `${drivers[drivers.length - 1].name} barely moves ${p.metric} — de-prioritise it in planning debates.`],
        actions: ['Focus forecast reviews on the top-3 drivers.', 'Build trigger alerts in the KPI Dashboard Agent for these drivers.'],
      });
    },
  },

  'forecast-accuracy': {
    params: [{ key: 'horizon', label: 'Forecast horizon', type: 'select', options: ['1', '3', '6'], default: '3' }],
    run(ds, p) {
      const h = Number(p.horizon);
      const fin = new Map(ds.fin.map((r) => [r.month, r]));
      const rows = ds.forecastHistory.filter((r) => r.horizon === h && fin.has(r.month)).map((r) => {
        const a = fin.get(r.month).revenue;
        return { month: r.month, method: r.method, forecast: r.revenue_forecast, actual: a, error: r.revenue_forecast - a, ape: Math.abs(r.revenue_forecast - a) / a };
      });
      const mape = avg(rows.map((r) => r.ape));
      const bias = avg(rows.map((r) => r.error / r.actual));
      const byH = [1, 3, 6].map((hh) => { const rs = ds.forecastHistory.filter((r) => r.horizon === hh && fin.has(r.month)); return { h: hh, mape: avg(rs.map((r) => Math.abs(r.revenue_forecast - fin.get(r.month).revenue) / fin.get(r.month).revenue)), bias: avg(rs.map((r) => (r.revenue_forecast - fin.get(r.month).revenue) / fin.get(r.month).revenue)) }; });
      const within2 = rows.filter((r) => r.ape <= 0.02).length / rows.length;
      return result({
        headline: `${h}-month-ahead revenue forecasts have ${fmtPct(mape)} MAPE with ${bias > 0 ? 'an optimistic' : 'a conservative'} bias of ${fmtPct(Math.abs(bias))}.`,
        kpis: [kpi('MAPE', mape, 'pct'), kpi('Bias', bias, 'pct', { tone: Math.abs(bias) > 0.02 ? 'bad' : 'good' }), kpi('Within ±2%', within2, 'pct'), kpi('Forecasts scored', rows.length, 'number'), kpi('Worst miss', Math.max(...rows.map((r) => r.ape)), 'pct')],
        charts: [line(`Forecast vs actual (${h}-mo ahead)`, rows.map((r) => r.month), [s('Actual', rows.map((r) => r.actual)), s('Forecast', rows.map((r) => r.forecast), { dashed: true })]), bar('Error by horizon', byH.map((x) => `${x.h}-month`), [s('MAPE', byH.map((x) => x.mape)), s('Bias', byH.map((x) => x.bias))], 'pct')],
        tables: [table('Forecast scorecard', [col('month', 'Month'), col('method', 'Method'), col('forecast', 'Forecast', 'currency'), col('actual', 'Actual', 'currency'), col('error', 'Error', 'currency'), col('ape', 'Abs % error', 'pct')], rows)],
        insights: [`Error grows with horizon: ${byH.map((x) => `${x.h}-mo ${fmtPct(x.mape)}`).join(', ')}.`, bias > 0.01 ? 'Forecasts are systematically optimistic — apply a bias haircut or tighten pipeline conversion assumptions.' : 'Bias is small; focus on reducing variance.', `Standard deviation of error: ${fmtPct(stdev(rows.map((r) => r.error / r.actual)))}.`],
        actions: ['Add a bias correction to the Revenue Forecasting Agent.', 'Report forecast accuracy monthly in Management Reporting.'],
      });
    },
  },
};

