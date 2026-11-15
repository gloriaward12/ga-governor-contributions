// Finance working records on the project's private Blob store (connect one in Vercel → Storage). Gated by the finance session (middleware).
// Keys: actions, watch, segments, users. ETag concurrency; append-only audit under audit/finance.json with the x-gp-user name.
import { put, get, head } from '@vercel/blob';
const KEYS = ['actions', 'watch', 'segments', 'users'];
async function readJson(path) { try { const r = await get(path, { access: 'private', useCache: false }); const t = await new Response(r.stream).text(); return { value: JSON.parse(t || 'null'), etag: (r.blob && r.blob.etag) || null }; } catch (e) { return { value: null, etag: null }; } }
async function writeJson(path, v) { return put(path, JSON.stringify(v), { access: 'private', contentType: 'application/json', allowOverwrite: true, addRandomSuffix: false }); }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)) return res.status(503).json({ error: 'no store' });
  const q = req.query || {}; const who = String(req.headers['x-gp-user'] || 'unknown').slice(0, 60);
  if (req.method === 'GET') {
    if (q.k === 'audit') { const a = await readJson('audit/finance.json'); return res.status(200).json({ entries: (a.value || []).slice(-300).reverse() }); }
    if (q.all) { const out = {}; await Promise.all(KEYS.map(async k => { out[k] = await readJson('finance/' + k + '.json'); })); return res.status(200).json({ records: out }); }
    if (!KEYS.includes(q.k)) return res.status(400).json({ error: 'key' }); return res.status(200).json(await readJson('finance/' + q.k + '.json'));
  }
  if (req.method === 'PUT') {
    const k = q.k; if (!KEYS.includes(k)) return res.status(400).json({ error: 'key' });
    let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const path = 'finance/' + k + '.json'; const cur = await readJson(path);
    if (body.etag && cur.etag && body.etag !== cur.etag) return res.status(409).json({ error: 'changed elsewhere', current: cur });
    const r = await writeJson(path, body.value == null ? null : body.value); const h = await head(r.url).catch(() => null);
    try { const a = (await readJson('audit/finance.json')).value || []; a.push({ ts: new Date().toISOString(), who, key: k, size: JSON.stringify(body.value || '').length }); await writeJson('audit/finance.json', a.slice(-3000)); } catch (e) {}
    return res.status(200).json({ ok: true, etag: (h && h.etag) || null });
  }
  return res.status(405).json({ error: 'method' });
}
