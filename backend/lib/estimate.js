// Time estimation, server-side. Two estimators share one Claude call/parse:
//   * estimateTask  — a Notion task -> billable minutes + past-tense narrative.
//   * estimateEmail — a SENT email  -> billable minutes + past-tense narrative.
// Each has a no-key/failure heuristic fallback so one bad item never breaks a
// whole sync. Returns { minutes, narrative, confidence, reasoning }.

const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';

// ---------------------------------------------------------------------------
// Shared Claude call: send a system + user message, parse the JSON estimate.
// ---------------------------------------------------------------------------
async function callClaudeEstimate(system, userContent, apiKey, fallbackNarrative) {
  if (!apiKey) throw new Error('NO_API_KEY');

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
      messages: [{ role: 'user', content: userContent }],
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
    narrative: String(parsed.narrative || fallbackNarrative || '').trim(),
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : null,
    reasoning: String(parsed.reasoning || '').trim(),
  };
}

// ---------------------------------------------------------------------------
// Notion task estimator.
// ---------------------------------------------------------------------------
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
  const spanMin = task.createdTime && task.lastEditedTime
    ? Math.round((new Date(task.lastEditedTime) - new Date(task.createdTime)) / 60000)
    : null;

  const system = `You are a legal billing assistant. Given a completed task from an attorney's task tracker, estimate the billable time and write the billing narrative.
1. Estimate billable minutes (integer). Use the elapsed editing span as a loose signal but apply legal judgment about how long the described work realistically takes.
2. Write a concise past-tense billing narrative describing the legal work (e.g., "Drafted motion to dismiss regarding personal jurisdiction."). Do not invent facts beyond the task title.
3. Give a confidence between 0 and 1.
Respond with ONLY a JSON object, no prose, no code fences:
{"minutes": <integer>, "narrative": "<string>", "confidence": <number>, "reasoning": "<one short sentence>"}`;

  const userContent = `Task title: ${task.title}\nElapsed editing span: ${spanMin == null ? 'unknown' : spanMin + ' minutes'}`;
  return callClaudeEstimate(system, userContent, apiKey, task.title);
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

// ---------------------------------------------------------------------------
// Email estimator. Input is a SENT email (the attorney did the work).
// ---------------------------------------------------------------------------
export function emailHeuristic(message) {
  const subject = String(message.subject || '').replace(/^\s*(re|fwd|fw):\s*/i, '').trim();
  const body = String(message.bodyText || message.snippet || '');
  const minutes = body.length > 1500 ? 18 : body.length > 400 ? 12 : 6;
  const narrative = subject
    ? `Correspondence regarding ${subject}.`
    : 'Reviewed and responded to client correspondence.';
  return { minutes, narrative, confidence: 0.3, reasoning: 'Estimated from email length.' };
}

export async function estimateEmail(message, apiKey) {
  const system = `You are a legal billing assistant. Given an email an attorney SENT, estimate the billable time the underlying legal work took and write the billing narrative.
1. Estimate billable minutes (integer) for the composing/advising/reviewing this email reflects. A brief acknowledgment may be ~6 minutes; substantive legal advice or drafting is more. Apply legal judgment.
2. Write a concise past-tense billing narrative describing the legal work (e.g., "Drafted correspondence to opposing counsel regarding discovery deadlines."). Do not invent facts beyond the email.
3. Give a confidence between 0 and 1.
Respond with ONLY a JSON object, no prose, no code fences:
{"minutes": <integer>, "narrative": "<string>", "confidence": <number>, "reasoning": "<one short sentence>"}`;

  const body = String(message.bodyText || message.snippet || '').slice(0, 6000);
  const userContent = `Subject: ${message.subject || '(none)'}\nTo: ${message.to || '(unknown)'}\n\nBody:\n${body}`;
  return callClaudeEstimate(system, userContent, apiKey, message.subject);
}

// Estimate an email with Claude, falling back to the heuristic on any failure.
export async function estimateEmailTask(message, apiKey) {
  if (!apiKey) return emailHeuristic(message);
  try {
    return await estimateEmail(message, apiKey);
  } catch (_) {
    return emailHeuristic(message);
  }
}

// ---------------------------------------------------------------------------
// Calendar event estimator. Unlike email/tasks, a calendar event has a KNOWN
// duration (end - start), which is the strongest billable-time signal we get.
// The heuristic bills the full duration; Claude may trim it (e.g. a 60-min
// block where only part was substantive) and always writes the narrative.
// ---------------------------------------------------------------------------
function eventTitle(event) {
  const who = (event.attendees || []).slice(0, 3).join(', ');
  return event.summary
    ? (who ? `${event.summary} with ${who}` : event.summary)
    : (who ? `Meeting with ${who}` : 'Meeting');
}

export function calendarHeuristic(event) {
  const minutes = Math.max(1, Math.round(Number(event.durationMin) || 0));
  const base = event.summary ? event.summary.trim() : 'Conference';
  const who = (event.attendees || []).slice(0, 3).join(', ');
  const narrative = who
    ? `Attended ${base.toLowerCase().startsWith('meeting') ? base.toLowerCase() : base} with ${who}.`
    : `Attended ${base}.`;
  return { minutes, narrative, confidence: 0.5, reasoning: 'Billed the scheduled meeting duration.' };
}

export async function estimateCalendarEvent(event, apiKey) {
  const system = `You are a legal billing assistant. Given a calendar event an attorney attended, estimate the billable time and write the billing narrative.
1. The scheduled duration is given. Default to billing the full scheduled duration in minutes (integer). Only reduce it if the title clearly implies part was non-billable (e.g., a block that includes a break). Never increase beyond the scheduled duration.
2. Write a concise past-tense billing narrative describing the legal work (e.g., "Attended deposition of opposing witness." or "Telephone conference with client regarding settlement strategy."). Do not invent facts beyond the event details.
3. Give a confidence between 0 and 1.
Respond with ONLY a JSON object, no prose, no code fences:
{"minutes": <integer>, "narrative": "<string>", "confidence": <number>, "reasoning": "<one short sentence>"}`;

  const lines = [
    `Title: ${event.summary || '(no title)'}`,
    `Scheduled duration: ${event.durationMin} minutes`,
  ];
  if (event.attendees && event.attendees.length) lines.push(`Attendees: ${event.attendees.join(', ')}`);
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.description) lines.push(`Notes: ${String(event.description).slice(0, 2000)}`);

  const result = await callClaudeEstimate(system, lines.join('\n'), apiKey, eventTitle(event));
  // Safety clamp: never bill more than the scheduled duration.
  const cap = Math.max(1, Math.round(Number(event.durationMin) || 0));
  return { ...result, minutes: Math.min(result.minutes, cap) };
}

// Estimate a calendar event with Claude, falling back to the heuristic (full
// scheduled duration) on any failure so one bad event never breaks a sync.
export async function estimateCalendarTask(event, apiKey) {
  if (!apiKey) return calendarHeuristic(event);
  try {
    return await estimateCalendarEvent(event, apiKey);
  } catch (_) {
    return calendarHeuristic(event);
  }
}
