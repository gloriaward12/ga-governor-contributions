// Nightly refresh: creates a new production deployment from the GitHub repo's main branch, so the build pulls fresh PeachFile data.
// Needs a VERCEL_TOKEN environment variable (Account settings → Tokens, scoped to this project or team).
// Optional: VERCEL_TEAM_ID, VERCEL_PROJECT_ID (default governor-pulse), GIT_ORG / GIT_REPO / GIT_REF, CRON_SECRET.
export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const token = process.env.VERCEL_TOKEN, project = process.env.VERCEL_PROJECT_ID || 'governor-pulse', teamId = process.env.VERCEL_TEAM_ID || '';
  if (!token) return res.status(200).json({ ok: false, error: 'VERCEL_TOKEN is not set; add it in Project Settings → Environment Variables to enable automatic refresh.' });
  const q = teamId ? `?teamId=${teamId}` : '';
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const body = { name: project, project, target: 'production', meta: { source: 'nightly-refresh' },
    gitSource: { type: 'github', org: process.env.GIT_ORG || 'gloriaward12', repo: process.env.GIT_REPO || 'ga-governor-contributions', ref: process.env.GIT_REF || 'main' } };
  const r = await fetch(`https://api.vercel.com/v13/deployments${q}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const dep = await r.json().catch(() => ({}));
  if (dep.id) return res.status(200).json({ ok: true, deployment: dep.id, url: dep.url, commit: dep.meta && dep.meta.githubCommitSha });
  return res.status(500).json({ ok: false, status: r.status, error: (dep.error && dep.error.message) || 'deployment request failed', detail: dep.error || dep });
}
