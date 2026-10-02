export function money(v, compact = true) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (!compact) return `${s}$${Math.round(a).toLocaleString('en-US')}`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 2)}M`;
  if (a >= 1e4) return `${s}$${(a / 1e3).toFixed(0)}K`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
}

export function fmt(v, f = 'text') {
  if (v && typeof v === 'object' && 'v' in v) return fmt(v.v, v.f);
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '—';
  if (typeof v !== 'number') return String(v);
  switch (f) {
    case 'currency': return money(v);
    case 'currency0': return money(v, false);
    case 'currency2': return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'pct': return `${(v * 100).toFixed(Math.abs(v) < 0.1 && v !== 0 ? 1 : 1)}%`;
    case 'pts': return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} pts`;
    case 'months': return `${v.toFixed(1)} mo`;
    case 'days': return `${v.toFixed(0)} d`;
    case 'multiple': return `${v.toFixed(2)}x`;
    case 'number1': return v.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    case 'number': return Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 1 });
    default: return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
}

/** Short axis label. */
export function axisFmt(v, f) {
  if (f === 'currency' || f === 'currency0' || f === 'currency2') return money(v);
  if (f === 'pct') return `${Math.round(v * 100)}%`;
  if (f === 'multiple') return `${v.toFixed(1)}x`;
  if (f === 'days') return `${Math.round(v)}d`;
  if (f === 'months') return `${Math.round(v)}mo`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v * 100) / 100);
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS_TONE = {
  good: ['Effective', 'Compliant', 'On track', 'Fund', 'Done', 'Ready', 'Received', 'Healthy', 'OK', 'Proceed', 'Supported', 'Achievable', 'Significant', 'Yes', 'In budget', 'Registered', 'Optional'],
  bad: ['Breach', 'Significant deficiency', 'Deficiency', 'Over', 'Reject (NPV<0)', 'Done (late)', 'Red flag', 'Not started', 'Reorder now', 'Above guardrail', 'Possible duplicate', 'No PO, round amount', 'Remediate', 'Do not proceed', 'Risky', 'Critical', 'Over budget', 'Nexus review needed', 'Auto-renews'],
  warn: ['Watch', 'Defer (budget)', 'In progress', 'Requested', 'Follow-up', 'Overstocked', 'No PO', 'Not tested', 'Under', 'High', 'Stretch', 'Recommended', 'Proceed only with financing', 'Medium'],
};
export function statusBadge(v) {
  if (!v) return '';
  const tone = STATUS_TONE.good.includes(v) ? 'good' : STATUS_TONE.bad.includes(v) ? 'bad' : STATUS_TONE.warn.includes(v) ? 'warn' : 'neutral';
  const icon = { good: '✓', bad: '!', warn: '•', neutral: '' }[tone];
  return `<span class="status ${tone}">${icon ? `<span aria-hidden="true">${icon}</span>` : ''}${esc(v)}</span>`;
}
