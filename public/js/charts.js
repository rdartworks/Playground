// Dependency-free SVG charts with hover tooltips. Colors come from CSS custom
// properties (--series-1..8) so light/dark themes swap in one place.
import { axisFmt, esc, fmt } from './format.js';

// Charts render 1:1 with their container width so text stays at its intended size.
let W = 640, H = 270;
const C = (i) => `var(--series-${(i % 8) + 1})`;
const NS = 'http://www.w3.org/2000/svg';

// Tooltip HTML lives in a per-chart array; elements carry only an index.
let TIPS = [];
const T = (html) => { TIPS.push(html); return `data-tip="${TIPS.length - 1}"`; };

export function renderChart(el, spec) {
  el.classList.add('chart-host');
  el._spec = spec;
  el.innerHTML = '';
  W = Math.max(300, Math.round(el.clientWidth || 640));
  H = Math.round(Math.min(300, Math.max(220, W * 0.48)));
  const draw = DRAW[spec.type];
  if (!draw) { el.textContent = `Unsupported chart: ${spec.type}`; return; }
  const legend = document.createElement('div');
  legend.className = 'legend';
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.hidden = true;
  el.append(legend, wrap);
  TIPS = [];
  const { svg, legendItems } = draw(spec, { tip, wrap });
  const tips = TIPS;
  if (legendItems?.length > 1) legend.innerHTML = legendItems.map((l) => `<span><i class="${l.line ? 'ln' : ''}" style="background:${l.color}"></i>${esc(l.name)}</span>`).join('');
  else legend.remove();
  wrap.innerHTML = svg;
  wrap.append(tip);
  wrap.querySelector('svg').setAttribute('role', 'img');
  wrap.querySelector('svg').setAttribute('aria-label', spec.title || spec.type);
  bindHover(wrap, tip, tips);
}

// Elements with data-tip show a tooltip; data-tip-x/y override the anchor (in SVG units).
function bindHover(wrap, tip, tips) {
  const svg = wrap.querySelector('svg');
  const show = (t, e) => {
    const box = svg.getBoundingClientRect();
    const scale = box.width / svg.viewBox.baseVal.width;
    let x = e.clientX - box.left, y = e.clientY - box.top;
    if (t.dataset.tipX) { x = Number(t.dataset.tipX) * scale; y = Number(t.dataset.tipY) * scale; }
    tip.innerHTML = tips[Number(t.dataset.tip)] ?? '';
    tip.hidden = false;
    tip.style.left = `${Math.min(box.width - 60, Math.max(60, x))}px`;
    tip.style.top = `${Math.max(30, y)}px`;
  };
  svg.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.hidden = true; svg.querySelectorAll('.hover-on').forEach((n) => n.classList.remove('hover-on')); return; }
    show(t, e);
    const g = t.dataset.group;
    svg.querySelectorAll('.hover-on').forEach((n) => n.classList.remove('hover-on'));
    if (g) svg.querySelectorAll(`[data-hl="${g}"]`).forEach((n) => n.classList.add('hover-on'));
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; svg.querySelectorAll('.hover-on').forEach((n) => n.classList.remove('hover-on')); });
}

function niceScale(min, max, ticks = 5) {
  if (min === max) { max = min + 1; min = Math.min(0, min); }
  const span = max - min;
  const step0 = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= ticks + 0.5) || mag * 10;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v / step) * step);
  return { lo, hi, ticks: out };
}

const tipRow = (color, name, value) => `<div class="row"><span><i style="background:${color}"></i>${esc(name)}</span><b>${esc(value)}</b></div>`;

function frame(m, yScale, yFmt, labels, xPos, opts = {}) {
  const parts = [];
  for (const t of yScale.ticks) {
    const y = opts.y(t);
    parts.push(`<line class="${t === 0 ? 'zeroline' : 'gridline'}" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>`);
    parts.push(`<text class="axis" x="${m.l - 8}" y="${y + 4}" text-anchor="end">${esc(axisFmt(t, yFmt))}</text>`);
  }
  const maxLabels = Math.max(3, Math.min(opts.maxLabels || 12, Math.floor((W - m.l - m.r) / 62)));
  const every = Math.max(1, Math.ceil(labels.length / maxLabels));
  labels.forEach((l, i) => {
    const isLast = i === labels.length - 1;
    if (i % every && !(isLast && (i % every) >= every * 0.75)) return;
    if (!isLast && i % every === 0 && labels.length - 1 - i < every * 0.75 && (labels.length - 1) % every >= every * 0.75) return;
    const txt = String(l).length > 14 ? `${String(l).slice(0, 13)}…` : l;
    parts.push(`<text class="axis" x="${xPos(i)}" y="${H - m.b + 16}" text-anchor="middle">${esc(txt)}</text>`);
  });
  return `<g class="axis">${parts.join('')}</g>`;
}

const DRAW = {
  line(spec) {
    const m = { l: 58, r: 14, t: 12, b: 26 };
    const series = spec.series;
    const vals = series.flatMap((s) => s.data).filter((v) => v !== null && v !== undefined);
    const vmin = Math.min(...vals), vmax = Math.max(...vals);
    // lines may use a non-zero baseline when every value sits well above zero
    const sc = niceScale(vmin > 0 && vmin > vmax * 0.5 ? vmin * 0.9 : Math.min(0, vmin), vmax);
    const n = spec.labels.length;
    const x = (i) => m.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - m.t - m.b);
    let svg = frame(m, sc, spec.format, spec.labels, x, { y });
    const bands = series.filter((s) => s.band);
    if (bands.length === 2) {
      const pts = [];
      bands[1].data.forEach((v, i) => { if (v !== null) pts.push(`${x(i)},${y(v)}`); });
      for (let i = bands[0].data.length - 1; i >= 0; i--) if (bands[0].data[i] !== null) pts.push(`${x(i)},${y(bands[0].data[i])}`);
      svg += `<polygon points="${pts.join(' ')}" fill="var(--series-1)" opacity=".13"/>`;
    }
    const legendItems = [];
    let ci = 0;
    series.forEach((s) => {
      if (s.band) return;
      const color = C(ci++);
      s._color = color;
      legendItems.push({ name: s.name, color, line: true });
      let d = '', pen = false;
      s.data.forEach((v, i) => { if (v === null || v === undefined) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="5 4"' : ''}/>`;
      const pts = s.data.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined);
      if (pts.length) { const [v, i] = pts[pts.length - 1]; svg += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${color}" stroke="var(--chart-surface)" stroke-width="2"/>`; }
    });
    // hover columns
    const colW = (W - m.l - m.r) / Math.max(1, n - 1);
    spec.labels.forEach((l, i) => {
      const rows = series.filter((s) => !s.band && s.data[i] !== null && s.data[i] !== undefined).map((s) => tipRow(s._color, s.name, fmt(s.data[i], spec.format)));
      const bandRows = bands.length === 2 && bands[0].data[i] !== null ? `<div class="row"><span>90% range</span><b>${esc(fmt(bands[0].data[i], spec.format))} – ${esc(fmt(bands[1].data[i], spec.format))}</b></div>` : '';
      if (!rows.length) return;
      const top = Math.min(...series.filter((s) => !s.band && s.data[i] !== null && s.data[i] !== undefined).map((s) => y(s.data[i])));
      svg += `<g ${T(`<b>${esc(l)}</b>${rows.join('')}${bandRows}`)} data-tip-x="${x(i)}" data-tip-y="${top}" data-group="c${i}">
        <rect x="${x(i) - colW / 2}" y="${m.t}" width="${colW}" height="${H - m.t - m.b}" fill="transparent"/>
        <line data-hl="c${i}" class="crosshair" x1="${x(i)}" x2="${x(i)}" y1="${m.t}" y2="${H - m.b}" stroke="var(--text-3)" stroke-dasharray="3 3" opacity="0"/></g>`;
    });
    return { svg: wrapSvg(svg), legendItems };
  },

  bar(spec) {
    const m = { l: 58, r: 14, t: 12, b: 26 };
    const bars = spec.series.filter((s) => s.type !== 'line');
    const lines = spec.series.filter((s) => s.type === 'line');
    const n = spec.labels.length;
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      if (spec.stacked) {
        let p = 0, q = 0;
        bars.forEach((s) => { const v = s.data[i] || 0; if (v >= 0) p += v; else q += v; });
        hi = Math.max(hi, p); lo = Math.min(lo, q);
      } else bars.forEach((s) => { hi = Math.max(hi, s.data[i] || 0); lo = Math.min(lo, s.data[i] || 0); });
      lines.forEach((s) => { hi = Math.max(hi, s.data[i] || 0); lo = Math.min(lo, s.data[i] || 0); });
    }
    const sc = niceScale(lo, hi);
    const band = (W - m.l - m.r) / n;
    const x = (i) => m.l + band * (i + 0.5);
    const y = (v) => m.t + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - m.t - m.b);
    let svg = frame(m, sc, spec.format, spec.labels, x, { y, maxLabels: 12 });
    const inner = band * 0.72;
    const legendItems = [];
    bars.forEach((s, si) => legendItems.push({ name: s.name, color: C(si) }));
    lines.forEach((s, li) => legendItems.push({ name: s.name, color: C(bars.length + li), line: true }));
    for (let i = 0; i < n; i++) {
      let pos = 0, neg = 0;
      const bw = spec.stacked ? inner : Math.max(2, inner / bars.length - 2);
      bars.forEach((s, si) => {
        const v = s.data[i] || 0;
        let y0, y1, bx;
        if (spec.stacked) { bx = x(i) - inner / 2; if (v >= 0) { y0 = y(pos + v); y1 = y(pos); pos += v; } else { y0 = y(neg); y1 = y(neg + v); neg += v; } }
        else { bx = x(i) - inner / 2 + si * (bw + 2); y0 = y(Math.max(0, v)); y1 = y(Math.min(0, v)); }
        const h = Math.max(0, y1 - y0 - (spec.stacked ? 1 : 0));
        if (h > 0) svg += `<rect x="${bx.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(3, bw / 3)}" fill="${C(si)}"/>`;
      });
    }
    lines.forEach((s, li) => {
      const color = C(bars.length + li);
      const d = s.data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v ?? 0).toFixed(1)}`).join('');
      svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" ${s.dashed ? 'stroke-dasharray="5 4"' : ''}/>`;
    });
    for (let i = 0; i < n; i++) {
      const rows = spec.series.map((s, si) => tipRow(si < bars.length ? C(si) : C(bars.length + lines.indexOf(s)), s.name, fmt(s.data[i], spec.format))).join('');
      const total = spec.stacked && bars.length > 1 ? `<div class="row"><span>Net</span><b>${esc(fmt(bars.reduce((a, s) => a + (s.data[i] || 0), 0), spec.format))}</b></div>` : '';
      svg += `<rect ${T(`<b>${esc(spec.labels[i])}</b>${rows}${total}`)} data-tip-x="${x(i)}" data-tip-y="${y(hi) + 4}" x="${x(i) - band / 2}" y="${m.t}" width="${band}" height="${H - m.t - m.b}" fill="transparent" class="hit"/>`;
    }
    return { svg: wrapSvg(svg), legendItems };
  },

  hbar(spec) {
    const vals = spec.series[0].data;
    const n = vals.length;
    const rowH = 26, m = { l: 170, r: 70, t: 6, b: 6 };
    const h = m.t + m.b + n * rowH;
    const max = Math.max(...vals.map(Math.abs), 1);
    const x = (v) => m.l + (v / max) * (W - m.l - m.r);
    let svg = '';
    vals.forEach((v, i) => {
      const yy = m.t + i * rowH;
      const label = spec.labels[i].length > 26 ? `${spec.labels[i].slice(0, 25)}…` : spec.labels[i];
      svg += `<text class="axis" x="${m.l - 8}" y="${yy + 17}" text-anchor="end" style="fill:var(--text-2);font-size:11.5px">${esc(label)}</text>`;
      svg += `<rect x="${m.l}" y="${yy + 5}" width="${Math.max(2, x(v) - m.l)}" height="${rowH - 10}" rx="3" fill="${C(0)}" ${T(`<b>${esc(spec.labels[i])}</b><div>${esc(fmt(v, spec.format))}</div>`)}/>`;
      svg += `<text x="${x(v) + 6}" y="${yy + 17}" style="fill:var(--text-2);font-size:11.5px" class="num">${esc(fmt(v, spec.format))}</text>`;
    });
    return { svg: wrapSvg(svg, h), legendItems: [] };
  },

  waterfall(spec) {
    const m = { l: 58, r: 14, t: 18, b: 30 };
    let run = 0;
    const bars = spec.steps.map((s) => {
      if (s.total) { run = s.value; return { ...s, from: 0, to: s.value }; }
      const from = run; run += s.value; return { ...s, from, to: run };
    });
    const vals = bars.flatMap((b) => [b.from, b.to]);
    const sc = niceScale(Math.min(0, ...vals), Math.max(0, ...vals));
    const n = bars.length;
    const band = (W - m.l - m.r) / n;
    const x = (i) => m.l + band * (i + 0.5);
    const y = (v) => m.t + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - m.t - m.b);
    let svg = frame(m, sc, spec.format, bars.map((b) => b.label), x, { y, maxLabels: 14 });
    bars.forEach((b, i) => {
      const y0 = y(Math.max(b.from, b.to)), y1 = y(Math.min(b.from, b.to));
      const color = b.total ? 'var(--series-1)' : b.value >= 0 ? 'var(--series-3)' : 'var(--series-8)';
      svg += `<rect x="${x(i) - band * 0.34}" y="${y0}" width="${band * 0.68}" height="${Math.max(1.5, y1 - y0)}" rx="3" fill="${color}" ${T(`<b>${esc(b.label)}</b><div>${esc(b.total ? fmt(b.value, spec.format) : (b.value >= 0 ? '+' : '') + fmt(b.value, spec.format))}</div>`)}/>`;
      if (i < n - 1) svg += `<line x1="${x(i) + band * 0.34}" x2="${x(i + 1) - band * 0.34}" y1="${y(b.to)}" y2="${y(b.to)}" stroke="var(--text-3)" stroke-dasharray="2 2"/>`;
      if (b.total || n <= 9) svg += `<text x="${x(i)}" y="${y0 - 5}" text-anchor="middle" style="fill:var(--text-2);font-size:10.5px">${esc(fmt(b.value, spec.format))}</text>`;
    });
    return { svg: wrapSvg(svg), legendItems: [{ name: 'Total', color: 'var(--series-1)' }, { name: 'Increase', color: 'var(--series-3)' }, { name: 'Decrease', color: 'var(--series-8)' }] };
  },

  donut(spec) {
    let items = spec.labels.map((l, i) => ({ l, v: spec.values[i] })).filter((d) => d.v > 0).sort((a, b) => b.v - a.v);
    if (items.length > 8) { const rest = items.slice(7); items = [...items.slice(0, 7), { l: 'Other', v: rest.reduce((s, d) => s + d.v, 0) }]; }
    const total = items.reduce((s, d) => s + d.v, 0);
    const cx = 150, cy = 130, R = 108, r = 66;
    let a0 = -Math.PI / 2, svg = '';
    items.forEach((d, i) => {
      const a1 = a0 + (d.v / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a, rad) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
      const path = items.length === 1 ? `M${cx - R},${cy}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0M${cx - r},${cy}a${r},${r} 0 1,1 ${2 * r},0a${r},${r} 0 1,1 ${-2 * r},0` : `M${p(a0, R)}A${R},${R} 0 ${large} 1 ${p(a1, R)}L${p(a1, r)}A${r},${r} 0 ${large} 0 ${p(a0, r)}Z`;
      svg += `<path d="${path}" fill="${C(i)}" stroke="var(--chart-surface)" stroke-width="2" ${T(`<b>${esc(d.l)}</b><div>${esc(fmt(d.v, spec.format))} · ${(d.v / total * 100).toFixed(1)}%</div>`)}/>`;
      a0 = a1;
    });
    svg += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" style="fill:var(--text);font-size:17px;font-weight:700">${esc(fmt(total, spec.format))}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" style="fill:var(--text-3);font-size:11px">total</text>`;
    items.forEach((d, i) => {
      const yy = 30 + i * 26;
      svg += `<rect x="300" y="${yy - 9}" width="10" height="10" rx="2" fill="${C(i)}"/><text x="318" y="${yy}" style="fill:var(--text-2);font-size:12px">${esc(d.l.length > 30 ? d.l.slice(0, 29) + '…' : d.l)}</text><text x="${W - 10}" y="${yy}" text-anchor="end" class="num" style="fill:var(--text);font-size:12px;font-weight:600">${(d.v / total * 100).toFixed(1)}%</text>`;
    });
    return { svg: wrapSvg(svg, Math.max(H, 30 + items.length * 26)), legendItems: [] };
  },

  tornado(spec) {
    const n = spec.labels.length, rowH = 30, m = { l: 130, r: 20, t: 22, b: 8 };
    const h = m.t + m.b + n * rowH;
    const all = [...spec.lo, ...spec.hi, spec.base];
    const lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.08;
    const x = (v) => m.l + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (W - m.l - m.r);
    let svg = `<line x1="${x(spec.base)}" x2="${x(spec.base)}" y1="${m.t - 6}" y2="${h - m.b}" stroke="var(--text-3)"/><text x="${x(spec.base)}" y="${m.t - 10}" text-anchor="middle" style="fill:var(--text-2);font-size:11px">Base ${esc(fmt(spec.base, spec.format))}</text>`;
    spec.labels.forEach((l, i) => {
      const yy = m.t + i * rowH;
      svg += `<text class="axis" x="${m.l - 8}" y="${yy + 19}" text-anchor="end" style="fill:var(--text-2);font-size:12px">${esc(l)}</text>`;
      const seg = (v, color, name) => { const a = Math.min(x(v), x(spec.base)), b = Math.max(x(v), x(spec.base)); return `<rect x="${a}" y="${yy + 6}" width="${Math.max(1, b - a)}" height="${rowH - 12}" rx="3" fill="${color}" ${T(`<b>${esc(l)} ${name}</b><div>${esc(fmt(v, spec.format))} (${v - spec.base >= 0 ? '+' : ''}${esc(fmt(v - spec.base, spec.format))})</div>`)}/>`; };
      svg += seg(spec.lo[i], 'var(--series-2)', 'low') + seg(spec.hi[i], 'var(--series-1)', 'high');
    });
    return { svg: wrapSvg(svg, h), legendItems: [{ name: 'Driver −', color: 'var(--series-2)' }, { name: 'Driver +', color: 'var(--series-1)' }] };
  },

  scatter(spec) {
    const m = { l: 58, r: 20, t: 16, b: 36 };
    const xs = spec.points.map((p) => p.x), ys = spec.points.map((p) => p.y);
    const sx = niceScale(Math.min(...xs), Math.max(...xs)), sy = niceScale(Math.min(0, ...ys), Math.max(...ys));
    const x = (v) => m.l + ((v - sx.lo) / (sx.hi - sx.lo)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - sy.lo) / (sy.hi - sy.lo)) * (H - m.t - m.b);
    const rMax = Math.max(...spec.points.map((p) => p.r || 1));
    const groups = [...new Set(spec.points.map((p) => p.group))];
    let svg = '';
    for (const t of sy.ticks) svg += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(axisFmt(t, spec.yFormat))}</text>`;
    for (const t of sx.ticks) svg += `<text class="axis" x="${x(t)}" y="${H - m.b + 16}" text-anchor="middle">${esc(axisFmt(t, spec.xFormat))}</text>`;
    svg += `<text class="axis" x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle">${esc(spec.xLabel || '')}</text>`;
    spec.points.forEach((p) => {
      const rr = 6 + 16 * Math.sqrt((p.r || 1) / rMax);
      const color = C(groups.indexOf(p.group));
      svg += `<circle cx="${x(p.x)}" cy="${y(p.y)}" r="${rr}" fill="${color}" fill-opacity=".55" stroke="${color}" stroke-width="1.5" ${T(`<b>${esc(p.label)}</b><div>${esc(spec.xLabel)}: ${esc(fmt(p.x, spec.xFormat))}</div><div>${esc(spec.yLabel)}: ${esc(fmt(p.y, spec.yFormat))}</div>`)}/>`;
      svg += `<text x="${x(p.x) + rr + 3}" y="${y(p.y) + 4}" style="fill:var(--text-2);font-size:11px;pointer-events:none">${esc(p.label)}</text>`;
    });
    return { svg: wrapSvg(svg), legendItems: groups.map((g, i) => ({ name: g, color: C(i) })) };
  },

  heatmap(spec) {
    const m = { l: 70, r: 8, t: 24, b: 6 };
    const rows = spec.rows.length, cols = spec.cols.length;
    const cw = (W - m.l - m.r) / cols, ch = 24;
    const h = m.t + m.b + rows * ch;
    const ramp = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
    const vals = spec.values.flat().filter((v) => v !== undefined);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    let svg = '';
    spec.cols.forEach((c, j) => { svg += `<text class="axis" x="${m.l + cw * (j + 0.5)}" y="${m.t - 8}" text-anchor="middle">${esc(c)}</text>`; });
    spec.rows.forEach((r, i) => {
      svg += `<text class="axis" x="${m.l - 8}" y="${m.t + i * ch + 16}" text-anchor="end">${esc(r)}</text>`;
      spec.values[i].forEach((v, j) => {
        const k = Math.round(((v - lo) / (hi - lo || 1)) * (ramp.length - 1));
        svg += `<rect x="${m.l + j * cw + 1}" y="${m.t + i * ch + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="${ramp[k]}" ${T(`<b>${esc(r)} · ${esc(spec.cols[j])}</b><div>${esc(fmt(v, spec.format))}</div>`)}/>`;
        if (cw > 34) svg += `<text x="${m.l + j * cw + cw / 2}" y="${m.t + i * ch + 16}" text-anchor="middle" style="font-size:10px;fill:${k >= 3 ? '#fff' : '#0b1f3a'};pointer-events:none">${Math.round(v * 100)}</text>`;
      });
    });
    return { svg: wrapSvg(svg, h), legendItems: [] };
  },

  gantt(spec) {
    const n = spec.tasks.length, rowH = 18, m = { l: 210, r: 14, t: 22, b: 6 };
    const maxDay = Math.max(spec.target + 2, ...spec.tasks.map((t) => t.end + 1));
    const x = (d) => m.l + (d / maxDay) * (W - m.l - m.r);
    const h = m.t + m.b + n * rowH;
    let svg = '';
    for (let d = 0; d <= maxDay; d++) svg += `<line class="gridline" x1="${x(d)}" x2="${x(d)}" y1="${m.t - 4}" y2="${h - m.b}"/>${d ? `<text class="axis" x="${x(d - 0.5)}" y="${m.t - 8}" text-anchor="middle">D${d}</text>` : ''}`;
    svg += `<line x1="${x(spec.target)}" x2="${x(spec.target)}" y1="${m.t - 4}" y2="${h}" stroke="var(--series-8)" stroke-width="2" stroke-dasharray="4 3"/>`;
    spec.tasks.forEach((t, i) => {
      const yy = m.t + i * rowH;
      const color = t.status === 'Done' ? 'var(--series-3)' : t.status === 'Done (late)' ? 'var(--series-2)' : t.status === 'In progress' ? 'var(--series-1)' : 'var(--text-3)';
      svg += `<text class="axis" x="${m.l - 8}" y="${yy + 13}" text-anchor="end" style="fill:var(--text-2);font-size:10.5px">${esc(t.label.length > 34 ? t.label.slice(0, 33) + '…' : t.label)}</text>`;
      svg += `<rect x="${x(t.start)}" y="${yy + 3}" width="${Math.max(4, x(t.end) - x(t.start))}" height="${rowH - 6}" rx="3" fill="${color}" ${t.status === 'Not started' ? 'fill-opacity=".35"' : ''} ${T(`<b>${esc(t.label)}</b><div>${esc(t.status)} · day ${t.start + 1}–${t.end}</div>`)}/>`;
    });
    return { svg: wrapSvg(svg, h), legendItems: [{ name: 'Done', color: 'var(--series-3)' }, { name: 'Done late', color: 'var(--series-2)' }, { name: 'In progress', color: 'var(--series-1)' }, { name: 'Not started', color: 'var(--text-3)' }, { name: `Target day ${spec.target}`, color: 'var(--series-8)', line: true }] };
  },

  football(spec) {
    const n = spec.labels.length, rowH = 40, m = { l: 190, r: 30, t: 10, b: 30 };
    const h = m.t + m.b + n * rowH;
    const sc = niceScale(Math.min(...spec.lo) * 0.9, Math.max(...spec.hi) * 1.05);
    const x = (v) => m.l + ((v - sc.lo) / (sc.hi - sc.lo)) * (W - m.l - m.r);
    let svg = '';
    for (const t of sc.ticks) svg += `<line class="gridline" x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${h - m.b}"/><text class="axis" x="${x(t)}" y="${h - m.b + 16}" text-anchor="middle">${esc(axisFmt(t, spec.format))}</text>`;
    spec.labels.forEach((l, i) => {
      const yy = m.t + i * rowH;
      svg += `<text class="axis" x="${m.l - 8}" y="${yy + 24}" text-anchor="end" style="fill:var(--text-2);font-size:11.5px">${esc(l)}</text>`;
      svg += `<rect x="${x(spec.lo[i])}" y="${yy + 9}" width="${x(spec.hi[i]) - x(spec.lo[i])}" height="${rowH - 18}" rx="4" fill="${C(i)}" fill-opacity=".75" ${T(`<b>${esc(l)}</b><div>${esc(fmt(spec.lo[i], spec.format))} – ${esc(fmt(spec.hi[i], spec.format))}</div><div>Mid ${esc(fmt(spec.mid[i], spec.format))}</div>`)}/>`;
      svg += `<line x1="${x(spec.mid[i])}" x2="${x(spec.mid[i])}" y1="${yy + 6}" y2="${yy + rowH - 6}" stroke="var(--text)" stroke-width="2"/>`;
    });
    return { svg: wrapSvg(svg, h), legendItems: [] };
  },

  riskmatrix(spec) {
    const m = { l: 60, r: 20, t: 10, b: 36 }, size = 5;
    const gw = (W - m.l - m.r) / size, gh = (H - m.t - m.b) / size;
    const ramp = (s) => (s >= 15 ? '#e34948' : s >= 10 ? '#ec835a' : s >= 6 ? '#fab219' : '#9ec5f4');
    let svg = '';
    for (let l = 1; l <= size; l++) for (let im = 1; im <= size; im++) {
      svg += `<rect x="${m.l + (l - 1) * gw + 1}" y="${m.t + (size - im) * gh + 1}" width="${gw - 2}" height="${gh - 2}" rx="4" fill="${ramp(l * im)}" fill-opacity=".28"/>`;
    }
    for (let i = 1; i <= size; i++) {
      svg += `<text class="axis" x="${m.l + (i - 0.5) * gw}" y="${H - m.b + 16}" text-anchor="middle">${i}</text><text class="axis" x="${m.l - 10}" y="${m.t + (size - i + 0.5) * gh + 4}" text-anchor="end">${i}</text>`;
    }
    svg += `<text class="axis" x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle">Likelihood →</text><text class="axis" x="14" y="${(m.t + H - m.b) / 2}" transform="rotate(-90 14 ${(m.t + H - m.b) / 2})" text-anchor="middle">Impact →</text>`;
    const cells = {};
    spec.points.forEach((p) => {
      const key = `${p.x}-${p.y}`;
      const k = (cells[key] = (cells[key] || 0) + 1) - 1;
      const cx = m.l + (p.x - 0.5) * gw + ((k % 3) - 1) * 26, cy = m.t + (size - p.y + 0.5) * gh + (Math.floor(k / 3) - 0.3) * 18;
      svg += `<g ${T(`<b>${esc(p.label)}</b><div>Likelihood ${p.x} × Impact ${p.y} = ${p.x * p.y} (${esc(p.rating)})</div>`)}><circle cx="${cx}" cy="${cy}" r="8" fill="${ramp(p.x * p.y)}" stroke="var(--chart-surface)" stroke-width="2"/><text x="${cx}" y="${cy + 20}" text-anchor="middle" style="font-size:9.5px;fill:var(--text-2)">${esc(p.label.slice(0, 10))}</text></g>`;
    });
    return { svg: wrapSvg(svg), legendItems: [] };
  },
};

function wrapSvg(inner, h = H) {
  return `<svg xmlns="${NS}" viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMid meet"><style>.hover-on{opacity:1 !important}</style>${inner}</svg>`;
}

/** Tiny inline sparkline for cards. */
export function sparkline(values, color = 'var(--series-1)', w = 120, h = 32) {
  const lo = Math.min(...values), hi = Math.max(...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * w},${h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6)}`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => document.querySelectorAll('.chart-host').forEach((el) => el._spec && renderChart(el, el._spec)), 200);
});
