// Optional "Ask the agent" copilot. With ANTHROPIC_API_KEY set, Claude answers questions
// grounded in the agent's computed result; without it, a deterministic answer is built
// from the same result so the demo still works offline.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
let client = null;

export function llmEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const SYSTEM = `You are a finance AI agent inside a sales-enablement demo. You are answering questions about an analysis you just ran on the demo tenant "Northwind Cloud, Inc." (a fictional B2B SaaS company).
Ground every number in the JSON result provided; never invent figures that are not in it or directly derivable from it. If the result doesn't contain what is asked, say so and suggest which agent in the catalogue would answer it.
Write for a CFO: lead with the answer, then 2-4 short supporting bullets. Keep it under 180 words. Plain text, no markdown headings.`;

export async function askAgent({ agent, result, question }) {
  if (!llmEnabled()) return { answer: fallbackAnswer(agent, result, question), source: 'offline' };
  const compact = {
    agent: agent.name, params: result.params, headline: result.output.headline, kpis: result.output.kpis,
    insights: result.output.insights, actions: result.output.actions,
    tables: result.output.tables.map((t) => ({ title: t.title, rows: t.rows.slice(0, 30) })),
  };
  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' }, // short grounded Q&A; low effort keeps the demo snappy
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Analysis result (JSON):\n${JSON.stringify(compact)}\n\nQuestion: ${question}` }],
    });
    if (response.stop_reason === 'refusal') {
      return { answer: 'The model declined to answer this question. Try rephrasing it around the analysis results.', source: 'claude' };
    }
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { answer: text || fallbackAnswer(agent, result, question), source: 'claude', model: response.model };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { answer: fallbackAnswer(agent, result, question), source: 'offline', warning: 'Claude API key was rejected; showing offline answer.' };
    if (err instanceof Anthropic.RateLimitError) return { answer: fallbackAnswer(agent, result, question), source: 'offline', warning: 'Claude API is rate limited; showing offline answer.' };
    if (err instanceof Anthropic.APIError) return { answer: fallbackAnswer(agent, result, question), source: 'offline', warning: `Claude API error (${err.status ?? 'network'}); showing offline answer.` };
    throw err;
  }
}

function fallbackAnswer(agent, result, question) {
  const o = result.output;
  const q = question.toLowerCase();
  const words = q.split(/\W+/).filter((w) => w.length > 3);
  const scored = [...o.insights, ...o.actions].map((t) => ({ t, s: words.filter((w) => t.toLowerCase().includes(w)).length })).sort((a, b) => b.s - a.s);
  const kpis = o.kpis.filter((k) => words.some((w) => k.label.toLowerCase().includes(w)));
  const lines = [o.headline];
  for (const k of (kpis.length ? kpis : o.kpis.slice(0, 3))) lines.push(`• ${k.label}: ${formatValue(k.value, k.format)}`);
  for (const x of scored.slice(0, 2)) lines.push(`• ${x.t}`);
  lines.push(`(Offline answer from the ${agent.name}'s computed result. Set ANTHROPIC_API_KEY for conversational answers.)`);
  return lines.join('\n');
}

function formatValue(v, f) {
  if (typeof v !== 'number') return String(v);
  if (f === 'pct') return `${(v * 100).toFixed(1)}%`;
  if (f === 'currency' || f === 'currency2') return v >= 1e6 || v <= -1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v).toLocaleString('en-US')}`;
  if (f === 'months') return `${v.toFixed(1)} months`;
  if (f === 'days') return `${v.toFixed(0)} days`;
  if (f === 'multiple') return `${v.toFixed(2)}x`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
