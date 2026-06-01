// Time estimation for a task. Mirrors the client prototype:
//   * estimateWithClaude — Claude estimates billable minutes + writes a
//     past-tense narrative (the same prompt as the browser version).
//   * heuristicEstimate  — no-key/failure fallback: minutes from the edit span.
// Returns { minutes, narrative, confidence, reasoning }.

const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';

export function heuristicEstimate(task) {
  let minutes = 15;
  if (task.createdTime && task.lastEditedTime) {
    const span = (new Date(task.lastEditedTime) - new Date(task.createdTime)) / 60000;
    if (Number.isFinite(span) && span > 0) minutes = Math.min(240, Math.max(6, Math.round(span)));
  }
  let narrative = String(task.title || '').trim();
  if (narrative) narrative = narrative.charAt(0).toUpperCase() + narrative.slice(1);
  return { minutes, narrative: narrative || 'Notion task', confidence: 0.4, reasoning: 'Estimated from task edit span.' };
}

export async function estimateWithClaude(task, apiKey) {
  if (!apiKey) throw new Error('NO_API_KEY');
  const spanMin = task.createdTime && task.lastEditedTime
    ? Math.round((new Date(task.lastEditedTime) - new Date(task.createdTime)) / 60000)
    : null;

  const system = `You are a legal billing assistant. Given a completed task from an attorney's task tracker, estimate the billable time and write the billing narrative.
1. Estimate billable minutes (integer). Use the elapsed editing span as a loose signal but apply legal judgment about how long the described work realistically takes.
2. Write a concise past-tense billing narrative describing the legal work (e.g., "Drafted motion to dismiss regarding personal jurisdiction."). Do not invent facts beyond the task title.
3. Give a confidence between 0 and 1.
Respond with ONLY a JSON object, no prose, no code fences:
{"minutes": <integer>, "narrative": "<string>", "confidence": <number>, "reasoning": "<one short sentence>"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: `Task title: ${task.title}\nElapsed editing span: ${spanMin == null ? 'unknown' : spanMin + ' minutes'}` }],
    }),
  });

  if (!res.ok) {
    const err = new Error(res.status === 401 ? 'Anthropic rejected the API key.' : `Anthropic API error (${res.status}).`);
    err.status = res.status === 401 ? 401 : 502;
    throw err;
  }

  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  let raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) raw = fenced[1].trim();
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('Claude returned an unreadable estimate.');
  const parsed = JSON.parse(raw.slice(s, e + 1));
  const minutes = Math.max(1, Math.round(Number(parsed.minutes) || 0));
  const conf = Number(parsed.confidence);
  return {
    minutes,
    narrative: String(parsed.narrative || task.title || '').trim(),
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : null,
    reasoning: String(parsed.reasoning || '').trim(),
  };
}

// Estimate with Claude when a key is present, falling back to the heuristic on
// any failure so one bad task never breaks a whole sync.
export async function estimateTask(task, apiKey) {
  if (!apiKey) return heuristicEstimate(task);
  try {
    return await estimateWithClaude(task, apiKey);
  } catch (_) {
    return heuristicEstimate(task);
  }
}
