// Nightly refresh: triggers a new production build so it pulls fresh PeachFile data.
// Preferred: DEPLOY_HOOK_URL (Project Settings → Git → Deploy Hooks; needs the project connected to the GitHub repo). No token required.
// Fallback: VERCEL_TOKEN (Account settings → Tokens) creating a deployment from the repo via the API; optional VERCEL_TEAM_ID, VERCEL_PROJECT_ID, GIT_ORG / GIT_REPO / GIT_REF.
// Optional CRON_SECRET locks this endpoint to Vercel's scheduler.
export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const hook = process.env.DEPLOY_HOOK_URL;
  if (hook) {
    const r = await fetch(hook, { method: 'POST' }); const j = await r.json().catch(() => ({}));
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok, via: 'deploy-hook', status: r.status, job: j.job || j });
  }
  const token = process.env.VERCEL_TOKEN, project = process.env.VERCEL_PROJECT_ID || 'governor-pulse', teamId = process.env.VERCEL_TEAM_ID || '';
  if (!token) return res.status(200).json({ ok: false, error: 'Neither DEPLOY_HOOK_URL nor VERCEL_TOKEN is set; add one in Project Settings → Environment Variables to enable automatic refresh.' });
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const body = { name: project, project, target: 'production', meta: { source: 'nightly-refresh' },
    gitSource: { type: 'github', org: process.env.GIT_ORG || 'gloriaward12', repo: process.env.GIT_REPO || 'ga-governor-contributions', ref: process.env.GIT_REF || 'main' } };
  const attempts = teamId ? [`?teamId=${teamId}`, ''] : [''];
  const tried = [];
  for (const q of attempts) {
    const r = await fetch(`https://api.vercel.com/v13/deployments${q}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const dep = await r.json().catch(() => ({}));
    if (dep.id) return res.status(200).json({ ok: true, via: 'token', deployment: dep.id, url: dep.url, commit: dep.meta && dep.meta.githubCommitSha });
    tried.push({ query: q || '(no team)', status: r.status, error: dep.error || dep });
  }
  return res.status(500).json({ ok: false, via: 'token', error: 'deployment request failed; a Deploy Hook (DEPLOY_HOOK_URL) is the simplest fix', tried });
}
