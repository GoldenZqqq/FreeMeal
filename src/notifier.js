export async function notifyBark({ bark, title, body, url = '' }) {
  if (!bark) {
    console.log(`[${new Date().toISOString()}] [Bark] [INFO] BARK is not configured, skip notification.`);
    return { skipped: true, reason: 'missing BARK' };
  }

  const request = buildBarkRequest(bark, title, body, url);
  const response = await fetch(request.url, request.options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Bark notification failed: HTTP ${response.status} ${text}`);
  }
  const payload = parseJson(text);
  if (payload && payload.code !== 200) {
    throw new Error(`Bark notification failed: ${payload.message || text}`);
  }
  return { skipped: false };
}

export function buildBarkRequest(value, title, body, targetUrl = '') {
  const raw = String(value).trim();
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    normalizeOfficialBarkUrl(url);
    return {
      url: url.toString(),
      options: jsonPostOptions(title, body, targetUrl)
    };
  }
  return {
    url: `https://api.day.app/${encodeURIComponent(raw)}`,
    options: jsonPostOptions(title, body, targetUrl)
  };
}

function normalizeOfficialBarkUrl(url) {
  if (url.hostname !== 'api.day.app') {
    return;
  }
  const deviceKey = url.pathname.split('/').filter(Boolean)[0];
  url.pathname = deviceKey ? `/${deviceKey}` : '/';
  url.search = '';
  url.hash = '';
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function jsonPostOptions(title, body, url = '') {
  const payload = { title, body };
  if (url) {
    payload.url = url;
  }
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  };
}
