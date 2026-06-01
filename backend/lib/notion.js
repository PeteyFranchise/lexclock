// Server-side Notion wrapper. This is the SAME mapping logic the client
// prototype uses (extractTitle / extractProp / mapPage), lifted to the server
// where there is no CORS wall. Uses raw fetch to avoid an extra dependency.

const NOTION_VERSION = '2022-06-28';

// Query a database for pages edited on/after `since` (default: start of today
// in the server's timezone). Returns the raw Notion page objects.
export async function queryDatabase(token, databaseId, { since } = {}) {
  const start = since || startOfTodayIso();
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify({
      page_size: 50,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: start } },
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.message || '';
    } catch (_) {}
    const err = new Error(
      res.status === 401
        ? 'Notion rejected the token.'
        : res.status === 404
          ? 'Notion database not found or not shared with the integration.'
          : `Notion API error (${res.status})${detail ? `: ${detail}` : ''}`
    );
    err.status = res.status === 401 ? 401 : res.status === 404 ? 404 : 502;
    throw err;
  }

  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function extractTitle(page) {
  const props = page?.properties || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop?.type === 'title' && Array.isArray(prop.title)) {
      return prop.title.map((t) => t.plain_text || '').join('').trim();
    }
  }
  return '';
}

export function extractProp(page, propName) {
  if (!propName) return '';
  const prop = page?.properties?.[propName];
  if (!prop) return '';
  switch (prop.type) {
    case 'select': return prop.select?.name || '';
    case 'multi_select': return (prop.multi_select || []).map((o) => o.name).join(', ');
    case 'rich_text': return (prop.rich_text || []).map((t) => t.plain_text || '').join('').trim();
    case 'title': return (prop.title || []).map((t) => t.plain_text || '').join('').trim();
    case 'people': return (prop.people || []).map((p) => p.name || '').join(', ');
    default: return '';
  }
}

// Normalize a Notion page into the minimal task shape the estimator consumes.
// Data minimization: we keep the title + timestamps + a matter hint, not the
// full page body.
export function mapPage(page, { matterProperty = '' } = {}) {
  return {
    externalId: page.id,
    title: extractTitle(page),
    matterHint: extractProp(page, matterProperty),
    createdTime: page.created_time || null,
    lastEditedTime: page.last_edited_time || null,
  };
}
