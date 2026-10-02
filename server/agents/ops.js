import { avg, daysBetween, fmtMoney, fmtPct, lastN, monthAdd, sum, sumBy } from '../lib/fin.js';
import { bar, col, donut, hbar, kpi, line, result, s, table } from './out.js';

const AS_OF = '2026-09-30';

export default {
  'monthly-close': {
    params: [{ key: 'targetDay', label: 'Target close day', type: 'number', min: 4, max: 12, step: 1, default: 7, unit: 'business days' }],
    run(ds, p) {
      const tasks = ds.closeTasks.map((t) => ({ ...t, late: t.completed_day ? t.completed_day - t.due_day : null }));
      const done = tasks.filter((t) => t.status.startsWith('Done'));
      const late = tasks.filter((t) => t.status === 'Done (late)');
      const byId = new Map(tasks.map((t) => [t.id, t]));
      // critical path: longest chain of due days through dependencies
      const depth = (t) => (t.depends_on ? depth(byId.get(t.depends_on)) + 1 : 1);
      const blocked = tasks.filter((t) => !t.status.startsWith('Done') && t.depends_on && !byId.get(t.depends_on).status.startsWith('Done'));
      const projected = Math.max(...tasks.map((t) => (t.completed_day ?? t.due_day + (t.status === 'Not started' ? 1 : 0)))) + (late.length > 3 ? 1 : 0);
      const automatable = ['Bank reconciliations', 'Prepaid expense amortization', 'Fixed asset depreciation', 'FX revaluation', 'Debt interest accrual', 'Flux analysis vs prior month & budget', 'Accrue unbilled vendor costs', 'Deferred revenue rollforward'];
      tasks.forEach((t) => { t.automation = automatable.includes(t.task) ? 'Agent can automate' : 'Assist'; t.chain = depth(t); });
      const owners = sumBy(tasks.filter((t) => !t.status.startsWith('Done')), 'owner', () => 1);
      return result({
        headline: `September close is ${fmtPct(done.length / tasks.length, 0)} complete; projected to finish on day ${projected} vs a day-${p.targetDay} target. ${blocked.length} task(s) blocked by dependencies.`,
        kpis: [kpi('Tasks complete', `${done.length} / ${tasks.length}`, 'text'), kpi('Completed late', late.length, 'number', { tone: late.length ? 'bad' : 'good' }), kpi('Projected close day', projected, 'number', { tone: projected > p.targetDay ? 'bad' : 'good' }), kpi('Blocked tasks', blocked.length, 'number'), kpi('Automatable tasks', tasks.filter((t) => t.automation === 'Agent can automate').length, 'number'), kpi('Hours saved / close', tasks.filter((t) => t.automation === 'Agent can automate').length * 5.5, 'number')],
        charts: [{ type: 'gantt', title: 'Close calendar (business days)', tasks: tasks.map((t) => ({ label: t.task, start: Math.max(0, t.due_day - 1), end: t.completed_day ?? t.due_day, status: t.status })), target: p.targetDay }, hbar('Open tasks by owner', Object.keys(owners), Object.values(owners), 'number')],
        tables: [table('Close checklist', [col('task', 'Task'), col('owner', 'Owner'), col('due_day', 'Due day', 'number'), col('completed_day', 'Done day', 'number'), col('status', 'Status', 'status'), col('automation', 'Automation')], tasks)],
        insights: [`Late tasks: ${late.map((t) => t.task).join('; ') || 'none'}.`, `${blocked.map((t) => `“${t.task}” waits on “${byId.get(t.depends_on).task}”`).join('; ') || 'No blocked tasks.'}`, 'Automating reconciliations, accruals and flux analysis typically removes 2 days from the close.'],
        actions: ['Ping owners of blocked tasks in Slack.', 'Auto-generate flux commentary for variances > 10%.'],
      });
    },
  },

  'accounts-receivable': {
    params: [{ key: 'minDays', label: 'Show invoices overdue by at least', type: 'number', min: 0, max: 90, step: 15, default: 30, unit: 'days' }],
    run(ds, p) {
      const cust = new Map(ds.customers.map((c) => [c.id, c]));
      const open = ds.invoices.filter((i) => i.status !== 'paid').map((i) => {
        const c = cust.get(i.customer_id);
        const daysOver = Math.max(0, daysBetween(i.due_date, AS_OF));
        const bucket = daysOver === 0 ? 'Current' : daysOver <= 30 ? '1–30' : daysOver <= 60 ? '31–60' : daysOver <= 90 ? '61–90' : '90+';
        const risk = Math.min(0.95, 0.02 + daysOver / 160 + (c.churn_month ? 0.35 : 0) + (c.segment === 'SMB' ? 0.05 : 0));
        return { id: `INV-${i.id}`, customer: c.name, segment: c.segment, amount: i.amount, due: i.due_date, daysOver, bucket, risk, churned: c.churn_month ? 'Yes' : '' };
      });
      const buckets = ['Current', '1–30', '31–60', '61–90', '90+'];
      const aging = buckets.map((b) => sum(open.filter((o) => o.bucket === b).map((o) => o.amount)));
      const total = sum(aging);
      const overdue = total - aging[0];
      const reserve = sum(open.map((o) => o.amount * o.risk));
      const worklist = open.filter((o) => o.daysOver >= p.minDays).sort((a, b) => b.amount * b.risk - a.amount * a.risk);
      worklist.forEach((w) => { w.action = w.daysOver > 90 ? 'Escalate: exec call + suspend service' : w.daysOver > 60 ? 'Final notice + AE involvement' : w.daysOver > 30 ? 'Second reminder + call' : 'Friendly reminder'; });
      const paid = ds.invoices.filter((i) => i.paid_date);
      const byMonth = {};
      for (const i of paid) { const m = i.issue_date.slice(0, 7); (byMonth[m] ??= []).push(daysBetween(i.issue_date, i.paid_date)); }
      const months = Object.keys(byMonth).sort().slice(-6);
      return result({
        headline: `${fmtMoney(total)} open AR, ${fmtPct(overdue / total)} overdue; ${worklist.length} invoices on today's collections worklist worth ${fmtMoney(sum(worklist.map((w) => w.amount)))}.`,
        kpis: [kpi('Open AR', total), kpi('Overdue', overdue, 'currency', { tone: overdue / total > 0.3 ? 'bad' : 'neutral' }), kpi('90+ days', aging[4], 'currency', { tone: aging[4] > 0 ? 'bad' : 'good' }), kpi('Expected loss reserve', reserve), kpi('DSO', ds.last.ar_balance / ds.last.revenue * 30, 'days'), kpi('Worklist items', worklist.length, 'number')],
        charts: [bar('AR aging', buckets, [s('Open AR', aging)]), line('Average days to pay (by invoice month)', months, [s('Days to pay', months.map((m) => avg(byMonth[m])))], 'days')],
        tables: [table('Prioritised collections worklist', [col('id', 'Invoice'), col('customer', 'Customer'), col('segment', 'Segment'), col('amount', 'Amount', 'currency'), col('daysOver', 'Days overdue', 'number'), col('risk', 'Loss risk', 'pct'), col('action', 'Next action')], worklist.slice(0, 25))],
        insights: [`Worklist is ranked by expected loss (amount × risk), not just age.`, `${open.filter((o) => o.churned).length} open invoices belong to churned customers — prioritise before access is revoked.`, `Enterprise invoices account for ${fmtPct(sum(open.filter((o) => o.segment === 'Enterprise').map((o) => o.amount)) / total)} of open AR.`],
        actions: ['Send personalised dunning emails for the top 25 items.', 'Sync promises-to-pay back to the cash forecast.'],
      });
    },
  },

  'accounts-payable': {
    params: [{ key: 'horizon', label: 'Payment run horizon', type: 'number', min: 7, max: 45, step: 7, default: 14, unit: 'days' }],
    run(ds, p) {
      const ven = new Map(ds.vendors.map((v) => [v.id, v]));
      const open = ds.bills.filter((b) => b.status === 'open').map((b) => ({ ...b, vendor: ven.get(b.vendor_id).name, category: ven.get(b.vendor_id).category, discount: ven.get(b.vendor_id).early_pay_discount, daysToDue: daysBetween(AS_OF, b.due_date) }));
      // duplicate detection: same vendor + amount within 30 days
      const dupes = [];
      for (let i = 0; i < open.length; i++) for (let j = 0; j < ds.bills.length; j++) {
        const a = open[i], b = ds.bills[j];
        if (a.id !== b.id && a.vendor_id === b.vendor_id && Math.abs(a.amount - b.amount) < 1 && Math.abs(daysBetween(a.issue_date, b.issue_date)) <= 30 && a.id > b.id) dupes.push({ id: `BILL-${a.id}`, vendor: a.vendor, amount: a.amount, issue: a.issue_date, match: `BILL-${b.id}`, flag: 'Possible duplicate' });
      }
      const noPo = open.filter((b) => !b.po_number && b.amount > 10000).map((b) => ({ id: `BILL-${b.id}`, vendor: b.vendor, amount: b.amount, issue: b.issue_date, match: '—', flag: b.amount % 1000 === 0 ? 'No PO, round amount' : 'No PO' }));
      const exceptions = [...dupes, ...noPo];
      const excIds = new Set(exceptions.map((e) => e.id));
      const run = open.filter((b) => b.daysToDue <= p.horizon && !excIds.has(`BILL-${b.id}`)).map((b) => ({ id: `BILL-${b.id}`, vendor: b.vendor, amount: b.amount, due: b.due_date, daysToDue: b.daysToDue, discount: b.discount ? '2/10 net 30' : '', saving: b.discount ? b.amount * 0.02 : 0 }));
      const discountable = open.filter((b) => b.discount);
      const discountSavings = sum(discountable.map((b) => b.amount * 0.02));
      const byCat = sumBy(open, 'category', 'amount');
      return result({
        headline: `${open.length} open bills (${fmtMoney(sum(open.map((b) => b.amount)))}); proposed ${p.horizon}-day payment run of ${fmtMoney(sum(run.map((r) => r.amount)))} with ${exceptions.length} exceptions held for review.`,
        kpis: [kpi('Open AP', sum(open.map((b) => b.amount))), kpi('Payment run', sum(run.map((r) => r.amount))), kpi('Exceptions held', exceptions.length, 'number', { tone: exceptions.length ? 'bad' : 'good' }), kpi('Duplicate value blocked', sum(dupes.map((d) => d.amount)), 'currency', { tone: 'good' }), kpi('Early-pay discounts available', discountSavings, 'currency', { tone: 'good' }), kpi('Past-due bills', open.filter((b) => b.daysToDue < 0).length, 'number')],
        charts: [donut('Open AP by category', Object.keys(byCat), Object.values(byCat))],
        tables: [table('Exceptions (held)', [col('id', 'Bill'), col('vendor', 'Vendor'), col('amount', 'Amount', 'currency'), col('issue', 'Issued'), col('match', 'Matches'), col('flag', 'Flag', 'status')], exceptions), table('Proposed payment run', [col('id', 'Bill'), col('vendor', 'Vendor'), col('amount', 'Amount', 'currency'), col('due', 'Due'), col('daysToDue', 'Days to due', 'number'), col('discount', 'Terms'), col('saving', 'Discount', 'currency')], run)],
        insights: [`Duplicate check found ${dupes.length} likely double-billed invoice(s) — ${fmtMoney(sum(dupes.map((d) => d.amount)))} protected.`, `${noPo.length} bills over $10K lack a PO — route to budget owner for approval.`, `Paying discount-eligible vendors on day 10 earns a ~36% annualised return.`],
        actions: ['Approve the payment run (dual approval required).', 'Ask vendors with no PO to re-submit against a PO.'],
      });
    },
  },

  'payroll-planning': {
    params: [{ key: 'hires', label: 'Planned hires (next 12 mo)', type: 'number', min: 0, max: 60, step: 2, default: 24, unit: 'heads' }, { key: 'merit', label: 'Merit increase', type: 'number', min: 0, max: 8, step: 0.5, default: 3.5, unit: '%' }, { key: 'meritMonth', label: 'Merit cycle month', type: 'select', options: ['January', 'April', 'July'], default: 'January' }],
    run(ds, p) {
      const L = ds.last;
      const active = ds.employees.filter((e) => e.start_month <= L.month && (!e.end_month || e.end_month > L.month));
      const burden = 1.21;
      const byDept = {};
      for (const e of active) { const d = (byDept[e.dept] ??= { dept: e.dept, heads: 0, salary: 0 }); d.heads++; d.salary += e.salary; }
      const deptRows = Object.values(byDept).map((d) => ({ ...d, avg: d.salary / d.heads, loaded: d.salary * burden }));
      const totalSalary = sum(deptRows.map((d) => d.salary));
      const avgSalary = totalSalary / active.length;
      const mix = deptRows.map((d) => ({ dept: d.dept, share: d.heads / active.length, avg: d.avg }));
      const meritIdx = { January: 4, April: 7, July: 10 }[p.meritMonth];
      const attrition = avg(lastN(ds.fin, 12).map(() => 0.0085));
      const months = [];
      let base = totalSalary, heads = active.length;
      for (let t = 1; t <= 12; t++) {
        const m = monthAdd(L.month, t);
        const newHires = p.hires / 12;
        heads = heads * (1 - attrition) + newHires;
        base = base * (1 - attrition) + newHires * avgSalary * 1.04;
        if (t === meritIdx) base *= 1 + p.merit / 100;
        months.push({ month: m, heads, salary: base / 12, loaded: base / 12 * burden, taxes: base / 12 * 0.0765, benefits: base / 12 * (burden - 1 - 0.0765) });
      }
      const annual = sum(months.map((m) => m.loaded));
      const current = totalSalary * burden;
      return result({
        headline: `Payroll plan: ${fmtMoney(annual)} fully-loaded over the next 12 months (+${fmtPct(annual / current - 1)} vs current run-rate), ending at ~${Math.round(months[11].heads)} heads.`,
        kpis: [kpi('Current headcount', active.length, 'number'), kpi('Current loaded run-rate', current), kpi('Next-12-mo payroll', annual, 'currency', { delta: annual / current - 1 }), kpi('Avg base salary', avgSalary), kpi('Merit cost (annualised)', totalSalary * p.merit / 100 * burden), kpi('Ending headcount', Math.round(months[11].heads), 'number')],
        charts: [bar('Monthly payroll cost', months.map((m) => m.month), [s('Base salary', months.map((m) => m.salary)), s('Payroll taxes', months.map((m) => m.taxes)), s('Benefits', months.map((m) => m.benefits))], 'currency', { stacked: true })],
        tables: [table('Current payroll by department', [col('dept', 'Department'), col('heads', 'Heads', 'number'), col('avg', 'Avg salary', 'currency'), col('salary', 'Annual base', 'currency'), col('loaded', 'Fully loaded', 'currency')], deptRows), table('Hiring mix assumption', [col('dept', 'Department'), col('share', 'Share of hires', 'pct'), col('avg', 'Avg salary', 'currency')], mix)],
        insights: [`Burden rate of ${fmtPct(burden - 1, 0)} covers payroll taxes (7.65%) and benefits.`, `Moving the merit cycle from January to July saves ~${fmtMoney(totalSalary * p.merit / 100 * burden * 0.5)} in the plan year.`, `Assumes ~${fmtPct(attrition * 12, 0)} annual attrition backfilled within the hire plan.`],
        actions: ['Sync the hire plan with recruiting requisitions.', 'Load monthly payroll into the Cash Flow Forecast Agent.'],
      });
    },
  },

  'finance-ops-optimizer': {
    params: [{ key: 'hourlyCost', label: 'Finance team loaded hourly cost', type: 'number', min: 50, max: 200, step: 5, default: 95, unit: '$/hr' }],
    run(ds, p) {
      const processes = [
        { process: 'Month-end close', hours: 210, automatable: 0.45, volume: '20 tasks / month' },
        { process: 'AP invoice processing', hours: ds.bills.length / 12 * 0.35, automatable: 0.7, volume: `${Math.round(ds.bills.length / 12)} bills / month` },
        { process: 'AR collections & cash application', hours: ds.invoices.length / 7 * 0.12, automatable: 0.6, volume: `${Math.round(ds.invoices.length / 7)} invoices / month` },
        { process: 'Management reporting', hours: 64, automatable: 0.65, volume: '6 packs / month' },
        { process: 'Budget vs actual commentary', hours: 40, automatable: 0.55, volume: '5 departments' },
        { process: 'Forecast refresh', hours: 48, automatable: 0.5, volume: 'Monthly' },
        { process: 'Board & investor reporting', hours: 30, automatable: 0.6, volume: 'Monthly / quarterly' },
        { process: 'Vendor & spend reviews', hours: 24, automatable: 0.5, volume: `${ds.vendors.length} vendors` },
        { process: 'Audit PBC requests', hours: 22, automatable: 0.4, volume: 'Annual, spread monthly' },
      ].map((x) => ({ ...x, saved: x.hours * x.automatable, value: x.hours * x.automatable * p.hourlyCost * 12 }));
      processes.sort((a, b) => b.saved - a.saved);
      const totalH = sum(processes.map((x) => x.hours)), savedH = sum(processes.map((x) => x.saved));
      return result({
        headline: `Finance spends ~${Math.round(totalH)} hours/month on these processes; automation can free ${Math.round(savedH)} hours (${fmtPct(savedH / totalH, 0)}) worth ${fmtMoney(savedH * p.hourlyCost * 12)}/year.`,
        kpis: [kpi('Process hours / month', totalH, 'number'), kpi('Automatable hours / month', savedH, 'number', { tone: 'good' }), kpi('FTE equivalent freed', savedH / 160, 'number1'), kpi('Annual value', savedH * p.hourlyCost * 12, 'currency', { tone: 'good' }), kpi('Revenue per finance FTE', ds.last.revenue * 12 / 6)],
        charts: [bar('Hours per month: today vs with agents', processes.map((x) => x.process), [s('Today', processes.map((x) => x.hours)), s('With agents', processes.map((x) => x.hours - x.saved))], 'number')],
        tables: [table('Automation roadmap', [col('process', 'Process'), col('volume', 'Volume'), col('hours', 'Hours / mo', 'number'), col('automatable', 'Automatable', 'pct'), col('saved', 'Hours saved', 'number'), col('value', 'Annual value', 'currency')], processes)],
        insights: [`Biggest lever: ${processes[0].process} (${Math.round(processes[0].saved)} hrs/month).`, 'Sequence: AP & AR automation first (fast payback), then close, then reporting.'],
        actions: ['Pilot the top-2 processes for 60 days and measure hours saved.', 'Use the ROI calculator to turn this into a proposal.'],
      });
    },
  },
};
