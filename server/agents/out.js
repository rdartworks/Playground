// Small builders so every agent returns the same result shape the UI renders.
import { monthLabel } from '../lib/fin.js';

export const kpi = (label, value, format = 'currency', extra = {}) => ({ label, value, format, ...extra });
export const line = (title, months, series, format = 'currency', extra = {}) =>
  ({ type: 'line', title, labels: months.map((m) => (/^\d{4}-\d{2}$/.test(m) ? monthLabel(m) : m)), series, format, ...extra });
export const bar = (title, labels, series, format = 'currency', extra = {}) =>
  ({ type: 'bar', title, labels: labels.map((m) => (/^\d{4}-\d{2}$/.test(m) ? monthLabel(m) : m)), series, format, ...extra });
export const stacked = (title, labels, series, format = 'currency', extra = {}) =>
  ({ type: 'bar', stacked: true, title, labels: labels.map((m) => (/^\d{4}-\d{2}$/.test(m) ? monthLabel(m) : m)), series, format, ...extra });
export const hbar = (title, labels, values, format = 'currency', extra = {}) =>
  ({ type: 'hbar', title, labels, series: [{ name: title, data: values }], format, ...extra });
export const waterfall = (title, steps, format = 'currency') => ({ type: 'waterfall', title, steps, format });
export const donut = (title, labels, values, format = 'currency') => ({ type: 'donut', title, labels, values, format });
export const table = (title, columns, rows, extra = {}) => ({ title, columns, rows, ...extra });
export const col = (key, label, format = 'text') => ({ key, label, format });
export const s = (name, data, extra = {}) => ({ name, data, ...extra });

export function result({ headline, kpis = [], charts = [], tables = [], insights = [], actions = [], narrative }) {
  return { headline, kpis, charts, tables, insights, actions, narrative };
}
