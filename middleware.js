// Edge middleware: the Finance area and private APIs require a signed session cookie set by /api/login.
export const config = { matcher: ['/finance', '/finance/:path*', '/api/private/:path*'] };

const TEMP_PASSCODE = 'Pulse-2027';   // used only until FINANCE_PASSCODE is set in the project's environment variables

async function expectedToken(secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('governor-pulse-finance-v1'));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function middleware(req) {
  const url = new URL(req.url);
  if (url.pathname === '/finance/login' || url.pathname === '/finance/login.html') return;
  const secret = process.env.FINANCE_SECRET || process.env.FINANCE_PASSCODE || TEMP_PASSCODE;
  const cookie = (req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith('gp_fin='));
  const token = cookie ? cookie.slice(7) : '';
  if (token && token === await expectedToken(secret)) return;
  if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({ ok: false, error: 'sign in required' }), { status: 401, headers: { 'content-type': 'application/json' } });
  const to = new URL('/finance/login', url); to.searchParams.set('next', url.pathname + url.search);
  return Response.redirect(to.toString(), 302);
}
