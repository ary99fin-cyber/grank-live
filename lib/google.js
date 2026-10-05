import { GoogleAuth } from 'google-auth-library';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} belum diisi.`);
  return value;
}

function dateInPacific(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function getAccessToken() {
  const privateKey = required('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const auth = new GoogleAuth({
    credentials: {
      client_email: required('GOOGLE_CLIENT_EMAIL'),
      private_key: privateKey
    },
    scopes: [SCOPE]
  });

  const client = await auth.getClient();
  const result = await client.getAccessToken();
  const token = typeof result === 'string' ? result : result?.token;
  if (!token) throw new Error('Gagal memperoleh access token Google.');
  return token;
}

export async function fetchHourlySearchConsoleData() {
  const siteUrl = required('GSC_SITE_URL');
  const query = required('TARGET_QUERY');
  const device = (process.env.GSC_DEVICE || '').trim().toUpperCase();
  const country = (process.env.GSC_COUNTRY || '').trim().toUpperCase();

  const now = new Date();
  const start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const filters = [
    {
      dimension: 'query',
      operator: 'equals',
      expression: query
    }
  ];

  if (device) {
    filters.push({ dimension: 'device', operator: 'equals', expression: device });
  }
  if (country) {
    filters.push({ dimension: 'country', operator: 'equals', expression: country });
  }

  const body = {
    startDate: dateInPacific(start),
    endDate: dateInPacific(now),
    dimensions: ['hour'],
    type: 'web',
    dataState: 'hourly_all',
    aggregationType: 'byProperty',
    rowLimit: 1000,
    dimensionFilterGroups: [
      {
        groupType: 'and',
        filters
      }
    ]
  };

  const token = await getAccessToken();
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error?.message || `Google API error ${response.status}`;
    throw new Error(message);
  }

  return {
    rows: Array.isArray(json.rows) ? json.rows : [],
    metadata: json.metadata || {},
    query,
    siteUrl,
    device: device || 'ALL',
    country: country || 'ALL'
  };
}
