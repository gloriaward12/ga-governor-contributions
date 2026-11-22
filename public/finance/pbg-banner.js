// Project Battleground Georgia banner: the leadership committee's books, big, at the top of the finance pages.
// Reads /finance/pbg.json (a small summary written by scripts/build_ngp.py); never donor rows.
(function () {
  const el = document.getElementById('pbgBanner'); if (!el) return;
  const EPOCH = Date.UTC(2025, 0, 1);
  const dayStr = d => { const t = new Date(EPOCH + d * 86400000); return `${String(t.getUTCMonth() + 1).padStart(2, '0')}/${String(t.getUTCDate()).padStart(2, '0')}/${t.getUTCFullYear()}`; };
  const fmt$ = v => '$' + Math.round(v).toLocaleString();
  const fmtM = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : fmt$(v);
  const fmtN = v => Math.round(v).toLocaleString();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = `
  .pbgb{background:#1F2A3A !important;color:#fff;border-bottom:3px solid #D4A64A}
  .pbgb .in{max-width:1400px;margin:0 auto;padding:18px 22px 16px;display:grid;grid-template-columns:minmax(260px,1.4fr) repeat(4,minmax(140px,1fr));gap:18px;align-items:end}
  .pbgb .lead .k{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#AEB7C4}
  .pbgb .lead .v{font-size:44px;font-weight:700;letter-spacing:-.03em;line-height:1;margin:4px 0 2px;color:#fff !important}
  .pbgb .lead .d{font-size:13px;color:#AEB7C4}
  .pbgb .t .k{font-size:12px;color:#AEB7C4}
  .pbgb .t .v{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:2px 0;color:#fff}
  .pbgb .t .d{font-size:12px;color:#AEB7C4}
  .pbgb .t.hot .v{color:#D4A64A}
  .pbgb .t.hot{border-left:2px solid #D4A64A;padding-left:12px}
  .pbgb a{color:#fff;text-decoration:underline;text-decoration-color:#D4A64A;text-underline-offset:3px}
  .pbgb .foot{grid-column:1/-1;font-size:12px;color:#AEB7C4;display:flex;gap:16px;flex-wrap:wrap;margin-top:2px}
  @media (max-width:900px){.pbgb .in{grid-template-columns:1fr 1fr}.pbgb .lead{grid-column:1/-1}.pbgb .lead .v{font-size:36px}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  fetch('/finance/pbg.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(P => {
    if (!P) { el.remove(); return; }
    const mk = Object.keys(P.months).sort(); const cur = P.months[mk[mk.length - 1]] || { amt: 0, n: 0, donors: 0 }; const prev = P.months[mk[mk.length - 2]] || { amt: 0 };
    const curLabel = new Date(mk[mk.length - 1] + '-02').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
    const big = P.tiers.find(t => /50,000/.test(t.label)) || P.tiers[P.tiers.length - 1];
    const F = P.filed || {};
    const onRaised = location.pathname.startsWith('/finance/raised');
    el.innerHTML = `<div class="pbgb"><div class="in">
      <div class="lead"><div class="k">Project Battleground Georgia · the committee's books</div><div class="v">${fmtM(P.total)}</div><div class="d">net of refunds, ${fmtN(P.rows)} gifts from ${fmtN(P.donors)} donors, NGP through <b style="color:#fff">${dayStr(P.asof)}</b></div></div>
      <div class="t hot"><div class="k">Inauguration pages</div><div class="v">${P.inaug.n ? fmt$(P.inaug.amt) : '—'}</div><div class="d">${P.inaug.n ? `${fmtN(P.inaug.n)} gift${P.inaug.n === 1 ? '' : 's'} · ${P.inaug.codes.map(esc).join(', ')}` : 'no gifts coded to an inauguration page yet'}</div></div>
      <div class="t"><div class="k">${esc(curLabel)} so far</div><div class="v">${fmt$(cur.amt)}</div><div class="d">${fmtN(cur.n)} gifts · ${fmtN(cur.donors)} donors · ${fmtM(prev.amt)} last month</div></div>
      <div class="t"><div class="k">$50,000 and up</div><div class="v">${fmtN(big.donors)}</div><div class="d">donors · ${fmtM(big.amt)} · ${Math.round(big.amt / P.total * 100)}% of the total</div></div>
      <div class="t"><div class="k">Filed with the Commission</div><div class="v">${F.net ? fmtM(F.net) : '—'}</div><div class="d">${F.net ? `net, through ${dayStr(F.lastDay)} · ${F.spent ? fmtM(F.spent) + ' spent' : ''}` : 'no filing loaded'}</div></div>
      <div class="foot"><span>Books and filing differ by timing, transfers and in-kind; the filing is what the public page shows.</span>${onRaised ? '<span><a href="#view=pbg" id="pbgGo">Open the Battleground tab</a></span>' : '<span><a href="/finance/raised#view=pbg">Battleground donors and tiers</a></span>'}<span>Updated ${esc(P.generated)}</span></div>
    </div></div>`;
    const go = document.getElementById('pbgGo'); if (go) go.addEventListener('click', e => { e.preventDefault(); const b = document.querySelector('[data-v="pbg"]'); if (b) { b.click(); window.scrollTo({ top: b.offsetTop - 60, behavior: 'smooth' }); } });
  }).catch(() => el.remove());
})();
