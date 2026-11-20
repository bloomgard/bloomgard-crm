/**
 * Which model does what. Two tiers, both overridable from the environment so a model can be
 * swapped (or tried against another) without a code change:
 *   fast  — short, high-volume jobs: auto-replies, summaries, reading an email, lead scoring
 *   smart — work that has to be right first time: extracting a quote from an email, matching
 *           catalogue columns, the Home assistant's multi-step tool use (AGENT_MODEL)
 * Claude and GPT cost the same at each tier on OpenRouter; these are Anthropic's current ones.
 */
export const FAST_MODEL = process.env.AI_FAST_MODEL || 'anthropic/claude-haiku-5.5';
export const SMART_MODEL = process.env.AI_SMART_MODEL || 'anthropic/claude-sonnet-5.5';

/**
 * Parse a model's JSON answer. Asked for JSON, a model may still wrap it in ``` fences or add a
 * sentence around it; take the outermost object either way. Throws if there is none.
 */
export function parseModelJson<T = any>(text: string | null | undefined): T {
  const s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(s); } catch { /* look for the object inside */ }
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a === -1 || b <= a) throw new Error('The AI did not return JSON.');
  return JSON.parse(s.slice(a, b + 1));
}
