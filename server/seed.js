// Deterministic demo-tenant generator: "Northwind Cloud, Inc." — a fictional
// B2B SaaS company with a small hardware line. Everything an agent analyses is
// derived from these tables, so numbers reconcile across agents.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SIM_START = { y: 2023, m: 1 };     // customer history starts here (cohorts)
const SIM_MONTHS = 45;                   // 2023-01 .. 2026-09
const STMT_MONTHS = 24;                  // financial statements: 2024-10 .. 2026-09

export function monthKey(i) {
  const d = new Date(Date.UTC(SIM_START.y, SIM_START.m - 1 + i, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    between: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    normal: (mu = 0, sd = 1) => {
      const u = Math.max(next(), 1e-9), v = next();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    chance: (p) => next() < p,
  };
}

const r2 = (x) => Math.round(x * 100) / 100;
const r0 = (x) => Math.round(x);

const PREFIX = ['Acme', 'Blue', 'Cedar', 'Delta', 'Ember', 'Falcon', 'Granite', 'Harbor', 'Iris', 'Juniper', 'Keystone', 'Lumen', 'Maple', 'Nimbus', 'Orbit', 'Pioneer', 'Quartz', 'Riverton', 'Summit', 'Tidal', 'Union', 'Vertex', 'Willow', 'Xeno', 'Yardley', 'Zenith', 'Atlas', 'Beacon', 'Cobalt', 'Drift', 'Echo', 'Fjord', 'Golden', 'Helix', 'Indigo', 'Jasper', 'Kinetic', 'Lighthouse', 'Meridian', 'Northstar'];
const SUFFIX = ['Logistics', 'Health', 'Retail', 'Foods', 'Energy', 'Labs', 'Manufacturing', 'Capital', 'Systems', 'Freight', 'Pharma', 'Analytics', 'Media', 'Builders', 'Mobility', 'Hospitality', 'Agritech', 'Insurance', 'Robotics', 'Materials'];
const REGIONS = ['North America', 'EMEA', 'APAC', 'LATAM'];
const CHANNELS = ['Paid Search', 'Outbound', 'Partner', 'Organic'];
const SEGMENTS = {
  SMB: { share: 0.58, mrr: [300, 1100], churn: 0.019, expand: 0.004, seats: [5, 25], dso: [28, 45], cacMult: 7 },
  'Mid-Market': { share: 0.31, mrr: [1400, 4200], churn: 0.011, expand: 0.007, seats: [30, 120], dso: [35, 60], cacMult: 9 },
  Enterprise: { share: 0.11, mrr: [6000, 18000], churn: 0.0045, expand: 0.009, seats: [150, 900], dso: [45, 85], cacMult: 11 },
};
const DEPTS = ['Sales', 'Marketing', 'R&D', 'G&A', 'Customer Success'];
const TITLES = {
  Sales: [['Account Executive', 135000], ['SDR', 72000], ['Sales Manager', 175000], ['Sales Engineer', 150000]],
  Marketing: [['Demand Gen Manager', 125000], ['Content Lead', 110000], ['Product Marketer', 135000]],
  'R&D': [['Software Engineer', 165000], ['Senior Engineer', 195000], ['Product Manager', 170000], ['Designer', 140000], ['Data Engineer', 175000]],
  'G&A': [['Accountant', 95000], ['FP&A Analyst', 115000], ['People Partner', 110000], ['Legal Counsel', 190000], ['IT Admin', 98000]],
  'Customer Success': [['CSM', 105000], ['Support Engineer', 88000], ['Implementation Lead', 120000]],
};
const LOCATIONS = ['Austin', 'Remote-US', 'London', 'Toronto', 'Remote-EU'];
const NONPAY_LINES = ['Software & Tools', 'Travel & Events', 'Contractors', 'Programs', 'Facilities', 'Recruiting'];
const NONPAY_BASE = { // monthly $ per head (Programs/Facilities partly fixed)
  Sales: { 'Software & Tools': 650, 'Travel & Events': 900, Contractors: 150, Programs: 0, Facilities: 450, Recruiting: 300 },
  Marketing: { 'Software & Tools': 1400, 'Travel & Events': 700, Contractors: 900, Programs: 9500, Facilities: 450, Recruiting: 200 },
  'R&D': { 'Software & Tools': 900, 'Travel & Events': 150, Contractors: 1200, Programs: 0, Facilities: 450, Recruiting: 350 },
  'G&A': { 'Software & Tools': 1100, 'Travel & Events': 200, Contractors: 2600, Programs: 0, Facilities: 1600, Recruiting: 250 },
  'Customer Success': { 'Software & Tools': 600, 'Travel & Events': 250, Contractors: 200, Programs: 0, Facilities: 450, Recruiting: 150 },
};
const VENDORS = [
  ['Stratus Cloud Hosting', 'Cloud Hosting', 'Net 30', 0],
  ['Skyline CDN', 'Cloud Hosting', 'Net 30', 0],
  ['DataVault Backup', 'Cloud Hosting', 'Net 45', 0],
  ['Pipeline CRM', 'Software', 'Net 30', 1],
  ['LedgerOne ERP', 'Software', 'Net 30', 0],
  ['ChatterBox Messaging', 'Software', 'Net 30', 1],
  ['DocuFlow Signatures', 'Software', 'Net 30', 1],
  ['CodeHub Repos', 'Software', 'Net 30', 0],
  ['Observa Monitoring', 'Software', 'Net 30', 0],
  ['TalentScout Recruiting', 'Recruiting', 'Net 15', 0],
  ['HireRight Agency', 'Recruiting', 'Net 30', 0],
  ['BrightAds Network', 'Marketing', 'Net 30', 1],
  ['Eventful Conferences', 'Marketing', 'Net 45', 0],
  ['Clickstream Analytics', 'Marketing', 'Net 30', 1],
  ['Penrose Legal LLP', 'Professional Services', 'Net 30', 0],
  ['Hartwell Audit & Tax', 'Professional Services', 'Net 30', 0],
  ['Cornerstone Consulting', 'Professional Services', 'Net 45', 0],
  ['Metro Office REIT', 'Facilities', 'Net 15', 0],
  ['CleanSweep Services', 'Facilities', 'Net 30', 1],
  ['VoltGrid Utilities', 'Facilities', 'Net 15', 0],
  ['SensorWorks Components', 'Hardware', 'Net 60', 1],
  ['CircuitMax Assembly', 'Hardware', 'Net 45', 1],
  ['PackRight Logistics', 'Hardware', 'Net 30', 0],
  ['JetSet Travel', 'Travel', 'Net 30', 0],
  ['StayWell Hotels', 'Travel', 'Net 30', 0],
  ['ShieldGuard Insurance', 'Insurance', 'Net 30', 0],
  ['PayFlow Payroll', 'Software', 'Net 15', 0],
  ['DeskPro Hardware', 'Hardware', 'Net 30', 1],
  ['Telco Unified', 'Software', 'Net 30', 0],
  ['Learnly Training', 'Software', 'Net 30', 1],
];
const PRODUCTS = [
  // sku, name, kind, price, unit cost, base units/mo, inventory, lead time, elasticity
  ['NW-STR', 'Starter plan (per seat)', 'subscription', 49, 7.5, 0, 0, 0, -1.6],
  ['NW-GRW', 'Growth plan (per seat)', 'subscription', 89, 12, 0, 0, 0, -1.2],
  ['NW-ENT', 'Enterprise plan (per seat)', 'subscription', 149, 19, 0, 0, 0, -0.7],
  ['HW-GW1', 'Edge Gateway G1', 'hardware', 1290, 610, 62, 410, 45, -1.4],
  ['HW-GW2', 'Edge Gateway G2 Pro', 'hardware', 2190, 980, 38, 120, 60, -1.1],
  ['HW-SNS', 'Sensor Pack (10)', 'hardware', 340, 132, 210, 2900, 30, -1.8],
  ['HW-MNT', 'Mounting Kit', 'hardware', 85, 22, 160, 1650, 20, -0.9],
  ['SV-IMP', 'Implementation package', 'services', 9500, 6100, 9, 0, 0, -0.8],
  ['SV-TRN', 'Training day', 'services', 2400, 1100, 14, 0, 0, -1.0],
];

export function generate(dbPath) {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  const R = rng(20261002);

  db.exec(`
    CREATE TABLE company (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, segment TEXT, region TEXT, channel TEXT,
      plan TEXT, start_month TEXT, churn_month TEXT, seats INTEGER, start_mrr REAL, cac REAL, dso_days INTEGER);
    CREATE TABLE customer_mrr (customer_id INTEGER, month TEXT, mrr REAL, PRIMARY KEY (customer_id, month));
    CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, dept TEXT, title TEXT, salary REAL, location TEXT,
      start_month TEXT, end_month TEXT);
    CREATE TABLE financials (month TEXT PRIMARY KEY, revenue_subscription REAL, revenue_services REAL, revenue_hardware REAL,
      revenue REAL, cogs_hosting REAL, cogs_licenses REAL, cogs_services REAL, cogs_hardware REAL, cogs REAL,
      gross_profit REAL, opex REAL, ebitda REAL, depreciation REAL, interest REAL, taxes REAL, net_income REAL,
      capex REAL, ar_balance REAL, ap_balance REAL, inventory_balance REAL, deferred_revenue REAL,
      cash_begin REAL, cash_end REAL, debt_balance REAL, headcount INTEGER, mrr REAL, customers INTEGER,
      new_customers INTEGER, churned_customers INTEGER, new_mrr REAL, expansion_mrr REAL, churned_mrr REAL,
      sm_spend REAL);
    CREATE TABLE opex_actuals (month TEXT, dept TEXT, line TEXT, amount REAL);
    CREATE TABLE opex_budget (month TEXT, dept TEXT, line TEXT, amount REAL);
    CREATE TABLE revenue_budget (month TEXT PRIMARY KEY, revenue REAL, cogs REAL, headcount INTEGER);
    CREATE TABLE forecast_history (month TEXT, made_in TEXT, horizon INTEGER, revenue_forecast REAL, method TEXT);
    CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT, category TEXT, terms TEXT, early_pay_discount INTEGER,
      contract_end TEXT, auto_renew INTEGER, owner TEXT);
    CREATE TABLE bills (id INTEGER PRIMARY KEY, vendor_id INTEGER, month TEXT, issue_date TEXT, due_date TEXT,
      amount REAL, paid_date TEXT, status TEXT, po_number TEXT, dept TEXT);
    CREATE TABLE invoices (id INTEGER PRIMARY KEY, customer_id INTEGER, issue_date TEXT, due_date TEXT, amount REAL,
      paid_date TEXT, status TEXT);
    CREATE TABLE products (sku TEXT PRIMARY KEY, name TEXT, kind TEXT, price REAL, unit_cost REAL, units_month REAL,
      inventory_units INTEGER, lead_time_days INTEGER, elasticity REAL, list_discount REAL);
    CREATE TABLE product_sales (month TEXT, sku TEXT, units REAL, revenue REAL, cost REAL, avg_discount REAL);
    CREATE TABLE debt (id INTEGER PRIMARY KEY, lender TEXT, type TEXT, facility REAL, drawn REAL, rate REAL,
      start_month TEXT, maturity_month TEXT, amort_months INTEGER, covenant TEXT);
    CREATE TABLE controls (id TEXT PRIMARY KEY, area TEXT, name TEXT, owner TEXT, frequency TEXT, risk TEXT,
      last_tested TEXT, result TEXT, exceptions INTEGER, automated INTEGER);
    CREATE TABLE close_tasks (id INTEGER PRIMARY KEY, period TEXT, task TEXT, owner TEXT, due_day INTEGER,
      completed_day INTEGER, status TEXT, depends_on INTEGER);
    CREATE TABLE tax_jurisdictions (id INTEGER PRIMARY KEY, jurisdiction TEXT, type TEXT, rate REAL, base REAL,
      nexus INTEGER, filing TEXT, next_due TEXT);
    CREATE TABLE acquisition_targets (id INTEGER PRIMARY KEY, name TEXT, sector TEXT, revenue REAL, growth REAL,
      gross_margin REAL, ebitda_margin REAL, ask_ev REAL, customers INTEGER, overlap REAL, nrr REAL, hq TEXT);
    CREATE TABLE cap_table (holder TEXT PRIMARY KEY, class TEXT, shares REAL, invested REAL, board_seat INTEGER);
    CREATE TABLE risks (id INTEGER PRIMARY KEY, category TEXT, risk TEXT, likelihood INTEGER, impact INTEGER, owner TEXT, mitigation TEXT);
    CREATE TABLE capex_projects (id INTEGER PRIMARY KEY, name TEXT, category TEXT, investment REAL, annual_benefit REAL,
      years INTEGER, risk TEXT, strategic_score INTEGER);
    CREATE TABLE demo_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT, ts TEXT, params TEXT, rep TEXT);
    CREATE TABLE proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT, prospect TEXT, industry TEXT,
      rep TEXT, inputs TEXT, agent_ids TEXT, summary TEXT);
    CREATE TABLE favorites (agent_id TEXT PRIMARY KEY, ts TEXT);
  `);

  const company = {
    name: 'Northwind Cloud, Inc.',
    industry: 'B2B SaaS — IoT operations platform',
    hq: 'Austin, TX',
    founded: '2019',
    fiscal_year_end: 'December',
    currency: 'USD',
    stage: 'Series B',
    as_of: '2026-09',
    description: 'Fictional demo tenant. Sells per-seat subscriptions plus edge hardware and implementation services to mid-sized operators.',
  };
  const insCompany = db.prepare('INSERT INTO company VALUES (?, ?)');
  for (const [k, v] of Object.entries(company)) insCompany.run(k, v);

  db.exec('BEGIN');

  // ---------- customers & MRR ----------
  const insCust = db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const insMrr = db.prepare('INSERT INTO customer_mrr VALUES (?,?,?)');
  const customers = [];
  const usedNames = new Set();
  const newName = () => {
    for (;;) {
      const n = `${R.pick(PREFIX)} ${R.pick(SUFFIX)}`;
      if (!usedNames.has(n)) { usedNames.add(n); return n; }
      const n2 = `${n} ${R.pick(['Group', 'Co', 'Holdings', 'Partners'])}`;
      if (!usedNames.has(n2)) { usedNames.add(n2); return n2; }
    }
  };
  const pickSegment = () => {
    const x = R.next();
    if (x < SEGMENTS.SMB.share) return 'SMB';
    if (x < SEGMENTS.SMB.share + SEGMENTS['Mid-Market'].share) return 'Mid-Market';
    return 'Enterprise';
  };
  const planFor = (seg) => seg === 'Enterprise' ? 'Enterprise' : seg === 'Mid-Market' ? (R.chance(0.7) ? 'Growth' : 'Enterprise') : (R.chance(0.65) ? 'Starter' : 'Growth');

  // initial base at 2023-01, then monthly adds
  const addsPerMonth = (i) => Math.max(4, Math.round(9 + i * 0.32 + R.normal(0, 2.2)));
  const spawn = (i) => {
    const seg = pickSegment();
    const S = SEGMENTS[seg];
    const mrr = r0(R.between(...S.mrr));
    const channel = R.pick(CHANNELS);
    const chanMult = { 'Paid Search': 1.15, Outbound: 1.3, Partner: 0.8, Organic: 0.55 }[channel];
    const c = {
      id: customers.length + 1, name: newName(), segment: seg, region: R.chance(0.62) ? 'North America' : R.pick(REGIONS),
      channel, plan: null, start: i, churn: null, seats: 0, mrr,
      cac: r0(mrr * S.cacMult * chanMult * R.between(0.8, 1.25)), dso: R.int(...S.dso), hist: [],
    };
    c.plan = planFor(seg);
    c.seats = Math.max(3, Math.round(mrr / ({ Starter: 49, Growth: 89, Enterprise: 149 }[c.plan] * R.between(0.78, 0.97))));
    customers.push(c);
    return c;
  };
  for (let k = 0; k < 140; k++) {
    const c = spawn(0);
    c.start = -R.int(1, 30); // pre-history customer
  }
  for (let i = 0; i < SIM_MONTHS; i++) {
    const adds = i === 0 ? 0 : addsPerMonth(i);
    for (let k = 0; k < adds; k++) spawn(i);
    for (const c of customers) {
      if (c.churn !== null || c.start > i) continue;
      const S = SEGMENTS[c.segment];
      if (c.start < i) {
        const ageBoost = (i - c.start) < 6 ? 1.5 : 1; // young accounts churn more
        if (R.chance(S.churn * ageBoost)) { c.churn = i; continue; }
        if (R.chance(0.055)) c.mrr = r0(c.mrr * R.between(1.04, 1.25));       // expansion event
        else if (R.chance(0.025)) c.mrr = r0(c.mrr * R.between(0.75, 0.95)); // contraction
        else c.mrr = r0(c.mrr * (1 + S.expand * R.between(0, 0.6)));
      }
      c.hist.push([i, c.mrr]);
    }
  }
  for (const c of customers) {
    insCust.run(c.id, c.name, c.segment, c.region, c.channel, c.plan,
      c.start >= 0 ? monthKey(c.start) : monthKey(c.start), c.churn !== null ? monthKey(c.churn) : null,
      c.seats, c.hist[0]?.[1] ?? c.mrr, c.cac, c.dso);
    for (const [i, m] of c.hist) insMrr.run(c.id, monthKey(i), m);
  }

  // ---------- employees ----------
  const insEmp = db.prepare('INSERT INTO employees VALUES (?,?,?,?,?,?,?,?)');
  const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Riley', 'Casey', 'Jamie', 'Avery', 'Quinn', 'Rowan', 'Skyler', 'Dakota', 'Emerson', 'Finley', 'Harper', 'Kai', 'Logan', 'Parker', 'Reese'];
  const LAST = ['Nguyen', 'Patel', 'Garcia', 'Kim', 'Okafor', 'Silva', 'Novak', 'Haddad', 'Larsen', 'Moreau', 'Ito', 'Mensah', 'Kowalski', 'Rossi', 'Schmidt', 'Duarte', 'Ali', 'Brennan', 'Costa', 'Sato'];
  const employees = [];
  const deptMix = { Sales: 0.24, Marketing: 0.09, 'R&D': 0.38, 'G&A': 0.12, 'Customer Success': 0.17 };
  const hire = (startIdx, deptOverride) => {
    let dept = deptOverride;
    if (!dept) { let x = R.next(); for (const [d, w] of Object.entries(deptMix)) { if ((x -= w) <= 0) { dept = d; break; } } dept ??= 'R&D'; }
    const [title, base] = R.pick(TITLES[dept]);
    const e = { id: employees.length + 1, name: `${R.pick(FIRST)} ${R.pick(LAST)}`, dept, title,
      salary: r0(base * R.between(0.88, 1.18) / 500) * 500, location: R.pick(LOCATIONS), start: startIdx, end: null };
    employees.push(e);
    return e;
  };
  for (let k = 0; k < 58; k++) hire(-R.int(1, 40));
  for (let i = 0; i < SIM_MONTHS; i++) {
    const hiresThisMonth = R.int(1, 3);
    for (let k = 0; k < hiresThisMonth; k++) hire(i);
    for (const e of employees) if (e.end === null && e.start < i && R.chance(0.0085)) e.end = i;
  }
  for (const e of employees) insEmp.run(e.id, e.name, e.dept, e.title, e.salary, e.location, monthKey(e.start), e.end !== null ? monthKey(e.end) : null);

  // ---------- products ----------
  const insProd = db.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insPS = db.prepare('INSERT INTO product_sales VALUES (?,?,?,?,?,?)');
  for (const p of PRODUCTS) insProd.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[2] === 'hardware' ? r2(R.between(0.04, 0.14)) : 0);

  // ---------- debt ----------
  const debt = [
    [1, 'Silicon Ridge Bank', 'Term loan', 5000000, 5000000, 0.112, '2025-04', '2028-03', 30, 'Min cash $8M; 3-mo trailing revenue growth > 0'],
    [2, 'Silicon Ridge Bank', 'Revolver', 3000000, 1000000, 0.0925, '2025-01', '2027-12', 0, 'Borrowing base 80% eligible AR'],
    [3, 'Ironclad Equipment Finance', 'Equipment lease', 420000, 420000, 0.079, '2024-11', '2027-10', 36, 'None'],
  ];
  const insDebt = db.prepare('INSERT INTO debt VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (const d of debt) insDebt.run(...d);
  const debtBalanceAt = (mk) => {
    let bal = 0, interest = 0, principal = 0, draws = 0;
    for (const d of debt) {
      const [, , , , drawn, rate, start, maturity, amort] = d;
      if (mk < start) continue;
      const elapsed = monthsBetween(start, mk);
      let b = drawn;
      if (amort > 0) {
        const io = d[3] === 'Term loan' ? 6 : 0; // 6 months interest-only on the term loan
        const amortElapsed = Math.max(0, elapsed - io);
        b = Math.max(0, drawn * (1 - amortElapsed / amort));
        if (elapsed >= io && b > 0) principal += drawn / amort;
      }
      if (mk > maturity) b = 0;
      if (elapsed === 0) draws += drawn;
      bal += b;
      interest += b * rate / 12;
    }
    return { bal, interest, principal, draws };
  };

  // ---------- financial statements ----------
  const insFin = db.prepare(`INSERT INTO financials VALUES (${Array(34).fill('?').join(',')})`);
  const insOpex = db.prepare('INSERT INTO opex_actuals VALUES (?,?,?,?)');
  const insBud = db.prepare('INSERT INTO opex_budget VALUES (?,?,?,?)');
  const insRevBud = db.prepare('INSERT INTO revenue_budget VALUES (?,?,?,?)');
  const firstStmt = SIM_MONTHS - STMT_MONTHS;
  let cash = 31500000;
  let prevAR = null, prevAP = null, prevInv = null, prevDef = null;
  const mrrByMonth = [];
  for (let i = 0; i < SIM_MONTHS; i++) {
    let mrr = 0, count = 0, newC = 0, churnC = 0, newM = 0, expM = 0, churnM = 0;
    for (const c of customers) {
      const h = c.hist.find((x) => x[0] === i);
      const prev = c.hist.find((x) => x[0] === i - 1);
      if (h) { mrr += h[1]; count++; }
      if (c.start === i) { newC++; newM += h ? h[1] : 0; }
      if (c.churn === i) { churnC++; churnM += prev ? prev[1] : 0; }
      if (h && prev) expM += h[1] - prev[1];
    }
    mrrByMonth.push({ mrr, count, newC, churnC, newM, expM, churnM });
  }

  for (let i = firstStmt; i < SIM_MONTHS; i++) {
    const mk = monthKey(i);
    const t = i - firstStmt;
    const season = 1 + 0.06 * Math.sin((2 * Math.PI * ((i % 12) - 2)) / 12);
    const { mrr, count, newC, churnC, newM, expM, churnM } = mrrByMonth[i];
    const revSub = mrr;

    // product & services lines
    let revHw = 0, cogsHw = 0, revSv = 0, cogsSv = 0;
    for (const p of PRODUCTS) {
      if (p[2] === 'subscription') continue;
      const growth = 1 + t * 0.012;
      const units = Math.max(0, r2(p[5] * growth * season * R.between(0.82, 1.18)));
      const disc = p[2] === 'hardware' ? r2(R.between(0.03, 0.16)) : r2(R.between(0, 0.08));
      const rev = r0(units * p[3] * (1 - disc));
      const cost = r0(units * p[4] * R.between(0.96, 1.06));
      insPS.run(mk, p[0], units, rev, cost, disc);
      if (p[2] === 'hardware') { revHw += rev; cogsHw += cost; } else { revSv += rev; cogsSv += cost; }
    }
    const revenue = revSub + revSv + revHw;
    const cogsHosting = r0(revSub * (0.118 - t * 0.0011) * R.between(0.96, 1.05));
    const cogsLic = r0(revSub * 0.031);
    const cogs = cogsHosting + cogsLic + cogsSv + cogsHw;
    const gp = revenue - cogs;

    // opex from people + per-head non-payroll
    const active = employees.filter((e) => e.start <= i && (e.end === null || e.end > i));
    let opex = 0, sm = 0;
    const headByDept = {};
    for (const d of DEPTS) {
      const people = active.filter((e) => e.dept === d);
      headByDept[d] = people.length;
      const payroll = r0(people.reduce((s, e) => s + e.salary, 0) / 12 * 1.21 * (d === 'Sales' ? 1.32 : 1)); // burden + commission
      const lines = { Payroll: payroll };
      for (const l of NONPAY_LINES) {
        let base = NONPAY_BASE[d][l] * people.length;
        if (l === 'Programs' && d === 'Marketing') base = (92000 + t * 2400) * season;
        if (l === 'Travel & Events') base *= season;
        lines[l] = r0(base * R.between(0.78, 1.25));
      }
      // budget: planned a year earlier with optimistic headcount + tighter non-payroll
      for (const [l, amt] of Object.entries(lines)) {
        const budgetBias = l === 'Payroll' ? R.between(0.97, 1.06) : l === 'Contractors' ? R.between(0.65, 0.95) : R.between(0.85, 1.12);
        insOpex.run(mk, d, l, amt);
        insBud.run(mk, d, l, r0(amt * budgetBias));
        opex += amt;
        if (d === 'Sales' || d === 'Marketing') sm += amt;
      }
    }
    const ebitda = gp - opex;
    const dep = r0(118000 + t * 2200);
    const debtInfo = debtBalanceAt(mk);
    const interest = r0(debtInfo.interest);
    const taxes = r0(8500 + revenue * 0.0025);
    const ni = ebitda - dep - interest - taxes;
    const capex = r0(R.between(55000, 140000) + (t % 6 === 2 ? 260000 : 0));

    // working capital
    const ar = r0(revenue * R.between(1.32, 1.52));
    const ap = r0((cogs + opex * 0.32) * R.between(0.78, 0.98));
    const invBal = r0(PRODUCTS.filter((p) => p[2] === 'hardware').reduce((s, p) => s + p[6] * p[4], 0) * (1 + t * 0.008) * R.between(0.92, 1.08));
    const defRev = r0(revSub * 2.6 * R.between(0.95, 1.05));
    const dAR = prevAR === null ? 0 : ar - prevAR;
    const dAP = prevAP === null ? 0 : ap - prevAP;
    const dInv = prevInv === null ? 0 : invBal - prevInv;
    const dDef = prevDef === null ? 0 : defRev - prevDef;
    prevAR = ar; prevAP = ap; prevInv = invBal; prevDef = defRev;
    const cashBegin = cash;
    cash = cash + ni + dep - capex - dAR + dAP - dInv + dDef - debtInfo.principal + debtInfo.draws;

    const headcount = active.length;
    insFin.run(mk, r0(revSub), r0(revSv), r0(revHw), r0(revenue), cogsHosting, cogsLic, r0(cogsSv), r0(cogsHw), r0(cogs),
      r0(gp), r0(opex), r0(ebitda), dep, interest, taxes, r0(ni), capex, ar, ap, invBal, defRev,
      r0(cashBegin), r0(cash), r0(debtInfo.bal), headcount, r0(mrr), count, newC, churnC, r0(newM), r0(expM), r0(churnM), r0(sm));

    insRevBud.run(mk, r0(revenue * R.between(1.0, 1.09)), r0(cogs * R.between(0.93, 1.02)), headcount + R.int(0, 6));

    // forecast history: what we predicted 1, 3 and 6 months before
    for (const h of [1, 3, 6]) {
      const bias = 1 + R.normal(0.018 * h / 3, 0.022 * Math.sqrt(h));
      insFH(db, mk, monthKey(i - h), h, r0(revenue * bias), h === 6 ? 'Annual plan' : h === 3 ? 'Quarterly reforecast' : 'Rolling forecast');
    }
  }

  // ---------- invoices (AR) for the last 7 months ----------
  const insInv = db.prepare('INSERT INTO invoices VALUES (?,?,?,?,?,?,?)');
  const asOf = '2026-09-30';
  let invId = 1;
  const asOfDate = new Date(asOf + 'T00:00:00Z');
  for (const c of customers) {
    for (const [i, m] of c.hist) {
      if (i < SIM_MONTHS - 7) continue;
      const issue = new Date(Date.UTC(2023, i, 1));
      const terms = c.segment === 'Enterprise' ? 45 : 30;
      const due = addDays(issue, terms);
      const lateness = c.dso - terms + R.normal(0, 9) + (R.chance(0.04) ? R.between(40, 120) : 0);
      const paid = addDays(due, Math.round(lateness));
      const isPaid = paid <= asOfDate;
      const amount = r0(m * (c.segment === 'Enterprise' ? 1 : 1) + (R.chance(0.08) ? R.between(500, 9000) : 0));
      insInv.run(invId++, c.id, iso(issue), iso(due), amount, isPaid ? iso(paid) : null, isPaid ? 'paid' : (due < asOfDate ? 'overdue' : 'open'));
    }
  }

  // ---------- vendors & bills (AP) ----------
  const insVen = db.prepare('INSERT INTO vendors VALUES (?,?,?,?,?,?,?,?)');
  const insBill = db.prepare('INSERT INTO bills VALUES (?,?,?,?,?,?,?,?,?,?)');
  const vendorScale = { 'Cloud Hosting': 62000, Software: 9000, Recruiting: 14000, Marketing: 26000, 'Professional Services': 21000, Facilities: 19000, Hardware: 48000, Travel: 11000, Insurance: 9500 };
  const vendorDept = { 'Cloud Hosting': 'R&D', Software: 'G&A', Recruiting: 'G&A', Marketing: 'Marketing', 'Professional Services': 'G&A', Facilities: 'G&A', Hardware: 'R&D', Travel: 'Sales', Insurance: 'G&A' };
  let billId = 1;
  VENDORS.forEach((v, idx) => {
    const id = idx + 1;
    const contractEnd = monthKey(SIM_MONTHS + R.int(-1, 14));
    insVen.run(id, v[0], v[1], v[2], v[3], contractEnd, R.chance(0.6) ? 1 : 0, R.pick(['Ops', 'IT', 'Marketing', 'Finance', 'Engineering']));
    const base = vendorScale[v[1]] * R.between(0.25, 1.6);
    const termsDays = parseInt(v[2].split(' ')[1], 10);
    for (let i = SIM_MONTHS - 12; i < SIM_MONTHS; i++) {
      const nBills = v[1] === 'Travel' ? R.int(2, 4) : 1;
      for (let k = 0; k < nBills; k++) {
        const issue = addDays(new Date(Date.UTC(2023, i, 1)), R.int(0, 20));
        const due = addDays(issue, termsDays);
        const amount = r0(base / nBills * R.between(0.85, 1.2) * (1 + (i - SIM_MONTHS + 12) * 0.01));
        const payLag = R.normal(-2, 6);
        const paid = addDays(due, Math.round(payLag));
        const isPaid = paid <= asOfDate;
        const hasPO = R.chance(v[1] === 'Travel' ? 0.2 : 0.86);
        insBill.run(billId++, id, monthKey(i), iso(issue), iso(due), amount, isPaid ? iso(paid) : null,
          isPaid ? 'paid' : 'open', hasPO ? `PO-${10000 + billId}` : null, vendorDept[v[1]]);
      }
    }
  });
  // planted anomalies for the AP / controls agents: a duplicate bill and a round-dollar no-PO bill
  db.prepare("INSERT INTO bills SELECT NULL, vendor_id, month, issue_date, due_date, amount, NULL, 'open', po_number, dept FROM bills WHERE vendor_id = 16 AND month = '2026-09'").run();
  insBill.run(null, 17, '2026-09', '2026-09-12', '2026-10-27', 45000, null, 'open', null, 'G&A');

  // ---------- controls, close, tax, risk ----------
  const insCtl = db.prepare('INSERT INTO controls VALUES (?,?,?,?,?,?,?,?,?,?)');
  const CONTROLS = [
    ['RC-01', 'Revenue', 'Contract review before revenue recognition', 'Controller', 'Per contract', 'High'],
    ['RC-02', 'Revenue', 'Monthly deferred revenue rollforward reconciliation', 'Senior Accountant', 'Monthly', 'High'],
    ['RC-03', 'Revenue', 'Credit memo approval > $5k', 'Controller', 'Per event', 'Medium'],
    ['PC-01', 'Procure-to-Pay', 'Three-way match (PO, receipt, invoice)', 'AP Lead', 'Per invoice', 'High'],
    ['PC-02', 'Procure-to-Pay', 'Vendor master changes dual approval', 'Controller', 'Per event', 'High'],
    ['PC-03', 'Procure-to-Pay', 'Duplicate payment detection', 'AP Lead', 'Weekly', 'Medium'],
    ['PC-04', 'Procure-to-Pay', 'Payment run approval by two signatories', 'CFO', 'Weekly', 'High'],
    ['PY-01', 'Payroll', 'Payroll register review vs HRIS', 'People Ops', 'Per cycle', 'Medium'],
    ['PY-02', 'Payroll', 'New-hire / termination change log review', 'People Ops', 'Monthly', 'Medium'],
    ['TR-01', 'Treasury', 'Bank reconciliations within 5 business days', 'Senior Accountant', 'Monthly', 'High'],
    ['TR-02', 'Treasury', 'Wire transfer callback verification', 'Treasury', 'Per event', 'High'],
    ['FR-01', 'Financial Reporting', 'Journal entries > $25k reviewed', 'Controller', 'Monthly', 'High'],
    ['FR-02', 'Financial Reporting', 'Flux analysis on P&L lines > 10% change', 'FP&A', 'Monthly', 'Medium'],
    ['FR-03', 'Financial Reporting', 'Account reconciliations signed-off', 'Controller', 'Monthly', 'Medium'],
    ['IT-01', 'IT General', 'Quarterly ERP user access review', 'IT Admin', 'Quarterly', 'High'],
    ['IT-02', 'IT General', 'Segregation of duties conflicts report', 'IT Admin', 'Quarterly', 'High'],
    ['IT-03', 'IT General', 'Change management for financial systems', 'IT Admin', 'Per change', 'Medium'],
    ['IN-01', 'Inventory', 'Quarterly cycle count', 'Ops Manager', 'Quarterly', 'Medium'],
    ['TX-01', 'Tax', 'Sales tax nexus review', 'Tax Manager', 'Quarterly', 'Medium'],
    ['TX-02', 'Tax', 'Income tax provision review', 'Tax Manager', 'Quarterly', 'Medium'],
  ];
  for (const c of CONTROLS) {
    const res = R.next();
    const result = res < 0.7 ? 'Effective' : res < 0.88 ? 'Deficiency' : res < 0.95 ? 'Not tested' : 'Significant deficiency';
    const exc = result === 'Effective' ? 0 : result === 'Not tested' ? 0 : R.int(1, 6);
    insCtl.run(...c, monthKey(SIM_MONTHS - R.int(1, 9)), result, exc, R.chance(0.35) ? 1 : 0);
  }
  // force the planted AP anomaly to show as a weakness in duplicate detection
  db.prepare("UPDATE controls SET result='Deficiency', exceptions=2 WHERE id='PC-03'").run();

  const insClose = db.prepare('INSERT INTO close_tasks VALUES (?,?,?,?,?,?,?,?)');
  const CLOSE = [
    ['Cut-off: freeze AP sub-ledger', 'AP Lead', 1, null], ['Accrue unbilled vendor costs', 'Senior Accountant', 2, 1],
    ['Record payroll & commissions', 'Payroll Specialist', 2, null], ['Bank reconciliations', 'Senior Accountant', 2, null],
    ['Revenue: invoice run & usage true-up', 'Billing Ops', 2, null], ['Deferred revenue rollforward', 'Senior Accountant', 3, 5],
    ['Prepaid expense amortization', 'Staff Accountant', 3, null], ['Fixed asset depreciation', 'Staff Accountant', 3, null],
    ['Inventory valuation & reserve', 'Ops Accountant', 4, null], ['Intercompany reconciliation (UK, CA)', 'Senior Accountant', 4, null],
    ['FX revaluation', 'Staff Accountant', 4, 10], ['Debt interest accrual', 'Treasury', 3, null],
    ['Stock comp expense', 'Controller', 4, 3], ['Balance sheet reconciliations', 'Accounting team', 5, 4],
    ['Flux analysis vs prior month & budget', 'FP&A', 5, 14], ['Controller review of JE > $25k', 'Controller', 6, 14],
    ['Draft financial statements', 'Controller', 6, 16], ['Management reporting pack', 'FP&A', 7, 17],
    ['CFO sign-off', 'CFO', 8, 18], ['Board metrics refresh', 'FP&A', 8, 18],
  ];
  CLOSE.forEach((c, idx) => {
    const late = R.chance(0.25) ? R.int(1, 3) : 0;
    const done = idx < 13 ? c[2] + late : null;
    const status = done ? (late ? 'Done (late)' : 'Done') : idx < 16 ? 'In progress' : 'Not started';
    insClose.run(idx + 1, '2026-09', c[0], c[1], c[2], done, status, c[3]);
  });

  const insTax = db.prepare('INSERT INTO tax_jurisdictions VALUES (?,?,?,?,?,?,?,?)');
  const TAX = [
    ['US Federal', 'Income', 0.21, 0, 1, 'Annual', '2027-04-15'], ['Texas', 'Franchise (margin)', 0.0075, 0, 1, 'Annual', '2027-05-15'],
    ['California', 'Income', 0.0884, 0, 1, 'Annual', '2027-04-15'], ['New York', 'Sales & use', 0.08875, 0, 1, 'Quarterly', '2026-12-20'],
    ['Texas', 'Sales & use', 0.0825, 0, 1, 'Monthly', '2026-10-20'], ['Washington', 'B&O', 0.015, 0, 0, 'Quarterly', '2026-10-31'],
    ['Illinois', 'Sales & use', 0.0625, 0, 0, 'Quarterly', '2026-10-20'], ['United Kingdom', 'Corporate', 0.25, 0, 1, 'Annual', '2027-09-30'],
    ['United Kingdom', 'VAT', 0.2, 0, 1, 'Quarterly', '2026-11-07'], ['Canada (ON)', 'GST/HST', 0.13, 0, 1, 'Quarterly', '2026-10-31'],
    ['Germany', 'VAT (OSS)', 0.19, 0, 0, 'Quarterly', '2026-10-31'],
  ];
  const lastRev = db.prepare("SELECT SUM(revenue) r FROM financials WHERE month > '2025-09'").get().r;
  TAX.forEach((t, idx) => {
    const share = { 'US Federal': 1, Texas: 0.14, California: 0.18, 'New York': 0.11, Washington: 0.05, Illinois: 0.06, 'United Kingdom': 0.13, 'Canada (ON)': 0.07, Germany: 0.05 }[t[0]] ?? 0.05;
    insTax.run(idx + 1, t[0], t[1], t[2], r0(lastRev * share), t[4], t[5], t[6]);
  });

  const insRisk = db.prepare('INSERT INTO risks VALUES (?,?,?,?,?,?,?)');
  [
    ['Liquidity', 'Runway compresses below 18 months if growth slows', 3, 5, 'CFO', 'Quarterly reforecast; hiring gates tied to ARR'],
    ['Customer', 'Top-10 customer concentration above 25% of ARR', 3, 4, 'CRO', 'Multi-threading, exec sponsors, renewals 120 days early'],
    ['Credit', 'Enterprise DSO creeping past 70 days', 4, 3, 'Controller', 'Collections cadence; payment terms enforcement'],
    ['Covenant', 'Venture debt min-cash covenant ($8M)', 2, 5, 'CFO', 'Monthly covenant model; lender communication'],
    ['FX', 'GBP/CAD revenue translation exposure', 3, 2, 'Treasury', 'Natural hedge via local payroll'],
    ['Supply chain', 'Single-source gateway components (SensorWorks)', 3, 4, 'COO', 'Second-source qualification; 60-day safety stock'],
    ['Cyber', 'Ransomware / data breach of customer telemetry', 2, 5, 'CISO', 'SOC 2, EDR, immutable backups, cyber insurance'],
    ['Compliance', 'Sales tax nexus in new states not registered', 3, 3, 'Tax Manager', 'Quarterly nexus study'],
    ['People', 'Key-person dependency in platform engineering', 3, 3, 'CTO', 'Succession plans; retention grants'],
    ['Market', 'Price pressure from bundled competitors', 4, 3, 'CMO', 'Value-based packaging; ROI collateral'],
    ['Interest rate', 'Floating revolver rate increase', 2, 2, 'Treasury', 'Pay down revolver from excess cash'],
    ['Vendor', 'Cloud hosting cost increase at renewal', 3, 3, 'CTO', 'Reserved instances; multi-cloud quote'],
  ].forEach((r, idx) => insRisk.run(idx + 1, ...r));

  const insTgt = db.prepare('INSERT INTO acquisition_targets VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  [
    ['FleetPulse', 'Telematics SaaS', 4.2e6, 0.48, 0.78, -0.12, 38e6, 210, 0.35, 1.14, 'Denver'],
    ['GridSense Analytics', 'Energy analytics', 7.8e6, 0.22, 0.71, 0.08, 52e6, 95, 0.2, 1.06, 'Boston'],
    ['ColdChain IQ', 'Cold-chain monitoring', 2.6e6, 0.65, 0.69, -0.31, 29e6, 140, 0.55, 1.21, 'Chicago'],
    ['Warehouse Bot Co', 'Robotics software', 11.5e6, 0.18, 0.58, 0.04, 70e6, 60, 0.15, 1.02, 'Pittsburgh'],
    ['SiteSafe', 'EHS compliance SaaS', 5.1e6, 0.31, 0.82, 0.02, 41e6, 330, 0.4, 1.09, 'Toronto'],
    ['AssetTrack Pro', 'Asset tracking', 3.3e6, 0.12, 0.66, 0.11, 14e6, 520, 0.6, 0.97, 'Atlanta'],
    ['Predictive Motors', 'Predictive maintenance AI', 1.9e6, 0.92, 0.74, -0.55, 33e6, 45, 0.45, 1.28, 'San Jose'],
    ['ShelfVision', 'Retail computer vision', 6.4e6, 0.27, 0.62, -0.04, 39e6, 120, 0.1, 1.05, 'London'],
  ].forEach((t, idx) => insTgt.run(idx + 1, ...t));

  const insCap = db.prepare('INSERT INTO cap_table VALUES (?,?,?,?,?)');
  [
    ['Founders & employees (common)', 'Common', 21.5e6, 0, 2], ['Option pool (granted + available)', 'Options', 6.2e6, 0, 0],
    ['Seed — Lantern Ventures', 'Seed Preferred', 5.4e6, 3.5e6, 1], ['Series A — Brightline Capital', 'Series A Preferred', 8.1e6, 14e6, 1],
    ['Series B — Summit Growth Partners', 'Series B Preferred', 7.6e6, 32e6, 1], ['Series B — Northgate Strategic', 'Series B Preferred', 1.9e6, 8e6, 0],
  ].forEach((c) => insCap.run(...c));

  const insCapex = db.prepare('INSERT INTO capex_projects VALUES (?,?,?,?,?,?,?,?)');
  [
    ['Self-serve onboarding rebuild', 'Product', 650000, 420000, 4, 'Medium', 8],
    ['Data platform migration', 'Infrastructure', 1100000, 380000, 5, 'High', 7],
    ['EMEA sales pod expansion', 'Go-to-market', 1400000, 900000, 3, 'High', 9],
    ['Billing system replacement', 'Systems', 480000, 210000, 5, 'Low', 6],
    ['Gateway G3 hardware NPI', 'Product', 1800000, 760000, 4, 'High', 8],
    ['Support automation (AI deflection)', 'Operations', 260000, 240000, 3, 'Low', 7],
    ['Partner channel program', 'Go-to-market', 520000, 360000, 3, 'Medium', 7],
    ['SOC 2 Type II + ISO 27001', 'Compliance', 210000, 150000, 3, 'Low', 9],
  ].forEach((c, idx) => insCapex.run(idx + 1, ...c));

  // some realistic demo usage so the enablement analytics aren't empty
  const insRun = db.prepare('INSERT INTO demo_runs (agent_id, ts, params, rep) VALUES (?,?,?,?)');
  const popular = ['financial-modeling', 'cash-flow-forecast', 'runway-calculator', 'variance-analysis', 'board-pack-builder', 'saas-metrics', 'scenario-planning', 'accounts-receivable', 'monthly-close', 'cfo-decision-support', 'budget-planning', 'unit-economics', 'kpi-dashboard', 'burn-rate-monitor', 'vendor-spend'];
  const reps = ['Dana (AE, West)', 'Marcus (AE, East)', 'Priya (SE)', 'Tom (AE, EMEA)', 'Lena (SE, EMEA)'];
  for (let k = 0; k < 160; k++) {
    const d = addDays(new Date(Date.UTC(2026, 6, 1)), R.int(0, 92));
    insRun.run(R.chance(0.75) ? R.pick(popular) : R.pick(popular.slice(0, 5)), d.toISOString(), '{}', R.pick(reps));
  }

  db.exec('COMMIT');
  return db;
}

function insFH(db, month, madeIn, horizon, value, method) {
  db.prepare('INSERT INTO forecast_history VALUES (?,?,?,?,?)').run(month, madeIn, horizon, value, method);
}
function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
function iso(d) { return d.toISOString().slice(0, 10); }
export function monthsBetween(a, b) {
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'northwind.db');
  const db = generate(out);
  const f = db.prepare('SELECT month, revenue, gross_profit, opex, ebitda, net_income, cash_end, headcount, mrr, customers FROM financials').all();
  console.table(f.map((r) => ({ ...r })));
  console.log('Seeded', out);
}
