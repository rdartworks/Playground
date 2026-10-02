// Sales-enablement metadata for the 50 agents. Computation lives in ./agents/*.js;
// this file is what a rep reads: positioning, buyer, value, talk track, ROI drivers.

export const CATEGORIES = {
  planning: {
    name: 'Planning & Forecasting', color: 1,
    blurb: 'Driver-based models, forecasts and scenarios that refresh from actuals instead of spreadsheets.',
    discovery: ['How long does a full reforecast take today, and who is involved?', 'How many spreadsheet versions of the model exist right now?', 'When did a forecast miss last surprise the board?'],
    objections: [
      { q: 'We already have Anaplan / Adaptive.', a: 'Agents sit on top of your planning tool: they generate drivers, commentary and scenarios from actuals, so analysts stop doing the copy-paste work in between.' },
      { q: 'Our model is too bespoke to automate.', a: 'The agent starts from your chart of accounts and drivers; bespoke logic is configured once and reused every cycle.' },
    ],
  },
  reporting: {
    name: 'Reporting & Analytics', color: 2,
    blurb: 'Close-to-report in hours: variance commentary, KPI packs and board materials generated from the ledger.',
    discovery: ['How many days after close does the management pack go out?', 'Who writes variance commentary today and how long does it take?', 'How often do numbers differ between the board deck and the GL?'],
    objections: [
      { q: 'Our BI tool already has dashboards.', a: 'Dashboards show numbers; agents explain them — drivers, variances and narrative — and assemble the pack your executives actually read.' },
      { q: 'We can’t let AI write board materials.', a: 'Every number is tied to the ledger and every narrative is a draft routed to an owner for approval. Nothing goes out unreviewed.' },
    ],
  },
  cash: {
    name: 'Cash & Treasury', color: 3,
    blurb: 'Know your cash position, runway and debt obligations every day — not every month.',
    discovery: ['How confident are you in cash 13 weeks out?', 'How close are you to any lender covenant?', 'How much idle cash is earning nothing?'],
    objections: [
      { q: 'Treasury is small for us.', a: 'That is the point — the agent gives a lean team treasury-grade visibility (covenants, ladders, runway) without hiring.' },
      { q: 'Bank data is sensitive.', a: 'Read-only bank feeds, SOC 2 controls and role-based access; the agent never moves money.' },
    ],
  },
  ops: {
    name: 'Finance Operations', color: 4,
    blurb: 'Faster close, cleaner AP/AR and payroll plans — with exceptions surfaced before they become problems.',
    discovery: ['What is your close day today and what is the target?', 'How do you catch duplicate vendor invoices?', 'What is your DSO and how is collections prioritised?'],
    objections: [
      { q: 'Our ERP already automates AP.', a: 'ERPs process transactions; the agent tests 100% of them for duplicates, missing POs and discount capture, and builds the payment run.' },
      { q: 'We worry about headcount implications.', a: 'Customers redeploy freed hours to analysis and business partnering — the work finance teams want to do.' },
    ],
  },
  saas: {
    name: 'SaaS & Unit Economics', color: 5,
    blurb: 'Board-grade SaaS metrics computed from customer-level data — NRR, cohorts, CAC payback, churn.',
    discovery: ['How do you calculate NRR today and does everyone agree on it?', 'Can you see retention by cohort and segment?', 'Which acquisition channel has the best payback?'],
    objections: [
      { q: 'Our CRM has these metrics.', a: 'CRM metrics are bookings-based. The agent reconciles to billing and the GL so investors and auditors see the same number.' },
      { q: 'Definitions vary by investor.', a: 'Definitions are configurable and documented; the agent can show several conventions side-by-side.' },
    ],
  },
  strategy: {
    name: 'Strategy & Corporate Development', color: 6,
    blurb: 'Decision-grade analysis for M&A, valuation, fundraising and big bets — in hours, not weeks.',
    discovery: ['What strategic decisions are on the table this year?', 'How long did the last business case take to build?', 'Do you have a live view of what the company is worth?'],
    objections: [
      { q: 'We use bankers for this.', a: 'Agents prepare you before bankers are engaged — screening, first-cut valuation and data-room metrics — so you spend advisor fees on judgement, not spreadsheets.' },
      { q: 'These decisions need human judgement.', a: 'Agreed. The agent gives the CFO quantified options, probabilities and trade-offs; the decision stays with the leadership team.' },
    ],
  },
  cost: {
    name: 'Cost, Pricing & Procurement', color: 7,
    blurb: 'Find margin: savings levers, vendor negotiations, pricing and inventory working capital.',
    discovery: ['When did you last benchmark top vendor contracts?', 'How much discounting happens without approval?', 'How much cash is tied up in inventory?'],
    objections: [
      { q: 'We did a cost exercise last year.', a: 'Costs drift back within quarters. The agent monitors continuously and flags renewals 9 months out.' },
      { q: 'Procurement owns vendors, not finance.', a: 'The agent produces negotiation briefs procurement can use directly — usage, benchmarks and walk-away points.' },
    ],
  },
  risk: {
    name: 'Risk, Tax & Compliance', color: 8,
    blurb: 'Continuous controls testing, audit readiness, tax planning and compliance monitoring.',
    discovery: ['How are controls tested today — sample or full population?', 'How many weeks does audit prep take?', 'Are you confident about sales-tax nexus in every state you sell into?'],
    objections: [
      { q: 'Auditors won’t rely on AI.', a: 'The agent produces evidence and full-population test results; auditors review the same documents faster.' },
      { q: 'Compliance is a legal matter.', a: 'The agent monitors obligations and flags gaps; legal and tax advisors decide remediation.' },
    ],
  },
};

// [num, id, name, category, maturity, hoursSaved/mo, listPrice/mo, personas, tagline, pain, [value props], integrations, roiLever?]
const A = [
  [1, 'financial-modeling', 'Financial Modeling Agent', 'planning', 'GA', 40, 1200, ['CFO', 'FP&A'], 'Three-statement driver model that rebuilds itself from actuals.', 'Models live in fragile spreadsheets that take days to roll forward.', ['Rolls forward on close day automatically', 'Driver changes flow through P&L, cash and headcount instantly', 'Audit trail on every assumption'], ['NetSuite', 'QuickBooks', 'Salesforce', 'Excel']],
  [2, 'budget-planning', 'Budget Planning Agent', 'planning', 'GA', 60, 1000, ['FP&A', 'Department heads'], 'Top-down envelopes and bottoms-up templates in one pass.', 'Annual budgeting consumes 6–10 weeks and dozens of email threads.', ['Pre-fills department templates from TTM actuals', 'Allocates the envelope by growth strategy', 'Shows implied hiring capacity'], ['NetSuite', 'Workday', 'Google Sheets']],
  [3, 'cash-flow-forecast', 'Cash Flow Forecast Agent', 'planning', 'GA', 24, 900, ['CFO', 'Treasury', 'Controller'], '13-week cash forecast built invoice-by-invoice.', 'Weekly cash forecasts are manual and stale by Tuesday.', ['Collections modelled per customer payment behaviour', 'Payroll and vendor runs on actual due dates', 'Stress-tests collection slips'], ['Bank feeds (Plaid)', 'NetSuite', 'Bill.com']],
  [4, 'revenue-forecasting', 'Revenue Forecasting Agent', 'planning', 'GA', 20, 900, ['CFO', 'FP&A', 'RevOps'], 'Cohort and trend forecasts with confidence bands.', 'Revenue forecasts rely on gut-feel pipeline calls.', ['Cohort build-up from new, expansion and churn MRR', 'Trend model as a cross-check', '90% confidence bands for board guidance'], ['Stripe', 'Chargebee', 'Salesforce']],
  [5, 'expense-analysis', 'Expense Analysis Agent', 'reporting', 'GA', 16, 600, ['FP&A', 'Controller'], 'Where the money goes, and what is growing fastest.', 'Spend reviews happen once a year — after the overspend.', ['Category and department trends in one view', 'Flags fastest-growing lines automatically', 'Separates controllable from fixed spend'], ['NetSuite', 'Expensify', 'Ramp']],
  [6, 'variance-analysis', 'Variance Analysis Agent', 'reporting', 'GA', 30, 900, ['FP&A', 'CFO'], 'Budget-vs-actual with drivers and commentary drafted.', 'Analysts spend days chasing explanations for variances.', ['Materiality filter cuts noise', 'EBITDA bridge from budget to actual', 'Drafts likely drivers for owner sign-off'], ['NetSuite', 'Adaptive', 'Slack']],
  [7, 'profitability-analyst', 'Profitability Analyst', 'reporting', 'GA', 18, 900, ['CFO', 'FP&A', 'CRO'], 'Contribution margin by segment, product and region.', 'Nobody knows which customers actually make money.', ['Allocates COGS, CS and S&M with transparent rules', 'Segment, product and region views', 'Feeds pricing and coverage decisions'], ['NetSuite', 'Salesforce', 'Stripe']],
  [8, 'pricing-strategy', 'Pricing Strategy Agent', 'cost', 'Beta', 12, 1100, ['CFO', 'CRO', 'Product'], 'Price-volume optimisation from realised prices and elasticity.', 'Price changes are debated on opinion, not data.', ['Realised vs list price by segment', 'Elasticity-based profit curve', 'Grandfathering strategy'], ['Stripe', 'Salesforce CPQ']],
  [9, 'scenario-planning', 'Scenario Planning Agent', 'planning', 'GA', 20, 1000, ['CFO', 'CEO', 'Board'], 'Base, upside, downside and efficiency cases with covenant checks.', 'Scenarios take a week to build and are out of date by the board meeting.', ['Four scenarios in seconds', 'Covenant breach detection', 'Trigger points for each playbook'], ['Excel', 'NetSuite']],
  [10, 'break-even', 'Break-Even Analyst', 'planning', 'GA', 6, 400, ['CFO', 'CEO'], 'How far to break-even, and which lever closes the gap fastest.', 'Break-even targets are static and ignore mix.', ['Contribution-margin based break-even', 'Price and fixed-cost levers', 'Unit-level hardware economics'], ['NetSuite', 'QuickBooks']],
  [11, 'fpa-reporting', 'FP&A Reporting Agent', 'reporting', 'GA', 32, 900, ['FP&A', 'Controller'], 'Monthly P&L pack with MoM, budget and mix analysis.', 'The monthly pack is rebuilt by hand after every close.', ['P&L with MoM and budget columns', 'Revenue mix and margin trends', 'Publishes the day the books close'], ['NetSuite', 'Google Drive', 'Slack']],
  [12, 'management-reporting', 'Management Reporting Agent', 'reporting', 'GA', 28, 900, ['CFO', 'Exec team'], 'Audience-aware quarterly reports for execs, department heads or all-hands.', 'One pack does not fit every audience, so finance builds three.', ['Tailors depth and detail to the audience', 'Department scorecards', 'Consistent highlights across versions'], ['NetSuite', 'Google Slides', 'Notion']],
  [13, 'kpi-dashboard', 'KPI Dashboard Agent', 'reporting', 'GA', 14, 700, ['CEO', 'CFO', 'Board'], '12 benchmarked KPIs with status in one glance.', 'KPIs are scattered across tools with conflicting definitions.', ['Benchmarks built in', 'One definition per KPI, reconciled to GL', 'Alerts when a KPI crosses its threshold'], ['Stripe', 'NetSuite', 'Slack', 'Looker']],
  [14, 'monthly-close', 'Monthly Close Assistant', 'ops', 'GA', 55, 1200, ['Controller', 'Accounting'], 'Close checklist, critical path and automation of routine tasks.', 'Close takes 10+ days and nobody can see what is blocking it.', ['Live close calendar with dependencies', 'Flags late and blocked tasks', 'Automates reconciliations, accruals and flux'], ['NetSuite', 'BlackLine', 'FloQast', 'Slack']],
  [15, 'board-pack-builder', 'Board Pack Builder', 'reporting', 'GA', 36, 1200, ['CFO', 'CEO'], 'Board deck outline and financials assembled from the closed books.', 'Board prep eats two weeks of the CFO’s quarter.', ['Seven standard sections auto-populated', 'Quarterly, prior and year-ago comparisons', 'Owner routing for narrative edits'], ['Google Slides', 'PowerPoint', 'NetSuite']],
  [16, 'investor-update', 'Investor Update Agent', 'reporting', 'GA', 8, 400, ['CEO', 'CFO'], 'Monthly investor email drafted from live metrics.', 'Founders skip updates because they take a day to write.', ['Highlights, lowlights and asks drafted', 'Numbers pulled from the books', 'Concise or detailed formats'], ['Gmail', 'Outlook', 'Carta']],
  [17, 'runway-calculator', 'Runway Calculator', 'planning', 'GA', 6, 400, ['CEO', 'CFO', 'Board'], 'Modelled runway with hiring, growth and funding levers.', 'Simple cash ÷ burn runway misleads when margins improve.', ['Modelled vs simple runway', 'Covenant-floor runway', 'Hiring sensitivity table'], ['Bank feeds', 'NetSuite']],
  [18, 'burn-rate-monitor', 'Burn Rate Monitor', 'cash', 'GA', 6, 400, ['CFO', 'CEO'], 'Gross and net burn with alerts when thresholds are crossed.', 'Burn spikes are discovered at month-end, too late to act.', ['Gross, net and operating burn', 'Configurable alert threshold', 'Trend vs prior quarter'], ['Bank feeds', 'Slack']],
  [19, 'working-capital', 'Working Capital Analyst', 'cash', 'GA', 12, 800, ['CFO', 'Treasury', 'Controller'], 'DSO, DPO, DIO and the cash locked up in each.', 'Cash is trapped in receivables and inventory without anyone owning it.', ['Cash conversion cycle trend', 'Cash release bridge to targets', 'Links to AR and AP agents'], ['NetSuite', 'Bill.com']],
  [20, 'accounts-receivable', 'Accounts Receivable Agent', 'ops', 'GA', 40, 900, ['Controller', 'AR team'], 'Risk-ranked collections worklist with next best action.', 'Collections chase the oldest invoices, not the riskiest dollars.', ['Aging with expected-loss reserve', 'Worklist ranked by amount × risk', 'Dunning actions drafted'], ['NetSuite', 'Stripe', 'Salesforce', 'Gmail'], { driver: 'dso', label: 'DSO reduction', days: 6 }],
  [21, 'accounts-payable', 'Accounts Payable Agent', 'ops', 'GA', 45, 900, ['Controller', 'AP team'], 'Payment runs with duplicate detection and discount capture.', 'Duplicate payments and missed early-pay discounts leak cash.', ['100% duplicate and no-PO screening', 'Payment run proposal by due date', 'Early-pay discount capture'], ['NetSuite', 'Bill.com', 'Coupa'], { driver: 'ap', label: 'Duplicates & discounts', pct: 0.006 }],
  [22, 'payroll-planning', 'Payroll Planning Agent', 'ops', 'GA', 14, 700, ['CFO', 'People Ops', 'FP&A'], 'Fully-loaded payroll plan with hires, merit and attrition.', 'Payroll — the biggest cost — is planned in a separate spreadsheet from the budget.', ['Department payroll and burden', 'Merit timing trade-offs', 'Hire plan tied to cash forecast'], ['Workday', 'Rippling', 'Gusto']],
  [23, 'treasury-forecast', 'Treasury Forecast Agent', 'cash', 'Beta', 10, 900, ['CFO', 'Treasury'], 'Liquidity ladder, yield optimisation and bank exposure.', 'Idle cash earns nothing while counterparty risk concentrates.', ['Operating buffer sized to burn', 'MMF and T-bill ladder', 'Bank concentration view'], ['Bank feeds', 'Treasury portals'], { driver: 'yield', label: 'Yield on idle cash', pct: 0.01 }],
  [24, 'debt-schedule', 'Debt Schedule Agent', 'cash', 'GA', 8, 600, ['CFO', 'Treasury', 'Controller'], 'Amortisation, interest and covenant headroom across facilities.', 'Debt schedules and covenant calcs live in a single person’s spreadsheet.', ['24-month debt service schedule', 'Covenant headroom', 'Prepayment savings'], ['NetSuite', 'Lender portals']],
  [25, 'capital-allocation', 'Capital Allocation Agent', 'cash', 'Beta', 10, 1100, ['CFO', 'CEO'], 'Ranks investments by risk-adjusted NPV and strategic fit.', 'Capital goes to the loudest project, not the best one.', ['NPV, IRR and payback for every project', 'Budget-constrained portfolio selection', 'Strategic fit weighting'], ['Excel', 'Jira']],
  [26, 'cost-reduction', 'Cost Reduction Agent', 'cost', 'GA', 16, 1000, ['CFO', 'COO'], 'Sized savings levers from actual spend, sequenced to a target.', 'Cost programmes rely on generic benchmarks and stall.', ['Levers sized from TTM spend by line', 'Effort and timing for each', 'Runway extension quantified'], ['NetSuite', 'Ramp', 'Brex'], { driver: 'opex', label: 'Opex savings', pct: 0.03 }],
  [27, 'unit-economics', 'Unit Economics Agent', 'saas', 'GA', 12, 800, ['CFO', 'CRO', 'Board'], 'LTV, CAC and payback by segment and channel.', 'Blended unit economics hide unprofitable segments.', ['Segment and channel cuts', 'Capped LTV to avoid overstatement', 'Channel payback ranking'], ['Salesforce', 'HubSpot', 'Stripe']],
  [28, 'saas-metrics', 'SaaS Metrics Analyst', 'saas', 'GA', 18, 900, ['CFO', 'Board', 'Investors'], 'ARR bridge, NRR, burn multiple, quick ratio, Rule of 40.', 'SaaS metrics are recalculated by hand for every investor request.', ['Customer-level calculation', 'Quarterly ARR bridge', 'Efficiency metrics benchmarked'], ['Stripe', 'Chargebee', 'NetSuite']],
  [29, 'cohort-revenue', 'Cohort Revenue Analyst', 'saas', 'GA', 10, 700, ['CFO', 'FP&A', 'Investors'], 'Net MRR retention heat map by quarterly cohort.', 'Retention is reported as one number that hides cohort trends.', ['Cohort heat map', 'Average retention curve', 'Logo vs revenue retention'], ['Stripe', 'Chargebee']],
  [30, 'churn-impact', 'Churn Impact Analyst', 'saas', 'GA', 10, 800, ['CFO', 'CCO', 'CRO'], 'Quantifies churn and flags at-risk accounts before they leave.', 'Churn is analysed after the fact, one account at a time.', ['Churned ARR by segment', 'Value of churn reduction over 24 months', 'At-risk account scoring'], ['Salesforce', 'Gainsight', 'Stripe'], { driver: 'churn', label: 'Retained ARR', pct: 0.01 }],
  [31, 'ma-screening', 'M&A Screening Agent', 'strategy', 'Preview', 20, 1500, ['CFO', 'CEO', 'Corp Dev'], 'Scores targets on growth, fit and valuation discipline.', 'Target lists are long, stale and unscored.', ['Weighted scoring model', 'Budget filter', 'Growth vs multiple map'], ['PitchBook', 'Crunchbase']],
  [32, 'due-diligence', 'Due Diligence Assistant', 'strategy', 'Preview', 40, 1500, ['CFO', 'Corp Dev', 'Legal'], 'Request lists, tracking and early red flags across workstreams.', 'Diligence trackers are spreadsheets emailed between advisors.', ['Standard request list by workstream', 'Status tracking', 'Red-flag summary'], ['Datasite', 'Google Drive']],
  [33, 'valuation', 'Valuation Agent', 'strategy', 'Beta', 16, 1300, ['CFO', 'CEO', 'Board'], 'DCF, comps and last-round marks on one football field.', 'Valuation is outsourced and refreshed once a year.', ['DCF with margin convergence', 'Comps and growth-adjusted comps', 'Football-field summary'], ['Excel', 'Carta', 'PitchBook']],
  [34, 'fundraising-materials', 'Fundraising Materials Agent', 'strategy', 'Beta', 30, 1300, ['CEO', 'CFO'], 'Deck outline, use of funds and dilution from live metrics.', 'Fundraise prep pulls the CFO away from running the business for a month.', ['Deck outline auto-populated', 'Dilution and runway math', 'Use-of-funds plan'], ['DocSend', 'Google Slides', 'Carta']],
  [35, 'business-case', 'Business Case Builder', 'strategy', 'GA', 14, 800, ['FP&A', 'Department heads'], 'NPV, IRR, payback and break-even haircut for any initiative.', 'Business cases are inconsistent and impossible to compare.', ['Standard cash-flow template', 'Benefit ramp assumptions', 'Break-even haircut test'], ['Excel', 'Jira', 'Notion']],
  [36, 'sensitivity-analysis', 'Sensitivity Analysis Agent', 'planning', 'GA', 8, 600, ['FP&A', 'CFO'], 'Tornado charts showing which drivers really matter.', 'Planning debates focus on assumptions that barely move the outcome.', ['Seven drivers tested', 'Three output metrics', 'Ranked tornado chart'], ['Excel', 'NetSuite']],
  [37, 'risk-assessment', 'Risk Assessment Agent', 'risk', 'GA', 10, 700, ['CFO', 'Audit Committee'], 'Risk register with likelihoods updated from live data.', 'Risk registers are updated once a year and never reflect reality.', ['Data-driven likelihood scoring', 'Heat map against appetite', 'Owner and mitigation tracking'], ['NetSuite', 'Jira']],
  [38, 'internal-controls', 'Internal Controls Agent', 'risk', 'GA', 30, 1100, ['Controller', 'Audit Committee'], 'Full-population control testing, not samples.', 'Sample testing misses the exceptions that matter.', ['100% of transactions tested', 'Control register with results', 'Exceptions listed by document'], ['NetSuite', 'AuditBoard']],
  [39, 'audit-prep', 'Audit Prep Agent', 'risk', 'GA', 40, 900, ['Controller', 'CFO'], 'PBC tracker, materiality and scoping ready for fieldwork.', 'Audit prep consumes six weeks of the accounting team.', ['PBC list with owners', 'Materiality calculation', 'Balance scoping'], ['NetSuite', 'Google Drive']],
  [40, 'tax-planning', 'Tax Planning Agent', 'risk', 'Beta', 12, 900, ['CFO', 'Tax Manager'], 'R&D credits, nexus exposure and filing calendar.', 'R&D credits go unclaimed and nexus exposure grows silently.', ['R&D credit estimate', 'Nexus exposure by state', 'Filing calendar'], ['Avalara', 'NetSuite', 'Workday'], { driver: 'rnd', label: 'R&D credit captured', pct: 0.004 }],
  [41, 'compliance-review', 'Compliance Review Agent', 'risk', 'GA', 10, 700, ['CFO', 'General Counsel'], 'Covenants, revenue recognition, tax and SOX-readiness in one checklist.', 'Compliance obligations are tracked in inboxes.', ['Covenant tests from the ledger', 'Status by obligation', 'Remediation tracking'], ['NetSuite', 'Lender portals']],
  [42, 'procurement-savings', 'Procurement Savings Agent', 'cost', 'GA', 14, 1000, ['CFO', 'Procurement'], 'Renewal pipeline with target savings and negotiation plays.', 'Contracts auto-renew at list price because nobody saw the date.', ['Renewals flagged months ahead', 'Category-benchmark savings targets', 'Auto-renew alerts'], ['Coupa', 'Zip', 'NetSuite'], { driver: 'spend', label: 'Negotiated savings', pct: 0.05 }],
  [43, 'vendor-spend', 'Vendor Spend Analyst', 'cost', 'GA', 10, 700, ['Controller', 'Procurement'], 'Spend cube by vendor, category and owner with off-PO tracking.', 'No single view of who is spending what with whom.', ['Pareto of vendor spend', 'Off-PO spend', 'Growth by vendor'], ['NetSuite', 'Ramp', 'Coupa']],
  [44, 'inventory-finance', 'Inventory Finance Agent', 'cost', 'Beta', 12, 900, ['CFO', 'COO'], 'Safety stock, reorder points and excess inventory in dollars.', 'Inventory decisions are made by operations without cash visibility.', ['Service-level based safety stock', 'EOQ and reorder points', 'Excess inventory cash release'], ['NetSuite', 'Cin7', 'Shopify']],
  [45, 'pricing-margin', 'Pricing Margin Agent', 'cost', 'GA', 8, 700, ['CFO', 'Deal Desk'], 'Discount leakage and price realisation by SKU.', 'Discounting erodes margin one deal at a time.', ['List vs realised revenue', 'Leakage above guardrail', 'Margin trend'], ['Salesforce CPQ', 'NetSuite'], { driver: 'revenue', label: 'Recovered discount leakage', pct: 0.005 }],
  [46, 'forecast-accuracy', 'Forecast Accuracy Agent', 'planning', 'GA', 6, 500, ['FP&A', 'CFO'], 'Scores every forecast against actuals — MAPE, bias, by horizon.', 'Nobody measures how good the forecast was.', ['MAPE and bias by horizon', 'Forecast scorecard', 'Bias correction recommendation'], ['NetSuite', 'Adaptive']],
  [47, 'strategic-finance-partner', 'Strategic Finance Partner', 'strategy', 'Beta', 20, 1400, ['CEO', 'CFO'], 'Answers strategic questions with a side-by-side financial case.', 'Strategic questions wait weeks for an FP&A analysis.', ['Option vs base comparison', 'Covenant-aware recommendation', 'Ready-made strategic questions'], ['NetSuite', 'Slack']],
  [48, 'investor-relations', 'Investor Relations Agent', 'reporting', 'Beta', 10, 900, ['CFO', 'CEO'], 'Cap table, valuation mark and investor Q&A prep.', 'Investor questions get inconsistent answers.', ['Ownership and valuation view', 'Q&A prepared from live metrics', 'Touchpoint tracking'], ['Carta', 'Pulley', 'Gmail']],
  [49, 'finance-ops-optimizer', 'Finance Ops Optimizer', 'ops', 'GA', 12, 800, ['CFO', 'Controller'], 'Maps finance process hours and the automation roadmap.', 'Finance teams know they are busy but not where the hours go.', ['Hours by process', 'Automation potential', 'Sequenced roadmap'], ['NetSuite', 'Jira']],
  [50, 'cfo-decision-support', 'CFO Decision Support Agent', 'strategy', 'Beta', 16, 1500, ['CFO'], 'Monte Carlo probabilities for the decisions on the CFO’s desk.', 'Big decisions are made on single-point forecasts.', ['1,000+ simulated futures', 'Covenant-breach and profitability probabilities', 'Decision verdicts with evidence'], ['NetSuite', 'Excel']],
];

export const AGENTS = A.map(([num, id, name, category, maturity, hours, price, personas, tagline, pain, value, integrations, roi]) => ({
  num, id, name, category, categoryName: CATEGORIES[category].name, maturity, hoursSaved: hours, listPrice: price,
  personas, tagline, pain, value, integrations, roi: roi ?? null,
  talkTrack: `${pain} The ${name} changes that. ${tagline} ${value[0]}; ${value[1].charAt(0).toLowerCase()}${value[1].slice(1)}. Teams like yours save about ${hours} hours a month.`,
}));

export const AGENT_BY_ID = new Map(AGENTS.map((a) => [a.id, a]));

/**
 * ROI for a set of agents given prospect inputs.
 * inputs: { revenue, financeFte, hourlyCost, apSpend, opex, arBalance, idleCash }
 */
export function computeRoi(agentIds, inputs) {
  const i = {
    revenue: 50e6, financeFte: 8, hourlyCost: 95, apSpend: 12e6, opex: 30e6, arBalance: 7e6, idleCash: 15e6, ...inputs,
  };
  const scale = Math.min(2.5, Math.max(0.4, i.financeFte / 8)); // hours scale with team size
  const lines = agentIds.map((id) => AGENT_BY_ID.get(id)).filter(Boolean).map((a) => {
    const hours = a.hoursSaved * scale;
    const labor = hours * 12 * i.hourlyCost;
    let lever = 0;
    let leverLabel = '';
    if (a.roi) {
      leverLabel = a.roi.label;
      switch (a.roi.driver) {
        case 'dso': lever = i.revenue / 365 * a.roi.days * 0.08; leverLabel += ` (${a.roi.days} days × 8% cost of capital)`; break;
        case 'ap': lever = i.apSpend * a.roi.pct; break;
        case 'yield': lever = i.idleCash * a.roi.pct; break;
        case 'opex': lever = i.opex * a.roi.pct; break;
        case 'spend': lever = i.apSpend * a.roi.pct; break;
        case 'churn': case 'revenue': case 'rnd': lever = i.revenue * a.roi.pct; break;
        default: lever = 0;
      }
    }
    const cost = a.listPrice * 12;
    return { id: a.id, name: a.name, hours, labor, lever, leverLabel, value: labor + lever, cost };
  });
  const totalValue = lines.reduce((s, l) => s + l.value, 0);
  const subtotal = lines.reduce((s, l) => s + l.cost, 0);
  const discount = lines.length >= 20 ? 0.3 : lines.length >= 10 ? 0.2 : lines.length >= 5 ? 0.1 : 0;
  const totalCost = subtotal * (1 - discount);
  const hours = lines.reduce((s, l) => s + l.hours, 0);
  return {
    inputs: i, lines, totalValue, subtotal, discount, totalCost, hoursPerMonth: hours, fteFreed: hours / 160,
    netValue: totalValue - totalCost, roiMultiple: totalCost ? totalValue / totalCost : 0,
    paybackMonths: totalValue ? totalCost / (totalValue / 12) : null,
  };
}
