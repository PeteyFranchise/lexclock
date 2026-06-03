// Microsoft Graph wrapper for Outlook SENT mail — the Outlook equivalent of the
// Gmail half of the email pipeline. Lists recently sent messages and maps each
// into the SAME minimal shape estimate.js's estimateEmailTask consumes, so the
// estimator is shared across Gmail and Outlook.
//
// PRIVACY: message bodies are fetched, fed to the estimator, and dropped. Nothing
// here persists a body or an access token.
import { graphGet } from './microsoft.js';

function stripHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function recipients(list) {
  return (Array.isArray(list) ? list : [])
    .map((r) => r?.emailAddress?.name || r?.emailAddress?.address || '')
    .filter(Boolean)
    .join(', ');
}

// List SENT messages from the last couple of days. A sent message is evidence the
// attorney performed billable work (drafting / advising). We page a single $top
// batch ordered newest-first; the stored cursor de-dupes precisely on the sync.
export async function listSentMessages(accessToken) {
  const query =
    '/me/mailFolders/sentitems/messages?' +
    '$select=id,subject,toRecipients,from,sentDateTime,bodyPreview,body' +
    '&$top=25&$orderby=sentDateTime%20desc';
  const data = await graphGet(accessToken, query);
  return Array.isArray(data.value) ? data.value : [];
}

// Normalize a Graph message into the minimal shape the estimator consumes.
// bodyText is used to estimate and is NOT persisted by the sync.
export function mapMessage(msg) {
  const body = msg?.body || {};
  const bodyText = (body.contentType || '').toLowerCase() === 'html'
    ? stripHtml(body.content || '')
    : String(body.content || msg?.bodyPreview || '').trim();
  const sent = msg?.sentDateTime ? Date.parse(msg.sentDateTime) : null;
  return {
    externalId: msg?.id,
    subject: msg?.subject || '',
    to: recipients(msg?.toRecipients),
    from: msg?.from?.emailAddress?.address || msg?.from?.emailAddress?.name || '',
    date: msg?.sentDateTime || '',
    internalDate: Number.isFinite(sent) ? sent : null, // epoch ms
    snippet: msg?.bodyPreview || '',
    bodyText,
  };
}
