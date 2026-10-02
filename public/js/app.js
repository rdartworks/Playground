import { renderChart } from './charts.js';
import { esc, fmt, money, statusBadge } from './format.js';

const LOGO_SRC = '/brand/logo.svg'; // swap for the official logo; see public/brand/README.md
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const state = {
  meta: null,
  agents: [],
  selected: new Set(store.get('proposal', [])),
  rep: store.get('rep', 'Dana (AE, West)'),
  filters: { q: '', category: '', persona: '', maturity: '', sort: 'num', favorites: false },
};
const REPS = ['Dana (AE, West)', 'Marcus (AE, East)', 'Priya (SE)', 'Tom (AE, EMEA)', 'Lena (SE, EMEA)'];

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}
const catColor = (id) => `var(--series-${state.meta?.categories.find((c) => c.id === id)?.color ?? 1})`;
const saveSelection = () => { store.set('proposal', [...state.selected]); renderTray(); };

// ---------- tray ----------
function renderTray() {
  let tray = $('#tray');
  const route = location.hash.split('/')[1] || '';
  if (!state.selected.size || route === 'roi' || route === 'proposal') { tray?.remove(); return; }
  if (!tray) { tray = document.createElement('div'); tray.id = 'tray'; tray.className = 'tray no-print'; document.body.append(tray); }
  const hours = state.agents.filter((a) => state.selected.has(a.id)).reduce((s, a) => s + a.hoursSaved, 0);
  tray.innerHTML = `<span><b>${state.selected.size}</b> agent${state.selected.size > 1 ? 's' : ''} selected · ~${hours} hrs/mo saved</span>
    <button class="btn ghost sm" data-act="clear">Clear</button><a class="btn sm" href="#/roi">Build ROI & proposal →</a>`;
  tray.querySelector('[data-act=clear]').onclick = () => { state.selected.clear(); saveSelection(); route === '' && renderCatalogue(); };
}

// ---------- results renderer (shared by agent page) ----------
function renderTable(t) {
  const id = `t${Math.random().toString(36).slice(2, 8)}`;
  const isNum = (f) => !['text', 'status', undefined].includes(f);
  const cell = (c, r) => {
    const v = r[c.key];
    if (c.format === 'status') return statusBadge(v);
    if (c.format === 'auto' || (v && typeof v === 'object' && 'v' in v)) return esc(fmt(v));
    if (isNum(c.format)) return `<span class="${typeof v === 'number' && v < 0 ? 'neg' : ''}">${esc(fmt(v, c.format))}</span>`;
    return esc(v ?? '');
  };
  const html = `<div class="card tbl-card"><h4><span>${esc(t.title)}</span><button class="btn sm ghost" data-csv="${id}" title="Download CSV">⤓ CSV</button></h4>
    <div class="tbl-scroll"><table class="data" id="${id}"><thead><tr>${t.columns.map((c, i) => `<th data-i="${i}" class="${isNum(c.format) ? 'r' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr>${t.columns.map((c) => `<td class="${isNum(c.format) ? 'r num' : ''}">${cell(c, r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  return { html, bind(root) {
    const tbl = root.querySelector(`#${id}`);
    let dir = 1, last = -1;
    tbl.querySelectorAll('th').forEach((th) => th.onclick = () => {
      const i = Number(th.dataset.i), c = t.columns[i];
      dir = last === i ? -dir : 1; last = i;
      const key = (r) => { const v = r[c.key]; return v && typeof v === 'object' ? v.v : v; };
      const rows = [...t.rows].sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))) * dir; });
      tbl.querySelector('tbody').innerHTML = rows.map((r) => `<tr>${t.columns.map((cc) => `<td class="${isNum(cc.format) ? 'r num' : ''}">${cell(cc, r)}</td>`).join('')}</tr>`).join('');
    });
    root.querySelector(`[data-csv=${id}]`).onclick = () => {
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [t.columns.map((c) => q(c.label)).join(','), ...t.rows.map((r) => t.columns.map((c) => { const v = r[c.key]; return q(v && typeof v === 'object' ? v.v : v); }).join(','))].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `${t.title.replace(/[^\w]+/g, '-').toLowerCase()}.csv`; a.click();
    };
  } };
}

function renderKpis(kpis) {
  return `<div class="kpis">${kpis.map((k) => {
    const tone = k.tone ? `tone-${k.tone}-border` : '';
    let delta = '';
    if (typeof k.delta === 'number' && Number.isFinite(k.delta)) {
      const good = k.invert ? k.delta <= 0 : k.delta >= 0;
      delta = `<div class="d ${good ? 'tone-good' : 'tone-bad'}">${k.delta >= 0 ? '▲' : '▼'} ${esc(k.deltaFormat === 'pts' ? fmt(k.delta, 'pts') : fmt(Math.abs(k.delta), 'pct'))}</div>`;
    }
    const bench = k.bench ? `<div class="bench">Benchmark ${esc(k.bench)} · ${k.tone === 'good' ? '✓ on track' : '! watch'}</div>` : '';
    return `<div class="card kpi ${tone}"><div class="l">${esc(k.label)}</div><div class="v num ${k.format === 'text' ? 'text' : ''}">${esc(fmt(k.value, k.format))}</div>${delta}${bench}</div>`;
  }).join('')}</div>`;
}

function renderResult(el, res, agent) {
  const o = res.output;
  const tables = o.tables.map(renderTable);
  el.innerHTML = `
    <div class="headline">${esc(o.headline)}</div>
    <div class="run-meta"><span>▶ Ran on <b>${esc(res.tenant)}</b> · data as of ${esc(res.asOf)}</span><span>⚡ ${res.ms} ms</span><span>${Object.entries(res.params).map(([k, v]) => `${esc(k)}=${esc(v ?? 'auto')}`).join(' · ')}</span></div>
    ${renderKpis(o.kpis)}
    ${o.charts.length ? `<div class="charts">${o.charts.map((c, i) => `<div class="card chart-card"><h4>${esc(c.title)}</h4><div data-chart="${i}"></div></div>`).join('')}</div>` : ''}
    ${o.narrative ? `<div class="card pad section"><div class="section-title">Draft</div><pre class="narrative">${esc(o.narrative)}</pre><button class="btn sm section" data-copy-narr>Copy draft</button></div>` : ''}
    <div class="lists"><div class="card pad"><div class="section-title">💡 Insights</div><ul>${o.insights.filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div class="card pad"><div class="section-title">✅ Recommended actions</div><ul>${o.actions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
    ${tables.map((t) => t.html).join('')}
    <div class="card pad ask"><div class="section-title">💬 Ask the ${esc(agent.name)} <span class="faint small">${state.meta.llm ? 'Claude-powered, grounded in this result' : 'offline mode — set ANTHROPIC_API_KEY for Claude answers'}</span></div>
      <form><input class="input" name="q" placeholder="e.g. What should the CFO do first?" autocomplete="off"><button class="btn primary">Ask</button></form>
      <div class="suggest">${['What is the single most important takeaway?', 'What would you tell the board?', 'What are the risks in this analysis?'].map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join('')}</div>
      <div class="answer-slot"></div></div>`;
  o.charts.forEach((c, i) => renderChart(el.querySelector(`[data-chart="${i}"]`), c));
  tables.forEach((t) => t.bind(el));
  el.querySelector('[data-copy-narr]')?.addEventListener('click', () => { navigator.clipboard?.writeText(o.narrative); toast('Draft copied'); });
  const form = el.querySelector('.ask form');
  const ask = async (question) => {
    const slot = el.querySelector('.answer-slot');
    slot.innerHTML = '<div class="answer"><span class="spinner"></span> Thinking…</div>';
    try {
      const r = await api(`/agents/${agent.id}/ask`, { method: 'POST', body: { question, params: res.params } });
      slot.innerHTML = `<div class="answer">${esc(r.answer)}<div class="src">${r.source === 'claude' ? `Answered by Claude (${esc(r.model || '')})` : 'Offline answer'}${r.warning ? ` · ${esc(r.warning)}` : ''}</div></div>`;
    } catch (e) { slot.innerHTML = `<div class="answer tone-bad">${esc(e.message)}</div>`; }
  };
  form.onsubmit = (e) => { e.preventDefault(); const q = form.q.value.trim(); if (q) ask(q); };
  el.querySelectorAll('.suggest .chip').forEach((b) => b.onclick = () => { form.q.value = b.textContent; ask(b.textContent); });
}

// ---------- views ----------
async function renderCatalogue() {
  const m = state.meta;
  const s = m.snapshot;
  const f = state.filters;
  const totalHours = state.agents.reduce((a, x) => a + x.hoursSaved, 0);
  if (!$('#catalogue-root')) {
    view.innerHTML = `<div id="catalogue-root">
      <div class="hero">
        <div class="hero-main"><div class="eyebrow">Sales enablement · Finance AI</div>
          <h1>${m.agentCount} finance agents, demo-ready on live data</h1>
          <p>Every agent runs real analysis on a fully populated demo company: P&L, customers, invoices, bills, payroll, debt and more. Find the right agent for your buyer, run it live, and turn it into an ROI-backed proposal.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="#/agent/cfo-decision-support">▶ Run a flagship demo</a><a class="btn outline" href="#/roi">Build an ROI case</a></div>
          <div class="stat-row"><div><b>${m.agentCount}</b><span>agents</span></div><div><b>${m.categories.length}</b><span>categories</span></div><div><b>${totalHours.toLocaleString()}</b><span>hrs/mo automatable</span></div></div>
        </div>
        <div class="card hero-tenant"><div class="eyebrow">Demo tenant</div><h3 style="margin-top:4px">${esc(m.company.name)}</h3><div class="muted small">${esc(m.company.industry)} · ${esc(m.company.stage)} · data through ${esc(m.company.as_of)}</div>
          <div class="tenant-grid">
            <div><span class="faint small">ARR</span><b class="num">${money(s.arr)}</b></div><div><span class="faint small">YoY growth</span><b class="num">${fmt(s.growth, 'pct')}</b></div>
            <div><span class="faint small">Net revenue retention</span><b class="num">${fmt(s.nrr, 'pct')}</b></div><div><span class="faint small">Cash</span><b class="num">${money(s.cash)}</b></div>
            <div><span class="faint small">Customers</span><b class="num">${s.customers}</b></div><div><span class="faint small">Burn multiple</span><b class="num">${fmt(s.burnMultiple, 'multiple')}</b></div>
          </div><a class="small" href="#/tenant" style="display:inline-block;margin-top:12px">Explore the demo data →</a></div>
      </div>
      <div class="filters">
        <div class="search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="input" id="q" placeholder="Search agents, pains, integrations… (e.g. covenant, NetSuite, churn)" value="${esc(f.q)}"></div>
        <select class="input" id="persona"><option value="">All buyers</option>${m.personas.map((p) => `<option ${f.persona === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <select class="input" id="maturity"><option value="">Any maturity</option>${['GA', 'Beta', 'Preview'].map((p) => `<option ${f.maturity === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
        <select class="input" id="sort">${[['num', 'Sort: Catalogue #'], ['demos', 'Sort: Most demoed'], ['hours', 'Sort: Hours saved'], ['name', 'Sort: Name']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn ${f.favorites ? 'primary' : ''}" id="favs">★ Favorites</button>
      </div>
      <div class="chips" id="cats"></div>
      <div class="agent-grid" id="grid"></div></div>`;
    const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    $('#q').oninput = debounce((e) => { f.q = e.target.value; drawGrid(); });
    $('#persona').onchange = (e) => { f.persona = e.target.value; drawGrid(); };
    $('#maturity').onchange = (e) => { f.maturity = e.target.value; drawGrid(); };
    $('#sort').onchange = (e) => { f.sort = e.target.value; drawGrid(); };
    $('#favs').onclick = (e) => { f.favorites = !f.favorites; e.currentTarget.classList.toggle('primary', f.favorites); drawGrid(); };
  }
  drawGrid();

  function drawGrid() {
    const q = f.q.toLowerCase();
    const base = state.agents.filter((a) => (!f.persona || a.personas.includes(f.persona)) && (!f.maturity || a.maturity === f.maturity) && (!f.favorites || a.favorite)
      && (!q || [a.name, a.tagline, a.categoryName, ...a.integrations, ...a.personas].join(' ').toLowerCase().includes(q)));
    const list = base.filter((a) => !f.category || a.category === f.category);
    const sorters = { num: (a, b) => a.num - b.num, demos: (a, b) => b.demos - a.demos, hours: (a, b) => b.hoursSaved - a.hoursSaved, name: (a, b) => a.name.localeCompare(b.name) };
    list.sort(sorters[f.sort]);
    $('#cats').innerHTML = `<button class="chip ${!f.category ? 'active' : ''}" data-c="">All <span class="count">${base.length}</span></button>` +
      m.categories.map((c) => `<button class="chip ${f.category === c.id ? 'active' : ''}" data-c="${c.id}"><span class="dot" style="background:var(--series-${c.color})"></span>${esc(c.name)} <span class="count">${base.filter((a) => a.category === c.id).length}</span></button>`).join('');
    $('#cats').querySelectorAll('.chip').forEach((b) => b.onclick = () => { f.category = b.dataset.c; drawGrid(); });
    $('#grid').innerHTML = list.length ? list.map((a) => `
      <article class="card agent-card" data-id="${a.id}" tabindex="0">
        <div class="top"><span class="n">${a.num}</span><h3>${esc(a.name)}</h3><button class="star ${a.favorite ? 'on' : ''}" data-star title="Favorite" aria-label="Toggle favorite">${a.favorite ? '★' : '☆'}</button></div>
        <div class="tag">${esc(a.tagline)}</div>
        <div class="meta"><span class="cat-label"><span class="dot" style="background:${catColor(a.category)}"></span>${esc(a.categoryName)}</span><span class="badge ${a.maturity}">${a.maturity}</span></div>
        <div class="meta"><span title="Hours saved per month">⏱ ${a.hoursSaved} hrs/mo</span><span title="List price">${money(a.listPrice, false)}/mo</span><span title="Demos run by the sales team">▶ ${a.demos} demos</span>${a.hasRoiLever ? '<span title="Has a hard-dollar ROI lever">＄ hard ROI</span>' : ''}</div>
        <div class="foot"><label class="pick" data-pick><input type="checkbox" ${state.selected.has(a.id) ? 'checked' : ''}> Add to proposal</label><a href="#/agent/${a.id}" class="small">Run demo →</a></div>
      </article>`).join('') : '<div class="card empty">No agents match these filters.</div>';
    $('#grid').querySelectorAll('.agent-card').forEach((card) => {
      const id = card.dataset.id;
      card.onclick = (e) => {
        if (e.target.closest('[data-pick]')) { const cb = card.querySelector('input'); if (e.target !== cb) return; cb.checked ? state.selected.add(id) : state.selected.delete(id); saveSelection(); return; }
        if (e.target.closest('[data-star]')) { toggleFavorite(id).then(() => drawGrid()); return; }
        if (e.target.closest('a')) return;
        location.hash = `#/agent/${id}`;
      };
      card.onkeydown = (e) => { if (e.key === 'Enter' && e.target === card) location.hash = `#/agent/${id}`; };
    });
  }
}

async function toggleFavorite(id) {
  const r = await api(`/favorites/${id}`, { method: 'POST' });
  const a = state.agents.find((x) => x.id === id);
  if (a) a.favorite = r.favorite;
  return r.favorite;
}

async function renderAgent(id, tab = 'demo') {
  view.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  const a = await api(`/agents/${id}`);
  document.title = `${a.name} · Finance Agent Catalogue`;
  view.innerHTML = `
    <div class="small" style="margin-bottom:10px"><a href="#/">← All agents</a> / <a href="#/" data-cat="${a.category}">${esc(a.categoryName)}</a></div>
    <div class="detail-head"><div>
      <div class="eyebrow">Agent #${a.num} · <span style="color:${catColor(a.category)}">●</span> ${esc(a.categoryName)}</div>
      <h1>${esc(a.name)}</h1><div class="sub">${esc(a.tagline)}</div>
      <div class="meta"><span class="badge ${a.maturity}">${a.maturity}</span>${a.personas.map((p) => `<span class="pill">👤 ${esc(p)}</span>`).join('')}<span class="pill">⏱ ${a.hoursSaved} hrs/mo saved</span><span class="pill">${money(a.listPrice, false)}/mo list</span><span class="pill">▶ ${a.demos} demos</span></div>
    </div><div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="fav">${a.favorite ? '★ Favorited' : '☆ Favorite'}</button>
      <button class="btn ${state.selected.has(a.id) ? '' : 'primary'}" id="add">${state.selected.has(a.id) ? '✓ In proposal' : '+ Add to proposal'}</button>
    </div></div>
    <div class="tabs" role="tablist">${[['demo', '▶ Live demo'], ['kit', '🎯 Sales kit'], ['roi', '＄ ROI snapshot']].map(([t, l]) => `<button role="tab" data-tab="${t}" class="${tab === t ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div id="tab"></div>`;
  view.querySelector('[data-cat]').onclick = () => { state.filters.category = a.category; };
  $('#fav').onclick = async () => { const on = await toggleFavorite(a.id); $('#fav').textContent = on ? '★ Favorited' : '☆ Favorite'; };
  $('#add').onclick = () => {
    if (state.selected.has(a.id)) state.selected.delete(a.id); else state.selected.add(a.id);
    saveSelection();
    $('#add').textContent = state.selected.has(a.id) ? '✓ In proposal' : '+ Add to proposal';
    $('#add').classList.toggle('primary', !state.selected.has(a.id));
  };
  view.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => {
    view.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
    history.replaceState(null, '', `#/agent/${a.id}${b.dataset.tab === 'demo' ? '' : `/${b.dataset.tab}`}`);
    drawTab(b.dataset.tab);
  });
  drawTab(tab);

  function drawTab(t) {
    const el = $('#tab');
    if (t === 'kit') return drawKit(el, a);
    if (t === 'roi') return drawAgentRoi(el, a);
    drawDemo(el, a);
  }
}

function paramControl(p) {
  const unit = p.unit ? ` <span class="hint">(${esc(p.unit)})</span>` : '';
  if (p.type === 'select') return `<label class="field">${esc(p.label)}<select class="input" name="${p.key}">${p.options.map((o) => `<option ${String(o) === String(p.default) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  if (p.default === null || p.default === undefined) return `<label class="field"><span>${esc(p.label)}${unit}</span><input class="input" type="number" name="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" placeholder="${esc(p.hint || 'auto')}"></label>`;
  return `<label class="field"><span>${esc(p.label)}${unit}</span><div class="range-row"><input type="range" name="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.default}"><span class="range-val num" data-for="${p.key}">${p.default}${p.unit && p.unit.length <= 2 ? esc(p.unit) : ''}</span></div>${p.hint ? `<span class="hint">${esc(p.hint)}</span>` : ''}</label>`;
}

function drawDemo(el, a) {
  el.innerHTML = `<div class="demo-layout">
    <form class="card pad params" id="pform"><div class="section-title" style="margin:0">Parameters</div>
      ${a.params.length ? a.params.map(paramControl).join('') : '<div class="muted small">This agent runs with no inputs — it reads everything from the tenant.</div>'}
      <button class="btn primary" type="submit" id="run">▶ Run agent</button>
      <div class="tenant-note">Running against <b>${esc(state.meta.company.name)}</b>, a fictional company with 24 months of financials, ${state.meta.snapshot.customers} active customers, invoices, bills, payroll and debt.<br>Demo logged for <b>${esc(state.rep)}</b>.</div>
    </form>
    <div id="result"><div class="skeleton" style="height:60px"></div><div class="skeleton" style="height:90px;margin-top:14px"></div><div class="skeleton" style="height:280px;margin-top:14px"></div></div></div>`;
  const form = $('#pform');
  form.querySelectorAll('input[type=range]').forEach((r) => r.oninput = () => {
    const p = a.params.find((x) => x.key === r.name);
    form.querySelector(`[data-for="${r.name}"]`).textContent = `${r.value}${p.unit && p.unit.length <= 2 ? p.unit : ''}`;
  });
  let timer;
  form.querySelectorAll('input, select').forEach((i) => i.addEventListener('change', () => { clearTimeout(timer); timer = setTimeout(run, 150); }));
  form.onsubmit = (e) => { e.preventDefault(); run(); };
  async function run() {
    const params = Object.fromEntries(new FormData(form).entries());
    const btn = $('#run');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Running…';
    try {
      const res = await api(`/agents/${a.id}/run`, { method: 'POST', body: { params, rep: state.rep } });
      renderResult($('#result'), res, a);
      const local = state.agents.find((x) => x.id === a.id); if (local) local.demos++;
    } catch (e) { $('#result').innerHTML = `<div class="card pad tone-bad">${esc(e.message)}</div>`; }
    btn.disabled = false; btn.innerHTML = '▶ Run agent';
  }
  run();
}

function drawKit(el, a) {
  el.innerHTML = `<div class="grid cols-2">
    <div class="card pad kit-block"><h3>The pain</h3><p class="muted" style="margin-top:0">${esc(a.pain)}</p>
      <h3>30-second talk track</h3><div class="quote">${esc(a.talkTrack)}</div><button class="btn sm section" id="copytt">Copy talk track</button></div>
    <div class="card pad kit-block"><h3>Value propositions</h3><ul>${a.value.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
      <h3 class="section">Best-fit buyers</h3><div class="integrations">${a.personas.map((p) => `<span class="pill">👤 ${esc(p)}</span>`).join('')}</div>
      <h3 class="section">Connects to</h3><div class="integrations">${a.integrations.map((p) => `<span class="pill">🔌 ${esc(p)}</span>`).join('')}</div>
      ${a.roi ? `<h3 class="section">Hard-dollar lever</h3><p class="muted" style="margin:0">${esc(a.roi.label)} — quantified in the ROI calculator alongside time savings.</p>` : ''}</div>
    <div class="card pad kit-block"><h3>Discovery questions</h3><ol style="margin:0;padding-left:18px">${a.discovery.map((q) => `<li style="margin:6px 0">${esc(q)}</li>`).join('')}</ol>
      <h3 class="section">Demo script</h3><ol style="margin:0;padding-left:18px"><li>Open the Live demo tab — it runs instantly on the demo tenant.</li><li>Read the headline aloud; it is the “so what”.</li><li>Change one parameter that maps to the prospect's pain and re-run.</li><li>Ask the agent a question the prospect raised.</li><li>Close with the ROI snapshot for their team size.</li></ol></div>
    <div class="card pad kit-block"><h3>Objection handling</h3>${a.objections.map((o) => `<div class="obj"><b>“${esc(o.q)}”</b><span class="muted">${esc(o.a)}</span></div>`).join('')}</div>
  </div>
  <div class="card pad section kit-block"><h3>Pairs well with (${esc(a.categoryName)})</h3><div class="agent-grid" style="margin-top:10px">${a.related.map((r) => `<a class="card agent-card" href="#/agent/${r.id}" style="color:inherit;text-decoration:none"><h3>${esc(r.name)}</h3><div class="tag">${esc(r.tagline)}</div></a>`).join('')}</div></div>`;
  $('#copytt').onclick = () => { navigator.clipboard?.writeText(a.talkTrack); toast('Talk track copied'); };
}

function drawAgentRoi(el, a) {
  el.innerHTML = `<div class="roi-layout"><form class="card pad roi-inputs" id="rf">
      <div class="section-title" style="margin:0">Prospect profile</div>
      <label class="field">Annual revenue ($M)<input class="input" type="number" name="revenue" value="50" min="1"></label>
      <label class="field">Finance team (FTE)<input class="input" type="number" name="financeFte" value="8" min="1"></label>
      <label class="field">Loaded hourly cost ($)<input class="input" type="number" name="hourlyCost" value="95" min="20"></label>
      <label class="field">Annual vendor spend ($M)<input class="input" type="number" name="apSpend" value="12" min="0"></label>
    </form><div id="roiout"></div></div>`;
  const calc = async () => {
    const fd = Object.fromEntries(new FormData($('#rf')).entries());
    const inputs = { revenue: fd.revenue * 1e6, financeFte: Number(fd.financeFte), hourlyCost: Number(fd.hourlyCost), apSpend: fd.apSpend * 1e6, opex: fd.revenue * 1e6 * 0.6, idleCash: fd.revenue * 1e6 * 0.3 };
    const r = await api('/roi', { method: 'POST', body: { agentIds: [a.id], inputs } });
    const l = r.lines[0];
    $('#roiout').innerHTML = `<div class="kpis">
      <div class="card kpi"><div class="l">Hours saved / month</div><div class="v num">${fmt(l.hours, 'number')}</div></div>
      <div class="card kpi"><div class="l">Time-savings value / yr</div><div class="v num">${money(l.labor)}</div></div>
      <div class="card kpi"><div class="l">${esc(l.leverLabel || 'Hard-dollar lever')}</div><div class="v num">${l.lever ? money(l.lever) : '—'}</div></div>
      <div class="card kpi tone-good-border"><div class="l">Total annual value</div><div class="v num">${money(l.value)}</div></div>
      <div class="card kpi"><div class="l">Annual subscription</div><div class="v num">${money(l.cost)}</div></div>
      <div class="card kpi tone-good-border"><div class="l">ROI multiple</div><div class="v num">${fmt(l.value / l.cost, 'multiple')}</div></div></div>
      <div class="card pad section muted small">Hours scale with finance team size relative to an 8-FTE baseline. Hard-dollar levers use conservative assumptions shown in the label. <a href="#/roi">Bundle with other agents for volume discounts →</a></div>`;
  };
  $('#rf').oninput = () => calc();
  calc();
}

async function renderRoi() {
  const m = state.meta;
  if (!state.selected.size) ['variance-analysis', 'cash-flow-forecast', 'accounts-receivable', 'accounts-payable', 'monthly-close', 'board-pack-builder'].forEach((id) => state.selected.add(id));
  view.innerHTML = `<div class="page-head"><div><div class="eyebrow">ROI & proposal builder</div><h1>Build the business case</h1><p>Enter the prospect's profile, pick the agents, and save a shareable proposal with quantified value.</p></div></div>
    <div class="roi-layout"><div class="card pad roi-inputs"><form id="rf" class="roi-inputs">
      <label class="field">Prospect company<input class="input" name="prospect" placeholder="e.g. Contoso Logistics" required></label>
      <label class="field">Industry<input class="input" name="industry" placeholder="e.g. Logistics SaaS"></label>
      <div class="grid cols-2" style="gap:10px">
        <label class="field">Revenue ($M)<input class="input" type="number" name="revenue" value="50" min="1"></label>
        <label class="field">Finance FTE<input class="input" type="number" name="financeFte" value="8" min="1"></label>
        <label class="field">Hourly cost ($)<input class="input" type="number" name="hourlyCost" value="95" min="20"></label>
        <label class="field">Vendor spend ($M)<input class="input" type="number" name="apSpend" value="12" min="0"></label>
        <label class="field">Opex ($M)<input class="input" type="number" name="opex" value="30" min="0"></label>
        <label class="field">Idle cash ($M)<input class="input" type="number" name="idleCash" value="15" min="0"></label>
      </div></form>
      <div class="section-title" style="margin:6px 0 0;justify-content:space-between">Agents <span class="faint small" id="selcount"></span></div>
      <div class="agent-picker" id="picker">${m.categories.map((c) => `<div class="grp"><span>${esc(c.name)}</span><a href="#" data-all="${c.id}" class="small">all</a></div>${state.agents.filter((a) => a.category === c.id).map((a) => `<label><input type="checkbox" value="${a.id}" ${state.selected.has(a.id) ? 'checked' : ''}> ${esc(a.name)} <span class="faint small" style="margin-left:auto">${money(a.listPrice, false)}</span></label>`).join('')}`).join('')}</div>
      <button class="btn primary" id="save">Save proposal →</button></div>
    <div id="roiout"></div></div>`;
  const inputs = () => {
    const fd = Object.fromEntries(new FormData($('#rf')).entries());
    return { prospect: fd.prospect, industry: fd.industry, inputs: { revenue: fd.revenue * 1e6, financeFte: Number(fd.financeFte), hourlyCost: Number(fd.hourlyCost), apSpend: fd.apSpend * 1e6, opex: fd.opex * 1e6, idleCash: fd.idleCash * 1e6, arBalance: fd.revenue * 1e6 / 365 * 45 } };
  };
  let seq = 0;
  const calc = async () => {
    const my = ++seq;
    const ids = [...state.selected];
    $('#selcount').textContent = `${ids.length} selected`;
    saveSelection();
    if (!ids.length) { $('#roiout').innerHTML = '<div class="card empty">Select at least one agent.</div>'; return; }
    const r = await api('/roi', { method: 'POST', body: { agentIds: ids, inputs: inputs().inputs } });
    if (my !== seq) return;
    const lines = [...r.lines].sort((x, y) => y.value - x.value);
    const t = renderTable({ title: 'Value by agent', columns: [{ key: 'name', label: 'Agent' }, { key: 'hours', label: 'Hours / mo', format: 'number' }, { key: 'labor', label: 'Time value / yr', format: 'currency' }, { key: 'lever', label: 'Hard-dollar / yr', format: 'currency' }, { key: 'leverLabel', label: 'Lever' }, { key: 'value', label: 'Total value / yr', format: 'currency' }, { key: 'cost', label: 'List cost / yr', format: 'currency' }], rows: lines });
    $('#roiout').innerHTML = `<div class="kpis">
      <div class="card kpi tone-good-border"><div class="l">Annual value</div><div class="big-num num">${money(r.totalValue)}</div></div>
      <div class="card kpi"><div class="l">Annual investment</div><div class="big-num num">${money(r.totalCost)}</div><div class="d faint">${r.discount ? `after ${fmt(r.discount, 'pct')} bundle discount` : 'list price'}</div></div>
      <div class="card kpi tone-good-border"><div class="l">ROI</div><div class="big-num num">${fmt(r.roiMultiple, 'multiple')}</div></div>
      <div class="card kpi"><div class="l">Payback</div><div class="big-num num">${fmt(r.paybackMonths, 'months')}</div></div>
      <div class="card kpi"><div class="l">Hours freed / month</div><div class="big-num num">${fmt(r.hoursPerMonth, 'number')}</div><div class="d faint">≈ ${fmt(r.fteFreed, 'number1')} FTE redeployed</div></div>
      <div class="card kpi"><div class="l">Net value / yr</div><div class="big-num num">${money(r.netValue)}</div></div></div>
      <div class="charts"><div class="card chart-card"><h4>Annual value vs cost by agent</h4><div id="roichart"></div></div></div>${t.html}
      <div class="card pad section muted small">Bundle pricing: 10% off at 5+ agents, 20% at 10+, 30% at 20+. Time savings scale with finance team size; hard-dollar levers use conservative, labelled assumptions.</div>`;
    renderChart($('#roichart'), { type: 'bar', title: '', labels: lines.slice(0, 12).map((l) => l.name.replace(/ (Agent|Analyst|Assistant)$/, '')), series: [{ name: 'Annual value', data: lines.slice(0, 12).map((l) => l.value) }, { name: 'List cost', data: lines.slice(0, 12).map((l) => l.cost) }], format: 'currency' });
    t.bind($('#roiout'));
  };
  $('#picker').onchange = (e) => { if (e.target.type === 'checkbox') { e.target.checked ? state.selected.add(e.target.value) : state.selected.delete(e.target.value); calc(); } };
  $('#picker').querySelectorAll('[data-all]').forEach((l) => l.onclick = (e) => {
    e.preventDefault();
    const ids = state.agents.filter((a) => a.category === l.dataset.all).map((a) => a.id);
    const allOn = ids.every((id) => state.selected.has(id));
    ids.forEach((id) => (allOn ? state.selected.delete(id) : state.selected.add(id)));
    $('#picker').querySelectorAll('input').forEach((cb) => { cb.checked = state.selected.has(cb.value); });
    calc();
  });
  $('#rf').oninput = () => calc();
  $('#save').onclick = async () => {
    const v = inputs();
    if (!v.prospect) { $('#rf').prospect.focus(); toast('Enter the prospect company name'); return; }
    try {
      const r = await api('/proposals', { method: 'POST', body: { ...v, agentIds: [...state.selected], rep: state.rep } });
      toast('Proposal saved');
      location.hash = `#/proposal/${r.id}`;
    } catch (e) { toast(e.message); }
  };
  calc();
}

async function renderProposals() {
  const list = await api('/proposals');
  view.innerHTML = `<div class="page-head"><div><div class="eyebrow">Pipeline</div><h1>Saved proposals</h1><p>ROI-backed proposals created by the team. Open one to present or print it.</p></div><a class="btn primary" href="#/roi">+ New proposal</a></div>
    ${list.length ? `<div class="card tbl-card"><div class="tbl-scroll"><table class="data"><thead><tr><th>Prospect</th><th>Industry</th><th>Rep</th><th class="r">Agents</th><th class="r">Annual value</th><th class="r">Annual price</th><th class="r">ROI</th><th>Created</th><th></th></tr></thead><tbody>
      ${list.map((p) => `<tr><td><a href="#/proposal/${p.id}"><b>${esc(p.prospect)}</b></a></td><td>${esc(p.industry)}</td><td>${esc(p.rep)}</td><td class="r num">${p.summary.agents}</td><td class="r num">${money(p.summary.totalValue)}</td><td class="r num">${money(p.summary.totalCost)}</td><td class="r num">${fmt(p.summary.roiMultiple, 'multiple')}</td><td>${esc(p.created.slice(0, 10))}</td><td><button class="btn sm ghost" data-del="${p.id}" title="Delete">✕</button></td></tr>`).join('')}
    </tbody></table></div></div>` : '<div class="card empty">No proposals yet. <a href="#/roi">Build the first one →</a></div>'}`;
  view.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Delete this proposal?')) { await api(`/proposals/${b.dataset.del}`, { method: 'DELETE' }); renderProposals(); } });
}

async function renderProposal(id) {
  const p = await api(`/proposals/${id}`);
  const r = p.roi;
  const byCat = {};
  p.agents.forEach((a) => { (byCat[a.categoryName] ||= []).push(a); });
  view.innerHTML = `<div class="no-print" style="display:flex;gap:8px;justify-content:space-between;margin-bottom:14px"><a href="#/proposals">← All proposals</a><div style="display:flex;gap:8px"><button class="btn" id="copylink">Copy link</button><button class="btn primary" onclick="window.print()">Print / save PDF</button></div></div>
    <div class="card proposal">
      <div class="cover"><img class="logo" src="${LOGO_SRC}" alt="Company logo"><div class="eyebrow">Proposal · ${esc(p.created.slice(0, 10))}${p.rep ? ` · prepared by ${esc(p.rep)}` : ''}</div><h1>Finance AI agents for ${esc(p.prospect)}</h1><div class="muted" style="margin-top:6px">${esc(p.industry || 'Finance transformation')} · ${p.agents.length} agents · ${money(r.inputs.revenue)} revenue · ${r.inputs.financeFte}-person finance team</div></div>
      <h2>Executive summary</h2>
      <p>Deploying ${p.agents.length} finance agents is projected to deliver <b>${money(r.totalValue)}</b> of annual value for an annual investment of <b>${money(r.totalCost)}</b> — a <b>${fmt(r.roiMultiple, 'multiple')}</b> return with payback in <b>${fmt(r.paybackMonths, 'months')}</b>. The agents free roughly <b>${fmt(r.hoursPerMonth, 'number')} hours per month</b> (≈${fmt(r.fteFreed, 'number1')} FTE) for analysis and business partnering.</p>
      ${renderKpis([{ label: 'Annual value', value: r.totalValue, format: 'currency', tone: 'good' }, { label: 'Annual investment', value: r.totalCost, format: 'currency' }, { label: 'ROI', value: r.roiMultiple, format: 'multiple', tone: 'good' }, { label: 'Payback', value: r.paybackMonths, format: 'months' }])}
      <h2>Recommended agents</h2>
      ${Object.entries(byCat).map(([c, as]) => `<h3 style="font-size:14px;margin:14px 0 6px">${esc(c)}</h3><ul style="margin:0;padding-left:18px">${as.map((a) => `<li style="margin:4px 0"><b>${esc(a.name)}</b> — ${esc(a.tagline)} <span class="muted">${esc(a.value[0])}.</span></li>`).join('')}</ul>`).join('')}
      <h2>Value breakdown</h2><div id="ptable"></div>
      <h2>Investment</h2>
      <table class="data"><tbody><tr><td>List subscription (annual)</td><td class="r num">${money(r.subtotal, false)}</td></tr><tr><td>Bundle discount</td><td class="r num">${fmt(r.discount, 'pct')}</td></tr><tr><td><b>Annual investment</b></td><td class="r num"><b>${money(r.totalCost, false)}</b></td></tr></tbody></table>
      <h2>Assumptions</h2><p class="muted small">Revenue ${money(r.inputs.revenue)}, finance team ${r.inputs.financeFte} FTE at ${money(r.inputs.hourlyCost, false)}/hr, vendor spend ${money(r.inputs.apSpend)}, opex ${money(r.inputs.opex)}, idle cash ${money(r.inputs.idleCash)}. Time savings are based on observed hours per agent for an 8-person team, scaled to team size. Hard-dollar levers are conservative estimates and should be validated in a pilot.</p>
      <h2>Next steps</h2><ol><li>30-minute live demo on ${esc(p.prospect)}'s own data (read-only connection).</li><li>60-day pilot with 2–3 agents and agreed success metrics.</li><li>Rollout plan and security review.</li></ol>
    </div>`;
  const t = renderTable({ title: 'Annual value by agent', columns: [{ key: 'name', label: 'Agent' }, { key: 'hours', label: 'Hours / mo', format: 'number' }, { key: 'labor', label: 'Time value', format: 'currency' }, { key: 'lever', label: 'Hard-dollar', format: 'currency' }, { key: 'value', label: 'Total', format: 'currency' }], rows: [...r.lines].sort((x, y) => y.value - x.value) });
  $('#ptable').innerHTML = t.html; t.bind($('#ptable'));
  $('#copylink').onclick = () => { navigator.clipboard?.writeText(location.href); toast('Link copied'); };
}

async function renderInsights() {
  const d = await api('/analytics');
  view.innerHTML = `<div class="page-head"><div><div class="eyebrow">Enablement analytics</div><h1>What the field is demoing</h1><p>Every demo run is logged by rep and agent. Use this to spot coverage gaps and coach the team.</p></div></div>
    ${renderKpis([{ label: 'Demos run', value: d.totalDemos, format: 'number' }, { label: 'Agents demoed', value: d.byAgent.length, format: 'number' }, { label: 'Never demoed', value: d.never.length, format: 'number', tone: d.never.length ? 'bad' : 'good' }, { label: 'Proposals', value: d.proposals, format: 'number' }, { label: 'Proposal pipeline (ARR)', value: d.pipeline, format: 'currency' }])}
    <div class="charts"><div class="card chart-card"><h4>Demos per week</h4><div id="c1"></div></div><div class="card chart-card"><h4>Demos by category</h4><div id="c2"></div></div>
    <div class="card chart-card"><h4>Top agents</h4><div id="c3"></div></div><div class="card chart-card"><h4>Demos by rep</h4><div id="c4"></div></div></div><div id="tbl"></div>`;
  renderChart($('#c1'), { type: 'bar', labels: d.byWeek.map((w) => w.start.slice(5)), series: [{ name: 'Demos', data: d.byWeek.map((w) => w.n) }], format: 'number' });
  renderChart($('#c2'), { type: 'donut', labels: Object.keys(d.byCategory), values: Object.values(d.byCategory), format: 'number' });
  renderChart($('#c3'), { type: 'hbar', labels: d.byAgent.slice(0, 10).map((a) => a.name), series: [{ name: 'Demos', data: d.byAgent.slice(0, 10).map((a) => a.demos) }], format: 'number' });
  renderChart($('#c4'), { type: 'hbar', labels: d.byRep.map((r) => r.rep), series: [{ name: 'Demos', data: d.byRep.map((r) => r.n) }], format: 'number' });
  const t = renderTable({ title: `Coverage gap: ${d.never.length} agents never demoed`, columns: [{ key: 'name', label: 'Agent' }, { key: 'category', label: 'Category' }], rows: d.never });
  $('#tbl').innerHTML = t.html; t.bind($('#tbl'));
}

async function renderTenant() {
  const d = await api('/company');
  const f = d.financials;
  const s = d.snapshot;
  view.innerHTML = `<div class="page-head"><div><div class="eyebrow">Demo tenant</div><h1>${esc(d.company.name)}</h1><p>${esc(d.company.description)} ${esc(d.company.industry)}, HQ ${esc(d.company.hq)}, founded ${esc(d.company.founded)}. All data is synthetic but internally consistent — every agent reads from the same ledger.</p></div></div>
    ${renderKpis([{ label: 'ARR', value: s.arr, format: 'currency', delta: s.growth }, { label: 'TTM revenue', value: s.ttmRev, format: 'currency' }, { label: 'Gross margin', value: s.gm, format: 'pct' }, { label: 'TTM EBITDA', value: s.ttmEbitda, format: 'currency' }, { label: 'Cash', value: s.cash, format: 'currency' }, { label: 'Customers', value: s.customers, format: 'number' }, { label: 'Headcount', value: s.headcount, format: 'number' }, { label: 'NRR', value: s.nrr, format: 'pct' }])}
    <div class="charts"><div class="card chart-card"><h4>Revenue by line</h4><div id="t1"></div></div><div class="card chart-card"><h4>EBITDA & net income</h4><div id="t2"></div></div><div class="card chart-card"><h4>Cash & debt</h4><div id="t3"></div></div><div class="card chart-card"><h4>Customers & headcount</h4><div id="t4"></div></div></div><div id="tt"></div>`;
  const months = f.map((r) => r.month);
  renderChart($('#t1'), { type: 'bar', stacked: true, labels: months, series: [{ name: 'Subscription', data: f.map((r) => r.revenue_subscription) }, { name: 'Services', data: f.map((r) => r.revenue_services) }, { name: 'Hardware', data: f.map((r) => r.revenue_hardware) }], format: 'currency' });
  renderChart($('#t2'), { type: 'bar', labels: months, series: [{ name: 'EBITDA', data: f.map((r) => r.ebitda) }, { name: 'Net income', data: f.map((r) => r.net_income) }], format: 'currency' });
  renderChart($('#t3'), { type: 'line', labels: months, series: [{ name: 'Cash', data: f.map((r) => r.cash_end) }, { name: 'Debt', data: f.map((r) => r.debt_balance) }], format: 'currency' });
  renderChart($('#t4'), { type: 'line', labels: months, series: [{ name: 'Customers', data: f.map((r) => r.customers) }, { name: 'Headcount', data: f.map((r) => r.headcount) }], format: 'number' });
  const t = renderTable({ title: 'Monthly financials (24 months)', columns: [['month', 'Month', 'text'], ['revenue', 'Revenue', 'currency'], ['gross_profit', 'Gross profit', 'currency'], ['opex', 'Opex', 'currency'], ['ebitda', 'EBITDA', 'currency'], ['net_income', 'Net income', 'currency'], ['cash_end', 'Cash', 'currency'], ['ar_balance', 'AR', 'currency'], ['mrr', 'MRR', 'currency'], ['customers', 'Customers', 'number'], ['headcount', 'Heads', 'number']].map(([key, label, format]) => ({ key, label, format })), rows: [...f].reverse() });
  $('#tt').innerHTML = t.html; t.bind($('#tt'));
}

// ---------- router ----------
async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [r, arg, sub] = parts;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === (r || 'catalogue') || (r === 'agent' && a.dataset.route === 'catalogue') || (r === 'proposal' && a.dataset.route === 'proposals')));
  if (r !== '' && r !== undefined) $('#catalogue-root')?.remove();
  document.title = 'Finance Agent Catalogue';
  window.scrollTo(0, 0);
  try {
    if (!r) {
      state.agents = await api('/agents');
      await renderCatalogue();
    } else if (r === 'agent') await renderAgent(arg, sub || 'demo');
    else if (r === 'roi') await renderRoi();
    else if (r === 'proposals') await renderProposals();
    else if (r === 'proposal') await renderProposal(arg);
    else if (r === 'insights') await renderInsights();
    else if (r === 'tenant') await renderTenant();
    else view.innerHTML = '<div class="card empty">Page not found. <a href="#/">Back to the catalogue</a></div>';
  } catch (e) {
    view.innerHTML = `<div class="card pad tone-bad">Something went wrong: ${esc(e.message)}</div>`;
  }
  renderTray();
}

async function init() {
  const theme = store.get('theme', null);
  if (theme) document.documentElement.dataset.theme = theme;
  $('#theme').onclick = () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', document.documentElement.dataset.theme);
    route();
  };
  const sel = $('#rep');
  sel.innerHTML = REPS.map((r) => `<option ${r === state.rep ? 'selected' : ''}>${esc(r)}</option>`).join('');
  sel.onchange = () => { state.rep = sel.value; store.set('rep', state.rep); };
  [state.meta, state.agents] = await Promise.all([api('/meta'), api('/agents')]);
  window.addEventListener('hashchange', route);
  route();
}

init().catch((e) => { view.innerHTML = `<div class="card pad tone-bad">Could not reach the API: ${esc(e.message)}</div>`; });
