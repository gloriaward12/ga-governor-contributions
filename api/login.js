// Finance sign-in: checks the passcode and sets the signed session cookie the middleware expects.
import { createHmac, timingSafeEqual } from 'node:crypto';

const TEMP_PASSCODE = 'Pulse-2027';   // used only until FINANCE_PASSCODE is set in the project's environment variables

export default async function handler(req, res) {
  const passcode = process.env.FINANCE_PASSCODE || TEMP_PASSCODE;
  const secret = process.env.FINANCE_SECRET || passcode;
  const token = createHmac('sha256', secret).update('governor-pulse-finance-v1').digest('hex');
  if (req.method === 'GET' && req.query && req.query.logout) {
    res.setHeader('Set-Cookie', 'gp_fin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
    res.setHeader('Location', '/finance/login'); return res.status(302).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST a passcode' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const given = String((body && body.passcode) || '').trim();
  const a = Buffer.from(given), b = Buffer.from(passcode);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) { await new Promise(r => setTimeout(r, 600)); return res.status(401).json({ ok: false, error: 'That passcode is not right.' }); }
  res.setHeader('Set-Cookie', `gp_fin=${token}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Lax`);
  return res.status(200).json({ ok: true, temporary: !process.env.FINANCE_PASSCODE });
}
