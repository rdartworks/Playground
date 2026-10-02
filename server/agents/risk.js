import { daysBetween, fmtMoney, fmtPct, lastN, sum, sumBy } from '../lib/fin.js';
import { saasSnapshot } from './reporting.js';
import { bar, col, donut, kpi, result, s, table } from './out.js';

export default {
  'risk-assessment': {
    params: [{ key: 'appetite', label: 'Risk appetite (max score)', type: 'number', min: 6, max: 16, step: 1, default: 12, unit: 'score' }],
    run(ds, p) {
      const k = saasSnapshot(ds);
      const L = ds.last.month;
      const active = ds.customers.filter((c) => ds.mrrByCustomer.get(c.id)?.has(L)).map((c) => ds.mrrByCustomer.get(c.id).get(L)).sort((a, b) => b - a);
      const top10 = sum(active.slice(0, 10)) / sum(active);
      const dso = ds.last.ar_balance / ds.last.revenue * 30;
      // data-driven adjustments to the register
      const rows = ds.risks.map((r) => {
        let { likelihood } = r;
        let evidence = '';
        if (r.category === 'Customer') { likelihood = top10 > 0.25 ? 4 : 2; evidence = `Top-10 = ${fmtPct(top10)} of MRR`; }
        if (r.category === 'Credit') { likelihood = dso > 45 ? 4 : 3; evidence = `DSO ${dso.toFixed(0)} days`; }
        if (r.category === 'Covenant') { likelihood = k.cash < 12e6 ? 4 : 2; evidence = `Cash ${fmtMoney(k.cash)} vs $8M floor`; }
        if (r.category === 'Liquidity') { likelihood = k.burnMultiple > 1.5 ? 4 : 3; evidence = `Burn multiple ${k.burnMultiple.toFixed(2)}x`; }
        const score = likelihood * r.impact;
        return { ...r, likelihood, score, evidence, rating: score >= 15 ? 'Critical' : score >= 10 ? 'High' : score >= 6 ? 'Medium' : 'Low', outside: score > p.appetite ? 'Yes' : '' };
      }).sort((a, b) => b.score - a.score);
      return result({
        headline: `${rows.filter((r) => r.outside).length} of ${rows.length} risks sit outside appetite (score > ${p.appetite}); top risk: ${rows[0].risk}.`,
        kpis: [kpi('Risks tracked', rows.length, 'number'), kpi('Critical', rows.filter((r) => r.rating === 'Critical').length, 'number', { tone: 'bad' }), kpi('High', rows.filter((r) => r.rating === 'High').length, 'number'), kpi('Outside appetite', rows.filter((r) => r.outside).length, 'number', { tone: rows.some((r) => r.outside) ? 'bad' : 'good' }), kpi('Data-driven scores', rows.filter((r) => r.evidence).length, 'number')],
        charts: [{ type: 'riskmatrix', title: 'Risk heat map (likelihood × impact)', points: rows.map((r) => ({ label: r.category, x: r.likelihood, y: r.impact, rating: r.rating })) }],
        tables: [table('Risk register', [col('category', 'Category'), col('risk', 'Risk'), col('likelihood', 'L', 'number'), col('impact', 'I', 'number'), col('score', 'Score', 'number'), col('rating', 'Rating', 'status'), col('evidence', 'Live evidence'), col('owner', 'Owner'), col('mitigation', 'Mitigation')], rows)],
        insights: ['Likelihood for liquidity, covenant, credit and concentration risks is recalculated from live financial data every run.', `Customer concentration: top-10 customers are ${fmtPct(top10)} of MRR.`],
        actions: ['Assign mitigation deadlines for risks outside appetite.', 'Include the heat map in the Board Pack.'],
      });
    },
  },

  'internal-controls': {
    params: [{ key: 'area', label: 'Process area', type: 'select', options: ['All', 'Revenue', 'Procure-to-Pay', 'Payroll', 'Treasury', 'Financial Reporting', 'IT General', 'Inventory', 'Tax'], default: 'All' }],
    run(ds, p) {
      const ctl = ds.controls.filter((c) => p.area === 'All' || c.area === p.area);
      const byResult = sumBy(ctl, 'result', () => 1);
      const areas = [...new Set(ds.controls.map((c) => c.area))];
      const dupBill = ds.bills.filter((b, i, arr) => arr.some((x) => x.id < b.id && x.vendor_id === b.vendor_id && x.amount === b.amount && Math.abs(daysBetween(x.issue_date, b.issue_date)) < 30));
      const tests = [
        { test: 'Duplicate vendor payments (PC-03)', population: ds.bills.length, exceptions: dupBill.length, detail: dupBill.map((b) => `BILL-${b.id} ${fmtMoney(b.amount)}`).join(', ') || 'None' },
        { test: 'Bills > $10K without PO (PC-01)', population: ds.bills.filter((b) => b.amount > 10000).length, exceptions: ds.bills.filter((b) => b.amount > 10000 && !b.po_number).length, detail: 'Three-way match bypassed' },
        { test: 'Round-dollar bills ≥ $25K', population: ds.bills.length, exceptions: ds.bills.filter((b) => b.amount >= 25000 && b.amount % 1000 === 0).length, detail: 'Fraud indicator review' },
        { test: 'Invoices paid > 120 days after due', population: ds.invoices.length, exceptions: ds.invoices.filter((i) => i.paid_date && daysBetween(i.due_date, i.paid_date) > 120).length, detail: 'Credit control effectiveness' },
        { test: 'Close tasks completed late', population: ds.closeTasks.length, exceptions: ds.closeTasks.filter((t) => t.status === 'Done (late)').length, detail: 'FR-03 timeliness' },
      ].map((t) => ({ ...t, rate: t.exceptions / Math.max(1, t.population) }));
      return result({
        headline: `${ctl.length} controls in scope: ${byResult.Effective || 0} effective, ${(byResult.Deficiency || 0) + (byResult['Significant deficiency'] || 0)} deficient, ${byResult['Not tested'] || 0} untested. Full-population tests found ${sum(tests.map((t) => t.exceptions))} exceptions.`,
        kpis: [kpi('Controls in scope', ctl.length, 'number'), kpi('Effective', (byResult.Effective || 0) / ctl.length, 'pct'), kpi('Deficiencies', (byResult.Deficiency || 0) + (byResult['Significant deficiency'] || 0), 'number', { tone: 'bad' }), kpi('Significant deficiencies', byResult['Significant deficiency'] || 0, 'number', { tone: (byResult['Significant deficiency'] || 0) ? 'bad' : 'good' }), kpi('Automated controls', ctl.filter((c) => c.automated).length / ctl.length, 'pct')],
        charts: [bar('Control results by area', areas, ['Effective', 'Deficiency', 'Significant deficiency', 'Not tested'].map((r) => s(r, areas.map((a) => ds.controls.filter((c) => c.area === a && c.result === r).length))), 'number', { stacked: true })],
        tables: [table('Full-population control tests', [col('test', 'Test'), col('population', 'Population', 'number'), col('exceptions', 'Exceptions', 'number'), col('rate', 'Rate', 'pct'), col('detail', 'Detail')], tests), table('Control register', [col('id', 'ID'), col('area', 'Area'), col('name', 'Control'), col('owner', 'Owner'), col('frequency', 'Frequency'), col('risk', 'Risk'), col('last_tested', 'Last tested'), col('result', 'Result', 'status'), col('exceptions', 'Exceptions', 'number')], ctl)],
        insights: ['Agent tests 100% of transactions rather than a sample — exceptions are listed by document.', `Duplicate-payment test caught ${dupBill.length} item(s) the manual control missed.`],
        actions: ['Open remediation tickets for each deficiency.', 'Schedule untested controls before quarter-end.'],
      });
    },
  },

  'audit-prep': {
    params: [{ key: 'materiality', label: 'Planning materiality', type: 'number', min: 0.5, max: 3, step: 0.25, default: 1, unit: '% of revenue' }],
    run(ds, p) {
      const ttmRev = sum(lastN(ds.fin, 12).map((r) => r.revenue));
      const mat = ttmRev * p.materiality / 100;
      const perf = mat * 0.75;
      const L = ds.last;
      const pbc = [
        ['Trial balance & GL detail', 'Controller', 'Ready'], ['Bank confirmations & reconciliations', 'Senior Accountant', 'Ready'], ['AR aging & subsequent receipts', 'Billing Ops', 'Ready'],
        ['Revenue contracts sample (25)', 'Controller', 'In progress'], ['Deferred revenue rollforward', 'Senior Accountant', 'Ready'], ['Fixed asset register & additions', 'Staff Accountant', 'In progress'],
        ['Inventory count & valuation', 'Ops Accountant', 'Not started'], ['Debt agreements & covenant calcs', 'Treasury', 'Ready'], ['Equity rollforward & stock comp', 'Controller', 'In progress'],
        ['Payroll registers & headcount rec', 'People Ops', 'Ready'], ['Legal letters', 'Legal Counsel', 'Not started'], ['Tax provision workpapers', 'Tax Manager', 'Not started'],
        ['Accrued liabilities support', 'Senior Accountant', 'In progress'], ['Related party questionnaire', 'CFO', 'Not started'], ['IT general controls evidence', 'IT Admin', 'In progress'],
      ].map(([item, owner, status], i) => ({ id: `PBC-${String(i + 1).padStart(2, '0')}`, item, owner, status }));
      const balances = [
        { account: 'Cash', balance: L.cash_end }, { account: 'Accounts receivable', balance: L.ar_balance }, { account: 'Inventory', balance: L.inventory_balance },
        { account: 'Accounts payable', balance: L.ap_balance }, { account: 'Deferred revenue', balance: L.deferred_revenue }, { account: 'Debt', balance: L.debt_balance },
      ].map((b) => ({ ...b, inScope: b.balance > perf ? 'Significant' : 'Analytical', multiple: b.balance / mat }));
      const ready = pbc.filter((x) => x.status === 'Ready').length / pbc.length;
      return result({
        headline: `Audit readiness ${fmtPct(ready, 0)}: ${pbc.filter((x) => x.status === 'Ready').length}/${pbc.length} PBC items ready. Planning materiality ${fmtMoney(mat)}; ${balances.filter((b) => b.inScope === 'Significant').length} significant balances.`,
        kpis: [kpi('Readiness', ready, 'pct', { tone: ready > 0.7 ? 'good' : 'bad' }), kpi('Planning materiality', mat), kpi('Performance materiality', perf), kpi('Clearly trivial threshold', mat * 0.05), kpi('Items not started', pbc.filter((x) => x.status === 'Not started').length, 'number', { tone: 'bad' })],
        charts: [donut('PBC status', ['Ready', 'In progress', 'Not started'], ['Ready', 'In progress', 'Not started'].map((s2) => pbc.filter((x) => x.status === s2).length), 'number')],
        tables: [table('PBC list', [col('id', 'ID'), col('item', 'Request'), col('owner', 'Owner'), col('status', 'Status', 'status')], pbc), table('Scoping of balances', [col('account', 'Account'), col('balance', 'Balance', 'currency'), col('multiple', '× materiality', 'multiple'), col('inScope', 'Approach', 'status')], balances)],
        insights: ['Agent pre-builds lead schedules and ties them to the trial balance.', `Control deficiencies from the Internal Controls Agent should be discussed with auditors before fieldwork.`],
        actions: ['Chase owners of not-started items.', 'Upload ready items to the auditor portal.'],
      });
    },
  },

  'tax-planning': {
    params: [{ key: 'rdShare', label: 'Qualifying R&D share of R&D payroll', type: 'number', min: 30, max: 90, step: 5, default: 65, unit: '%' }],
    run(ds, p) {
      const ttm = lastN(ds.fin, 12);
      const pretax = sum(ttm.map((r) => r.net_income + r.taxes));
      const rdPayroll = sum(ds.opex.filter((r) => r.dept === 'R&D' && r.line === 'Payroll' && ttm.some((t) => t.month === r.month)).map((r) => r.amount));
      const qre = rdPayroll / 1.21 * p.rdShare / 100;
      const ascCredit = 0.14 * Math.max(0, qre - 0.5 * qre * 0.85); // ASC simplified method with prior-year base ~85% of current
      const payrollOffset = Math.min(500000, ascCredit);
      const nolBalance = 41e6 + Math.max(0, -pretax);
      const sec174 = rdPayroll * 0.9;
      const rows = ds.tax.map((t) => ({ ...t, liability: t.type.includes('Sales') || t.type.includes('VAT') || t.type.includes('GST') ? t.base * t.rate * 0.35 : t.type.includes('B&O') || t.type.includes('Franchise') ? t.base * t.rate : 0, status: t.nexus ? 'Registered' : 'Nexus review needed', daysToDue: daysBetween('2026-09-30', t.next_due) }));
      const unregistered = rows.filter((r) => !r.nexus);
      const exposure = sum(unregistered.map((r) => r.base * r.rate * 0.35 * 1.2));
      return result({
        headline: `Estimated R&D credit of ${fmtMoney(ascCredit)} (up to ${fmtMoney(payrollOffset)} usable against payroll tax); ${unregistered.length} jurisdictions need nexus review with ~${fmtMoney(exposure)} potential exposure.`,
        kpis: [kpi('TTM pre-tax income', pretax), kpi('Qualified research expenses', qre), kpi('Federal R&D credit (est.)', ascCredit, 'currency', { tone: 'good' }), kpi('Payroll tax offset', payrollOffset, 'currency', { tone: 'good' }), kpi('NOL carryforward (est.)', nolBalance), kpi('Nexus exposure', exposure, 'currency', { tone: exposure > 0 ? 'bad' : 'good' })],
        charts: [bar('Indirect / state tax by jurisdiction', rows.filter((r) => r.liability > 0).map((r) => `${r.jurisdiction} ${r.type}`), [s('Est. annual liability', rows.filter((r) => r.liability > 0).map((r) => r.liability))])],
        tables: [table('Jurisdiction calendar', [col('jurisdiction', 'Jurisdiction'), col('type', 'Tax'), col('rate', 'Rate', 'pct'), col('filing', 'Filing'), col('next_due', 'Next due'), col('daysToDue', 'Days', 'number'), col('status', 'Status', 'status')], rows)],
        insights: [`Section 174 requires capitalising ~${fmtMoney(sec174)} of R&D costs — this shrinks NOL usage but the company remains in a loss position.`, 'As a qualified small business, the R&D credit can offset up to $500K of employer payroll tax per year.', `Washington, Illinois and Germany sales exceed typical economic nexus thresholds — register or file VDAs.`],
        actions: ['Engage tax advisor to file voluntary disclosure agreements.', 'Document R&D projects quarterly for credit substantiation.'],
      });
    },
  },

  'compliance-review': {
    params: [],
    run(ds) {
      const L = ds.last;
      const ttmRev = sum(lastN(ds.fin, 12).map((r) => r.revenue));
      const termLoan = ds.debt.find((d) => d.type === 'Term loan');
      const eligibleAr = sum(ds.invoices.filter((i) => i.status !== 'paid' && daysBetween(i.due_date, '2026-09-30') <= 90).map((i) => i.amount));
      const g3 = lastN(ds.fin, 4);
      const checks = [
        { area: 'Debt covenant', requirement: 'Minimum cash ≥ $8.0M', actual: fmtMoney(L.cash_end), status: L.cash_end >= 8e6 ? (L.cash_end < 10e6 ? 'Watch' : 'Compliant') : 'Breach' },
        { area: 'Debt covenant', requirement: '3-mo trailing revenue growth > 0', actual: fmtPct(g3[3].revenue / g3[0].revenue - 1), status: g3[3].revenue > g3[0].revenue ? 'Compliant' : 'Breach' },
        { area: 'Revolver', requirement: 'Drawn ≤ 80% of eligible AR', actual: `${fmtMoney(1e6)} vs ${fmtMoney(eligibleAr * 0.8)} base`, status: 1e6 <= eligibleAr * 0.8 ? 'Compliant' : 'Breach' },
        { area: 'Revenue recognition', requirement: 'ASC 606 — hardware recognised on delivery, services as performed', actual: 'Policy documented; RC-01 effective', status: ds.controls.find((c) => c.id === 'RC-01').result === 'Effective' ? 'Compliant' : 'Watch' },
        { area: 'SOX-readiness', requirement: 'No significant deficiencies open', actual: `${ds.controls.filter((c) => c.result === 'Significant deficiency').length} open`, status: ds.controls.some((c) => c.result === 'Significant deficiency') ? 'Remediate' : 'Compliant' },
        { area: 'Sales tax', requirement: 'Registered in all economic-nexus states', actual: `${ds.tax.filter((t) => !t.nexus).length} jurisdictions unregistered`, status: ds.tax.some((t) => !t.nexus) ? 'Remediate' : 'Compliant' },
        { area: 'Payroll', requirement: 'Filings current in all employee locations', actual: '5 locations, all current', status: 'Compliant' },
        { area: 'Data privacy', requirement: 'DPA in place for EU/UK customers', actual: `${ds.customers.filter((c) => c.region === 'EMEA' && !c.churn_month).length} EMEA customers`, status: 'Compliant' },
        { area: 'Board', requirement: 'Quarterly lender reporting within 30 days', actual: 'Q2 delivered day 24', status: 'Compliant' },
      ];
      const counts = sumBy(checks, 'status', () => 1);
      void termLoan; void ttmRev;
      return result({
        headline: `${counts.Compliant || 0} of ${checks.length} obligations compliant; ${(counts.Remediate || 0) + (counts.Breach || 0)} needing remediation, ${counts.Watch || 0} on watch.`,
        kpis: [kpi('Obligations checked', checks.length, 'number'), kpi('Compliant', counts.Compliant || 0, 'number', { tone: 'good' }), kpi('Watch', counts.Watch || 0, 'number'), kpi('Remediate / breach', (counts.Remediate || 0) + (counts.Breach || 0), 'number', { tone: (counts.Remediate || 0) + (counts.Breach || 0) ? 'bad' : 'good' }), kpi('Covenant cash headroom', L.cash_end - 8e6)],
        charts: [donut('Compliance status', Object.keys(counts), Object.values(counts), 'number')],
        tables: [table('Compliance checklist', [col('area', 'Area'), col('requirement', 'Requirement'), col('actual', 'Actual'), col('status', 'Status', 'status')], checks)],
        insights: ['Covenant checks are recalculated from the ledger each run — no manual compliance certificate prep.', 'Sales tax registration gaps are the main remediation item; see Tax Planning Agent.'],
        actions: ['Generate the lender compliance certificate.', 'Assign remediation owners and dates.'],
      });
    },
  },
};
