import { getSupabaseAdmin } from '../lib/supabase.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const query = process.env.TARGET_QUERY;
    const domain = process.env.TARGET_DOMAIN;
    const device = (process.env.GSC_DEVICE || 'ALL').toUpperCase();
    const country = (process.env.GSC_COUNTRY || 'ALL').toUpperCase();

    if (!query || !domain) {
      throw new Error('TARGET_QUERY/TARGET_DOMAIN belum diisi di Vercel Environment Variables.');
    }

    const supabase = getSupabaseAdmin();

    const [{ data: history, error: historyError }, { data: status, error: statusError }] = await Promise.all([
      supabase
        .from('rank_history')
        .select('data_hour,position,clicks,impressions,ctr,is_partial,synced_at')
        .eq('query', query)
        .eq('domain', domain)
        .eq('device', device)
        .eq('country', country)
        .order('data_hour', { ascending: false })
        .limit(72),
      supabase
        .from('rank_status')
        .select('*')
        .eq('query', query)
        .eq('domain', domain)
        .eq('device', device)
        .eq('country', country)
        .maybeSingle()
    ]);

    if (historyError) throw historyError;
    if (statusError) throw statusError;

    const ordered = (history || []).slice().reverse();
    const latest = ordered.at(-1) || null;
    const previous = ordered.length > 1 ? ordered.at(-2) : null;

    return json(res, 200, {
      ok: true,
      target: { query, domain, device, country },
      latest,
      previous,
      status: status || null,
      history: ordered
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || String(error) });
  }
}
