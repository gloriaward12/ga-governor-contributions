// Nightly refresh: redeploys the latest production deployment so the build pulls fresh PeachFile data.
// Needs a VERCEL_TOKEN environment variable (Account settings → Tokens) with access to this project.
export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const token = process.env.VERCEL_TOKEN, projectId = process.env.VERCEL_PROJECT_ID || 'governor-pulse', teamId = process.env.VERCEL_TEAM_ID || '';
  if (!token) return res.status(200).json({ ok: false, error: 'VERCEL_TOKEN is not set; add it in Project Settings → Environment Variables to enable automatic refresh.' });
  const q = teamId ? `&teamId=${teamId}` : '';
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const list = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&target=production&state=READY&limit=1${q}`, { headers: h }).then(r => r.json());
  const last = list.deployments && list.deployments[0];
  if (!last) return res.status(500).json({ ok: false, error: 'no production deployment found', list });
  const dep = await fetch(`https://api.vercel.com/v13/deployments?forceNew=1${q}`, { method: 'POST', headers: h, body: JSON.stringify({ name: last.name, deploymentId: last.uid, target: 'production', meta: { source: 'nightly-refresh' } }) }).then(r => r.json());
  return res.status(dep.id ? 200 : 500).json({ ok: !!dep.id, redeployedFrom: last.uid, deployment: dep.id || dep });
}
