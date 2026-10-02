// Driver-based forward model shared by the planning, cash and strategy agents.
import { avg, cmgr, lastN, monthAdd, sum } from './fin.js';

/** Net burn for financial-statement row i, excluding debt draws/repayments (pre-financing cash burn). */
export function burnAt(ds, i) {
  const r = ds.fin[i];
  const prevDebt = i > 0 ? ds.fin[i - 1].debt_balance : r.debt_balance;
  return (r.cash_begin - r.cash_end) + (r.debt_balance - prevDebt);
}

export function baseline(ds) {
  const f = ds.fin;
  const L = ds.last;
  const last6 = lastN(f, 6);
  const mrrGrowth = cmgr(lastN(f, 7).map((r) => r.mrr));
  const otherRev = avg(last6.map((r) => r.revenue_services + r.revenue_hardware));
  const otherGrowth = cmgr(lastN(f, 12).map((r) => r.revenue_services + r.revenue_hardware));
  const gm = sum(last6.map((r) => r.gross_profit)) / sum(last6.map((r) => r.revenue));
  const subGm = 1 - sum(last6.map((r) => r.cogs_hosting + r.cogs_licenses)) / sum(last6.map((r) => r.revenue_subscription));
  const otherGm = 1 - sum(last6.map((r) => r.cogs_services + r.cogs_hardware)) / sum(last6.map((r) => r.revenue_services + r.revenue_hardware));
  const opex = avg(lastN(f, 3).map((r) => r.opex));
  const costPerHead = opex / L.headcount;
  const opexGrowth = cmgr(lastN(f, 12).map((r) => r.opex));
  const grossChurn = avg(last6.map((r) => r.churned_mrr / Math.max(1, r.mrr - r.new_mrr - r.expansion_mrr + r.churned_mrr)));
  return {
    month: L.month, cash: L.cash_end, debt: L.debt_balance, mrr: L.mrr, otherRev, otherGrowth, mrrGrowth,
    gm, subGm, otherGm, opex, opexGrowth, headcount: L.headcount, costPerHead, grossChurn,
    capex: avg(lastN(f, 6).map((r) => r.capex)), dep: L.depreciation, interest: L.interest,
    dso: L.ar_balance / L.revenue * 30, arBalance: L.ar_balance,
  };
}

/**
 * Project N months forward. Drivers (all optional):
 *  mrrGrowth  monthly MRR growth override
 *  growthDelta additive change to monthly MRR growth
 *  churnDelta additive change to monthly gross churn (reduces growth)
 *  priceChange one-off % change to subscription price (applied month 1, with elasticity-driven volume effect)
 *  gmDelta    additive change to gross margin
 *  opexGrowth monthly opex growth override
 *  hires      net new heads per month
 *  opexCut    one-off % cut to opex
 *  capexMult  multiplier on capex
 *  extraCash  one-off cash in month 1 (e.g. fundraise)
 *  dsoDelta   change in DSO days
 */
export function project(ds, months = 18, d = {}) {
  const b = baseline(ds);
  const g = (d.mrrGrowth ?? b.mrrGrowth) + (d.growthDelta ?? 0) - (d.churnDelta ?? 0);
  const opexG = d.opexGrowth ?? 0.002; // non-headcount inflation; headcount growth comes from `hires`
  const elasticity = d.elasticity ?? -0.9;
  let mrr = b.mrr * (1 + (d.priceChange ?? 0)) * (1 + (d.priceChange ?? 0) * elasticity * 0.35);
  let other = b.otherRev;
  let opex = b.opex * (1 - (d.opexCut ?? 0));
  let cash = b.cash + (d.extraCash ?? 0);
  let debt = b.debt;
  let prevAR = b.arBalance;
  let heads = b.headcount;
  const dso = Math.max(10, b.dso + (d.dsoDelta ?? 0));
  const rows = [];
  for (let t = 1; t <= months; t++) {
    mrr *= 1 + g;
    other *= 1 + b.otherGrowth * 0.8;
    const revenue = mrr + other;
    const gp = mrr * (b.subGm + (d.gmDelta ?? 0)) + other * b.otherGm;
    const newHeads = d.hires ?? 0;
    heads += newHeads;
    opex = opex * (1 + opexG) + newHeads * b.costPerHead;
    const ebitda = gp - opex;
    const capex = b.capex * (d.capexMult ?? 1);
    const debtPay = Math.min(debt, 5000000 / 30);
    debt -= debtPay;
    const interest = debt * 0.105 / 12;
    const ar = revenue * dso / 30;
    const wc = ar - prevAR;
    prevAR = ar;
    const fcf = ebitda - capex - interest - wc;
    const cashBegin = cash;
    cash = cash + fcf - debtPay;
    rows.push({
      month: monthAdd(b.month, t), mrr, arr: mrr * 12, revenue, gross_profit: gp, gm: gp / revenue, opex, ebitda,
      ebitda_margin: ebitda / revenue, capex, interest, wc_change: wc, fcf, debt_paydown: debtPay, cash_begin: cashBegin,
      cash_end: cash, headcount: heads, net_burn: -(fcf - debtPay),
    });
  }
  return { baseline: b, rows, growth: g };
}

/** Months until cash < floor given a projection (Infinity if never within horizon). */
export function runwayFrom(rows, floor = 0) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].cash_end < floor) {
      const prev = i === 0 ? rows[0].cash_begin : rows[i - 1].cash_end;
      const burn = prev - rows[i].cash_end;
      return i + (burn > 0 ? (prev - floor) / burn : 0);
    }
  }
  return Infinity;
}
