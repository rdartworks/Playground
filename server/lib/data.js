// Loads the demo tenant into memory once and exposes it as a plain dataset object.
// Agents compute on these arrays; the DB is the source of truth.
let cached = null;

export function loadDataset(db) {
  if (cached && cached.db === db) return cached;
  const all = (sql, ...p) => db.prepare(sql).all(...p).map((r) => ({ ...r }));
  const company = Object.fromEntries(all('SELECT key, value FROM company').map((r) => [r.key, r.value]));
  const fin = all('SELECT * FROM financials ORDER BY month');
  const customers = all('SELECT * FROM customers');
  const mrrRows = all('SELECT * FROM customer_mrr');
  const mrrByCustomer = new Map();
  for (const r of mrrRows) {
    if (!mrrByCustomer.has(r.customer_id)) mrrByCustomer.set(r.customer_id, new Map());
    mrrByCustomer.get(r.customer_id).set(r.month, r.mrr);
  }
  cached = {
    db,
    company,
    asOf: company.as_of,
    fin,
    months: fin.map((f) => f.month),
    last: fin[fin.length - 1],
    opex: all('SELECT * FROM opex_actuals'),
    budget: all('SELECT * FROM opex_budget'),
    revBudget: all('SELECT * FROM revenue_budget ORDER BY month'),
    forecastHistory: all('SELECT * FROM forecast_history'),
    customers,
    mrrByCustomer,
    employees: all('SELECT * FROM employees'),
    products: all('SELECT * FROM products'),
    productSales: all('SELECT * FROM product_sales'),
    vendors: all('SELECT * FROM vendors'),
    bills: all('SELECT * FROM bills'),
    invoices: all('SELECT * FROM invoices'),
    debt: all('SELECT * FROM debt'),
    controls: all('SELECT * FROM controls'),
    closeTasks: all('SELECT * FROM close_tasks ORDER BY id'),
    tax: all('SELECT * FROM tax_jurisdictions'),
    targets: all('SELECT * FROM acquisition_targets'),
    capTable: all('SELECT * FROM cap_table'),
    risks: all('SELECT * FROM risks'),
    capex: all('SELECT * FROM capex_projects'),
  };
  return cached;
}

export function resetDatasetCache() { cached = null; }
