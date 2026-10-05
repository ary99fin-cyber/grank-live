import { getSupabaseAdmin } from '../lib/supabase.js';
import { fetchHourlySearchConsoleData } from '../lib/google.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

function isAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.authorization === `Bearer ${expected}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  const targetQuery = process.env.TARGET_QUERY || '';
  const targetDomain = process.env.TARGET_DOMAIN || '';
  const device = (process.env.GSC_DEVICE || 'ALL').toUpperCase();
  const country = (process.env.GSC_COUNTRY || 'ALL').toUpperCase();
  const checkedAt = new Date().toISOString();

  try {
    if (!targetDomain) throw new Error('TARGET_DOMAIN belum diisi.');

    const result = await fetchHourlySearchConsoleData();
    const firstIncomplete = result.metadata?.first_incomplete_hour || null;

    const rows = result.rows
      .filter((row) => row?.keys?.[0] && Number.isFinite(Number(row.position)))
      .map((row) => ({
        query: result.query,
        domain: targetDomain,
        device: result.device,
        country: result.country,
        data_hour: new Date(row.keys[0]).toISOString(),
        position: Number(row.position),
        clicks: Math.round(Number(row.clicks || 0)),
        impressions: Math.round(Number(row.impressions || 0)),
        ctr: Number(row.ctr || 0),
        is_partial: firstIncomplete ? new Date(row.keys[0]) >= new Date(firstIncomplete) : false,
        synced_at: checkedAt
      }))
      .sort((a, b) => new Date(a.data_hour) - new Date(b.data_hour));

    if (rows.length > 0) {
      const { error } = await supabase
        .from('rank_history')
        .upsert(rows, { onConflict: 'query,domain,device,country,data_hour' });
      if (error) throw error;
    }

    const latest = rows.at(-1) || null;
    const statusPayload = {
      query: result.query,
      domain: targetDomain,
      device: result.device,
      country: result.country,
      status: latest ? 'ok' : 'no_data',
      last_checked_at: checkedAt,
      last_data_hour: latest?.data_hour || null,
      last_position: latest?.position ?? null,
      message: latest
        ? `Berhasil menyimpan ${rows.length} baris data Search Console.`
        : 'Belum ada data impression untuk kombinasi keyword/device/negara ini pada rentang terbaru.'
    };

    const { error: statusError } = await supabase
      .from('rank_status')
      .upsert(statusPayload, { onConflict: 'query,domain,device,country' });
    if (statusError) throw statusError;

    return json(res, 200, {
      ok: true,
      inserted_or_updated: rows.length,
      latest,
      metadata: result.metadata,
      note: 'Position adalah average position dari Search Console, bukan snapshot SERP real-time.'
    });
  } catch (error) {
    const message = error?.message || String(error);

    if (targetQuery && targetDomain) {
      await supabase.from('rank_status').upsert({
        query: targetQuery,
        domain: targetDomain,
        device,
        country,
        status: 'error',
        last_checked_at: checkedAt,
        message
      }, { onConflict: 'query,domain,device,country' });
    }

    return json(res, 500, { ok: false, error: message });
  }
}
