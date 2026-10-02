import { avg, fmtMoney, fmtPct, sum, sumBy } from '../lib/fin.js';
import { burnAt } from '../lib/model.js';
import { bar, col, donut, hbar, kpi, line, result, s, table, waterfall } from './out.js';

const ttmBills = (ds) => ds.bills.filter((b) => b.month > '2025-09');

export default {
  'pricing-strategy': {
    params: [{ key: 'plan', label: 'Plan', type: 'select', options: ['Starter', 'Growth', 'Enterprise'], default: 'Growth' }],
    run(ds, p) {
      const sku = { Starter: 'NW-STR', Growth: 'NW-GRW', Enterprise: 'NW-ENT' }[p.plan];
      const prod = ds.products.find((x) => x.sku === sku);
      const L = ds.last.month;
      const custs = ds.customers.filter((c) => c.plan === p.plan && ds.mrrByCustomer.get(c.id)?.has(L));
      const mrr = sum(custs.map((c) => ds.mrrByCustomer.get(c.id).get(L)));
      const seatsOf = (c) => c.seats * ds.mrrByCustomer.get(c.id).get(L) / c.start_mrr; // seats expand with MRR
      const seats = sum(custs.map(seatsOf));
      const effPrice = mrr / seats;
      const unitCost = prod.unit_cost;
      const e = prod.elasticity;
      const points = [-15, -10, -5, 0, 5, 10, 15, 20, 25].map((chg) => {
        const price = effPrice * (1 + chg / 100);
        const c = chg / 100;
        // half the elasticity materialises on the existing base (switching costs); large increases trigger accelerating churn
        const vol = Math.max(0, 1 + e * c * 0.5 - (c > 0 ? 1.2 * c * c : 0));
        const rev = price * seats * vol;
        const gp = (price - unitCost) * seats * vol;
        return { change: chg / 100, price, seatsRetained: vol, revenue: rev * 12, gp: gp * 12 };
      });
      const best = points.reduce((a, b) => (b.gp > a.gp ? b : a));
      const cur = points.find((x) => x.change === 0);
      const segs = ['SMB', 'Mid-Market', 'Enterprise'].map((sg) => { const cs = custs.filter((c) => c.segment === sg); const m = sum(cs.map((c) => ds.mrrByCustomer.get(c.id).get(L))); const st = sum(cs.map(seatsOf)); return { segment: sg, customers: cs.length, seats: st, price: st ? m / st : 0, discount: st ? 1 - (m / st) / prod.price : 0 }; }).filter((x) => x.customers);
      return result({
        headline: `${p.plan} realises ${fmtMoney(effPrice)}/seat vs ${fmtMoney(prod.price)} list (${fmtPct(1 - effPrice / prod.price)} discount). Gross profit peaks at a ${fmtPct(best.change, 0)} price change (+${fmtMoney(best.gp - cur.gp)}/yr).`,
        kpis: [kpi('List price / seat', prod.price, 'currency2'), kpi('Realised price / seat', effPrice, 'currency2'), kpi('Effective discount', 1 - effPrice / prod.price, 'pct'), kpi('Seats on plan', seats, 'number'), kpi('Price elasticity', e, 'number1'), kpi('Optimal change', best.change, 'pct', { tone: 'good' })],
        charts: [line('Annual gross profit by price change', points.map((x) => fmtPct(x.change, 0)), [s('Gross profit', points.map((x) => x.gp)), s('Revenue', points.map((x) => x.revenue))])],
        tables: [table('Price-volume scenarios', [col('change', 'Price change', 'pct'), col('price', 'Price / seat', 'currency2'), col('seatsRetained', 'Volume retained', 'pct'), col('revenue', 'Annual revenue', 'currency'), col('gp', 'Annual gross profit', 'currency')], points), table('Realised price by segment', [col('segment', 'Segment'), col('customers', 'Customers', 'number'), col('seats', 'Seats', 'number'), col('price', 'Price / seat', 'currency2'), col('discount', 'Discount vs list', 'pct')], segs)],
        insights: [`Elasticity of ${e} on ${p.plan}; existing customers respond at roughly half that because of switching costs.`, 'Grandfathering existing customers for 6 months de-risks churn while capturing new-logo upside immediately.', segs.length ? `${segs.reduce((a, b) => (b.discount > a.discount ? b : a)).segment} carries the deepest discount — tighten discount approval there first.` : ''],
        actions: ['Test the recommended price on new logos for one quarter.', 'Track discount leakage with the Pricing Margin Agent.'],
      });
    },
  },

  'cost-reduction': {
    params: [{ key: 'target', label: 'Savings target', type: 'number', min: 2, max: 20, step: 1, default: 8, unit: '% of opex' }],
    run(ds, p) {
      const ms = ds.months.slice(-12);
      const opex = ds.opex.filter((r) => ms.includes(r.month));
      const total = sum(opex.map((r) => r.amount));
      const byLine = sumBy(opex, 'line', 'amount');
      const levers = [
        { lever: 'Consolidate overlapping SaaS tools', line: 'Software & Tools', pct: 0.22, effort: 'Low', time: '1–2 months' },
        { lever: 'Convert long-running contractors to FTE or end', line: 'Contractors', pct: 0.3, effort: 'Medium', time: '2–3 months' },
        { lever: 'Travel policy: advance booking + class caps', line: 'Travel & Events', pct: 0.18, effort: 'Low', time: '1 month' },
        { lever: 'Shift paid programs to partner/organic', line: 'Programs', pct: 0.15, effort: 'Medium', time: '1 quarter' },
        { lever: 'Sublet unused office space', line: 'Facilities', pct: 0.2, effort: 'High', time: '2 quarters' },
        { lever: 'In-house recruiting for non-exec roles', line: 'Recruiting', pct: 0.4, effort: 'Medium', time: '1 quarter' },
        { lever: 'Cloud hosting: reserved instances & rightsizing', line: 'COGS: Hosting', pct: 0.14, effort: 'Medium', time: '1–2 months', base: sum(ds.fin.slice(-12).map((r) => r.cogs_hosting)) },
        { lever: 'Hiring pacing: delay 4 non-critical backfills', line: 'Payroll', pct: 0.025, effort: 'Low', time: 'Immediate' },
      ].map((l) => ({ ...l, base: l.base ?? byLine[l.line] ?? 0 })).map((l) => ({ ...l, savings: l.base * l.pct }));
      levers.sort((a, b) => b.savings - a.savings);
      const target = total * p.target / 100;
      let acc = 0;
      levers.forEach((l) => { acc += l.savings; l.cumulative = acc; l.inPlan = acc - l.savings < target ? 'Yes' : ''; });
      const plan = levers.filter((l) => l.inPlan);
      const planSavings = sum(plan.map((l) => l.savings));
      return result({
        headline: `Identified ${fmtMoney(sum(levers.map((l) => l.savings)))} of annual savings; ${plan.length} levers deliver ${fmtMoney(planSavings)} against a ${fmtMoney(target)} target (${p.target}% of opex).`,
        kpis: [kpi('TTM opex', total), kpi('Savings target', target), kpi('Identified savings', sum(levers.map((l) => l.savings)), 'currency', { tone: 'good' }), kpi('Plan savings', planSavings, 'currency', { tone: planSavings >= target ? 'good' : 'bad' }), kpi('Target coverage', planSavings / target, 'pct'), kpi('Runway extension', planSavings / 12 / Math.max(1, avg([1, 2, 3].map((k) => burnAt(ds, ds.fin.length - k)))) * 12, 'months')],
        charts: [waterfall('Savings build to target', [...plan.map((l) => ({ label: l.lever.split(':')[0].split(' ').slice(0, 3).join(' '), value: l.savings })), { label: 'Plan total', value: planSavings, total: true }])],
        tables: [table('Savings levers', [col('lever', 'Lever'), col('line', 'Cost line'), col('base', 'TTM base', 'currency'), col('pct', 'Savings %', 'pct'), col('savings', 'Annual savings', 'currency'), col('effort', 'Effort'), col('time', 'Time to realise'), col('inPlan', 'In plan', 'status')], levers)],
        insights: ['Levers are sized from actual TTM spend by line, not benchmarks alone.', 'Prioritised by size; low-effort levers deliver most of the target in the first quarter.', 'Payroll lever deliberately small — protects growth capacity.'],
        actions: ['Assign owners and timelines to each lever.', 'Track realised savings monthly in Variance Analysis.'],
      });
    },
  },

  'procurement-savings': {
    params: [{ key: 'renewalWindow', label: 'Renewals within', type: 'number', min: 3, max: 15, step: 3, default: 9, unit: 'months' }],
    run(ds, p) {
      const bills = ttmBills(ds);
      const spend = sumBy(bills, 'vendor_id', 'amount');
      const benchmark = { 'Cloud Hosting': 0.12, Software: 0.18, Marketing: 0.1, 'Professional Services': 0.12, Facilities: 0.06, Hardware: 0.08, Travel: 0.1, Recruiting: 0.2, Insurance: 0.07 };
      const horizon = (() => { const [y, m] = '2026-09'.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + p.renewalWindow, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
      const rows = ds.vendors.map((v) => {
        const sp = spend[v.id] || 0;
        const renewing = v.contract_end <= horizon;
        const termsGain = v.terms === 'Net 15' ? 'Move to Net 30' : v.terms === 'Net 30' && sp > 300000 ? 'Move to Net 45' : '';
        const savings = renewing ? sp * benchmark[v.category] : 0;
        return { vendor: v.name, category: v.category, spend: sp, contract_end: v.contract_end, auto_renew: v.auto_renew ? 'Auto-renews' : '', savings, play: renewing ? (sp > 250000 ? 'Competitive RFP' : v.auto_renew ? 'Cancel auto-renew & renegotiate' : 'Renegotiate at renewal') : 'Monitor', termsGain };
      }).sort((a, b) => b.savings - a.savings);
      const pipeline = rows.filter((r) => r.savings > 0);
      const autoRenew = pipeline.filter((r) => r.auto_renew);
      return result({
        headline: `${pipeline.length} contracts renew within ${p.renewalWindow} months covering ${fmtMoney(sum(pipeline.map((r) => r.spend)))} of spend — negotiation pipeline worth ${fmtMoney(sum(pipeline.map((r) => r.savings)))}.`,
        kpis: [kpi('TTM addressable spend', sum(rows.map((r) => r.spend))), kpi('Spend up for renewal', sum(pipeline.map((r) => r.spend))), kpi('Savings pipeline', sum(pipeline.map((r) => r.savings)), 'currency', { tone: 'good' }), kpi('Auto-renewals at risk', autoRenew.length, 'number', { tone: autoRenew.length ? 'bad' : 'good' }), kpi('Payment-term upgrades', rows.filter((r) => r.termsGain).length, 'number')],
        charts: [hbar('Savings opportunity by vendor', pipeline.slice(0, 10).map((r) => r.vendor), pipeline.slice(0, 10).map((r) => r.savings))],
        tables: [table('Negotiation pipeline', [col('vendor', 'Vendor'), col('category', 'Category'), col('spend', 'TTM spend', 'currency'), col('contract_end', 'Renewal'), col('auto_renew', 'Auto-renew', 'status'), col('play', 'Play'), col('savings', 'Target savings', 'currency'), col('termsGain', 'Terms')], pipeline)],
        insights: ['Target savings use category benchmarks (e.g. 12% hosting, 18% software) applied to actual spend.', `${autoRenew.length} contracts will silently auto-renew — send non-renewal notices 60 days ahead.`, 'Bundle the three cloud vendors into one RFP for leverage.'],
        actions: ['Create negotiation briefs with usage data for the top 5.', 'Calendar non-renewal notice dates.'],
      });
    },
  },

  'vendor-spend': {
    params: [{ key: 'top', label: 'Show top', type: 'number', min: 5, max: 30, step: 5, default: 15, unit: 'vendors' }],
    run(ds, p) {
      const bills = ttmBills(ds);
      const ven = new Map(ds.vendors.map((v) => [v.id, v]));
      const byVendor = sumBy(bills, 'vendor_id', 'amount');
      const prevBills = ds.bills.filter((b) => b.month <= '2025-09');
      const rows = Object.entries(byVendor).map(([id, sp]) => {
        const v = ven.get(Number(id));
        const h1 = sum(bills.filter((b) => b.vendor_id === Number(id) && b.month <= '2026-03').map((b) => b.amount));
        const h2 = sum(bills.filter((b) => b.vendor_id === Number(id) && b.month > '2026-03').map((b) => b.amount));
        const noPo = bills.filter((b) => b.vendor_id === Number(id) && !b.po_number).length / bills.filter((b) => b.vendor_id === Number(id)).length;
        return { vendor: v.name, category: v.category, owner: v.owner, spend: sp, growth: h1 ? h2 / h1 - 1 : 0, noPo, terms: v.terms };
      }).sort((a, b) => b.spend - a.spend);
      void prevBills;
      const total = sum(rows.map((r) => r.spend));
      const byCat = sumBy(rows, 'category', 'spend');
      let cum = 0; const top80 = rows.filter((r) => { cum += r.spend; return cum - r.spend < total * 0.8; }).length;
      const months = [...new Set(bills.map((b) => b.month))].sort();
      const cats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).slice(0, 5);
      return result({
        headline: `${fmtMoney(total)} TTM vendor spend across ${rows.length} vendors; ${top80} vendors make up 80% of spend. Off-PO spend is ${fmtPct(sum(rows.map((r) => r.spend * r.noPo)) / total)}.`,
        kpis: [kpi('TTM vendor spend', total), kpi('Active vendors', rows.length, 'number'), kpi('Vendors = 80% of spend', top80, 'number'), kpi('Off-PO spend', sum(rows.map((r) => r.spend * r.noPo)), 'currency', { tone: 'bad' }), kpi('Fastest-growing vendor', rows.reduce((a, b) => (b.growth > a.growth ? b : a)).vendor, 'text')],
        charts: [donut('Spend by category', Object.keys(byCat), Object.values(byCat)), bar('Monthly spend — top 5 categories', months, cats.map((c) => s(c, months.map((m) => sum(bills.filter((b) => b.month === m && ven.get(b.vendor_id).category === c).map((b) => b.amount))))), 'currency', { stacked: true })],
        tables: [table(`Top ${p.top} vendors`, [col('vendor', 'Vendor'), col('category', 'Category'), col('owner', 'Owner'), col('spend', 'TTM spend', 'currency'), col('growth', 'H2 vs H1', 'pct'), col('noPo', 'Off-PO', 'pct'), col('terms', 'Terms')], rows.slice(0, p.top))],
        insights: [`Cloud hosting is the largest category at ${fmtPct((byCat['Cloud Hosting'] || 0) / total)} of spend.`, 'Vendors growing >20% half-over-half should be reviewed for scope creep.', 'Off-PO spend bypasses budget approval — enforce PO-before-invoice for vendors above $10K/yr.'],
        actions: ['Send top-vendor review to budget owners.', 'Pipe renewals into the Procurement Savings Agent.'],
      });
    },
  },

  'inventory-finance': {
    params: [{ key: 'serviceLevel', label: 'Target service level', type: 'select', options: ['90%', '95%', '99%'], default: '95%' }, { key: 'carryingCost', label: 'Annual carrying cost', type: 'number', min: 10, max: 35, step: 1, default: 22, unit: '%' }],
    run(ds, p) {
      const z = { '90%': 1.28, '95%': 1.65, '99%': 2.33 }[p.serviceLevel];
      const hw = ds.products.filter((x) => x.kind === 'hardware');
      const rows = hw.map((x) => {
        const sales = ds.productSales.filter((r) => r.sku === x.sku).slice(-6).map((r) => r.units);
        const mean = avg(sales), sd = Math.sqrt(avg(sales.map((u) => (u - mean) ** 2)));
        const daily = mean / 30, lt = x.lead_time_days;
        const safety = z * sd / Math.sqrt(30) * Math.sqrt(lt);
        const reorder = daily * lt + safety;
        const eoq = Math.sqrt(2 * mean * 12 * 450 / (x.unit_cost * p.carryingCost / 100));
        const target = safety + eoq / 2;
        const excess = Math.max(0, x.inventory_units - (reorder + eoq));
        const cover = x.inventory_units / daily;
        return { sku: x.sku, name: x.name, onHand: x.inventory_units, value: x.inventory_units * x.unit_cost, monthlyDemand: mean, cover, leadTime: lt, safety, reorder, eoq, excessUnits: excess, excessValue: excess * x.unit_cost, carrying: x.inventory_units * x.unit_cost * p.carryingCost / 100, status: x.inventory_units < reorder ? 'Reorder now' : excess > 0 ? 'Overstocked' : 'Healthy', targetValue: target * x.unit_cost };
      });
      const totalValue = sum(rows.map((r) => r.value));
      const release = sum(rows.map((r) => r.excessValue));
      return result({
        headline: `${fmtMoney(totalValue)} of hardware inventory; ${fmtMoney(release)} is excess at a ${p.serviceLevel} service level and ${rows.filter((r) => r.status === 'Reorder now').length} SKU(s) need reordering.`,
        kpis: [kpi('Inventory value', totalValue), kpi('Annual carrying cost', sum(rows.map((r) => r.carrying))), kpi('Excess inventory', release, 'currency', { tone: release > 0 ? 'bad' : 'good' }), kpi('Cash release opportunity', release, 'currency', { tone: 'good' }), kpi('SKUs to reorder', rows.filter((r) => r.status === 'Reorder now').length, 'number')],
        charts: [bar('Days of cover vs lead time', rows.map((r) => r.name), [s('Days of cover', rows.map((r) => r.cover)), s('Lead time', rows.map((r) => r.leadTime))], 'days')],
        tables: [table('SKU inventory policy', [col('name', 'SKU'), col('onHand', 'On hand', 'number'), col('value', 'Value', 'currency'), col('monthlyDemand', 'Demand / mo', 'number'), col('cover', 'Days cover', 'days'), col('safety', 'Safety stock', 'number'), col('reorder', 'Reorder point', 'number'), col('eoq', 'Order qty (EOQ)', 'number'), col('excessValue', 'Excess $', 'currency'), col('status', 'Status', 'status')], rows)],
        insights: [`Safety stock uses demand volatility over supplier lead time at z=${z}.`, 'Sensor packs carry the most excess — slow purchasing until cover falls below 90 days.', `Every $1 of excess stock costs ~$${(p.carryingCost / 100).toFixed(2)}/yr to hold.`],
        actions: ['Adjust open POs to the recommended order quantities.', 'Feed released cash into the Working Capital Analyst.'],
      });
    },
  },

  'pricing-margin': {
    params: [{ key: 'floor', label: 'Discount guardrail', type: 'number', min: 5, max: 25, step: 1, default: 10, unit: '%' }],
    run(ds, p) {
      const ms = ds.months.slice(-6);
      const prod = new Map(ds.products.map((x) => [x.sku, x]));
      const rows = ds.products.filter((x) => x.kind !== 'subscription').map((x) => {
        const sales = ds.productSales.filter((r) => r.sku === x.sku && ms.includes(r.month));
        const units = sum(sales.map((r) => r.units)), rev = sum(sales.map((r) => r.revenue)), cost = sum(sales.map((r) => r.cost));
        const listRev = units * x.price;
        const disc = 1 - rev / listRev;
        const leakage = Math.max(0, disc - p.floor / 100) * listRev;
        return { sku: x.sku, name: x.name, kind: x.kind, units, listRev, rev, discount: disc, cost, gm: 1 - cost / rev, leakage, status: disc > p.floor / 100 ? 'Above guardrail' : 'OK' };
      });
      void prod;
      const trend = ds.months.slice(-12).map((m) => { const r = ds.productSales.filter((x) => x.month === m); return { month: m, gm: 1 - sum(r.map((x) => x.cost)) / sum(r.map((x) => x.revenue)), disc: avg(r.map((x) => x.avg_discount)) }; });
      const totalLeak = sum(rows.map((r) => r.leakage));
      return result({
        headline: `Hardware & services gross margin is ${fmtPct(1 - sum(rows.map((r) => r.cost)) / sum(rows.map((r) => r.rev)))}; discounts above the ${p.floor}% guardrail leaked ${fmtMoney(totalLeak)} in 6 months (${fmtMoney(totalLeak * 2)} annualised).`,
        kpis: [kpi('6-mo revenue', sum(rows.map((r) => r.rev))), kpi('Avg discount', 1 - sum(rows.map((r) => r.rev)) / sum(rows.map((r) => r.listRev)), 'pct'), kpi('Gross margin', 1 - sum(rows.map((r) => r.cost)) / sum(rows.map((r) => r.rev)), 'pct'), kpi('Discount leakage (6 mo)', totalLeak, 'currency', { tone: 'bad' }), kpi('SKUs above guardrail', rows.filter((r) => r.status !== 'OK').length, 'number')],
        charts: [line('Margin & discount trend', trend.map((t) => t.month), [s('Gross margin', trend.map((t) => t.gm)), s('Avg discount', trend.map((t) => t.disc))], 'pct'), bar('List vs realised revenue (6 mo)', rows.map((r) => r.name), [s('List', rows.map((r) => r.listRev)), s('Realised', rows.map((r) => r.rev))])],
        tables: [table('Price realisation by SKU', [col('name', 'SKU'), col('units', 'Units', 'number'), col('listRev', 'At list', 'currency'), col('rev', 'Realised', 'currency'), col('discount', 'Discount', 'pct'), col('gm', 'GM %', 'pct'), col('leakage', 'Leakage', 'currency'), col('status', 'Guardrail', 'status')], rows)],
        insights: ['Leakage = discount above guardrail × list revenue — the margin you gave away without approval.', 'Implementation packages have the thinnest margin; price them as a % of first-year ARR instead of flat.'],
        actions: ['Add deal-desk approval above the guardrail in CPQ.', 'Share SKU margins with the Pricing Strategy Agent.'],
      });
    },
  },
};

