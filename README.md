# Finance Agent Catalogue

A working sales-enablement prototype for a catalogue of **50 AI finance agents**. Every agent runs real analysis, live, on a fully populated demo company, so reps can find the right agent for a buyer, demo it, and turn it into an ROI-backed proposal.

```bash
npm install
npm start            # http://localhost:3000  (seeds data/northwind.db on first run)
npm test             # 62 tests: every agent at default/min/max params, data reconciliation, API
npm run seed         # regenerate the demo tenant
```

Requires Node 22.5+. There are no native modules: the server uses the built-in `node:http` and `node:sqlite`.

## What's in it

| Page | What a rep does there |
|---|---|
| **Catalogue** | Search and filter the 50 agents by category, buyer persona, maturity, favourites and demo popularity, and add agents to a proposal tray. |
| **Agent → Live demo** | Change the parameters and run the agent against the demo tenant. You get a headline, KPIs, interactive charts, sortable tables with CSV export, insights, actions and an "Ask the agent" box. |
| **Agent → Sales kit** | Pain, a 30-second talk track (copyable), value props, discovery questions, objection handling, integrations, a demo script and related agents. |
| **Agent → ROI snapshot** | Value of this one agent for the prospect's team size. |
| **ROI builder** | Prospect inputs plus agent picker. Gives annual value, cost after bundle discount, ROI multiple and payback. Saves a proposal. |
| **Proposals** | Saved proposals with a printable / PDF-able document view. |
| **Enablement** | Demos by week, agent, category and rep, plus the agents nobody has demoed yet (coverage gaps). |
| **Demo data** | The tenant's 24-month financials, so you can show prospects that the data is real. |

## The demo tenant

**Northwind Cloud, Inc.** is a fictional Series B B2B SaaS company with a hardware line, generated deterministically by `server/seed.js`. It has about $25M ARR growing 37%, 620+ customers, 45 months of customer-level MRR, 24 months of P&L / balance sheet / cash, department budgets vs actuals, AR invoices, AP bills from 30 vendors, employees, debt facilities with covenants, internal controls, a close checklist, tax jurisdictions, M&A targets, a cap table and capex projects.

The data reconciles across tables. Customer MRR ties to subscription revenue, opex detail ties to the P&L, and cash rolls forward month to month. Some anomalies are planted on purpose (a duplicate vendor bill, a round-dollar bill with no PO, unregistered tax nexus) so the AP, Controls and Tax agents have something to find.

## Architecture

```
server/
  index.js          HTTP server: JSON API + static frontend
  seed.js           demo tenant generator (SQLite)
  catalog.js        sales metadata for all 50 agents + ROI model
  llm.js            optional Claude copilot for "Ask the agent"
  lib/model.js      driver-based forward model (shared by planning/cash/strategy agents)
  lib/fin.js        finance math (NPV, IRR, regression, percentiles…)
  agents/*.js       the 50 agent engines, grouped by category
public/             vanilla-JS SPA + dependency-free SVG charts
test/               node:test suites
```

Every agent engine returns the same shape (`headline, kpis, charts, tables, insights, actions, narrative`), so the UI renders all 50 the same way. To add an agent:

1. Add a row to `server/catalog.js`.
2. Add an engine with `params` and `run(ds, params)` to the matching file in `server/agents/`.

The tests check that every agent in the catalogue has an engine.

### API

`GET /api/meta` · `GET /api/agents?q=&category=&persona=&maturity=` · `GET /api/agents/:id` · `POST /api/agents/:id/run` · `POST /api/agents/:id/ask` · `POST /api/favorites/:id` · `POST /api/roi` · `GET|POST /api/proposals` · `GET|DELETE /api/proposals/:id` · `GET /api/analytics` · `GET /api/company`

## Branding

The UI uses a KPMG-inspired corporate theme. All colours are defined once, in the `:root` blocks at the top of `public/styles.css`. Chart colours were checked for colour-blind separation and contrast in light and dark mode.

The logo is a **placeholder** at `public/brand/logo.svg`. Replace it with the official file from your brand portal; see `public/brand/README.md`. It shows in the header and on every proposal cover. Only use a company's logo if you're authorised to under its brand guidelines.

## Claude copilot (optional)

Set `ANTHROPIC_API_KEY` to have Claude (`claude-opus-5-5` by default; override with `CLAUDE_MODEL`) answer "Ask the agent" questions. Answers are grounded in the agent's computed result. Without a key, the app gives a deterministic answer built from the same result, so demos work offline.

## Moving from prototype to product

- Replace `server/seed.js` with connectors (ERP, billing, CRM, bank feeds). The agents only read the dataset object built in `server/lib/data.js`.
- Add authentication and per-tenant databases before any real customer data touches it.
- Pricing, hours saved and ROI levers in `server/catalog.js` are placeholder assumptions. Calibrate them with pilot data.
