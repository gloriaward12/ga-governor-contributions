/* Predecessor watch: every 2026 executive order and announcement of the outgoing administration, scored for how far it reaches into the new term. */
let W = { phase: 'final90', sev: '', cat: '', q: '', sort: 'date', dir: -1 };
function render() {
  const d = DATA, all = d.watch.watch;
  const hash = new URLSearchParams(location.hash.slice(1)); const focus = hash.get('eo');
  if (focus) { W.phase = 'all'; W.q = focus; }
  let rows = all.filter(x => W.phase === 'all' || (W.phase === 'final90' ? x.phase !== 'earlier' : x.phase === 'post-election'));
  if (W.sev) rows = rows.filter(x => x.severity === W.sev); if (W.cat) rows = rows.filter(x => x.cat === W.cat);
  if (W.q) { const t = W.q.toLowerCase().split(/\s+/); rows = rows.filter(x => t.every(k => (x.id + ' ' + x.title + ' ' + x.cat).toLowerCase().includes(k))); }
  const sevN = { high: 3, med: 2, low: 1 };
  rows.sort((a, b) => W.sort === 'sev' ? (sevN[b.severity] - sevN[a.severity]) * -W.dir || b.date.localeCompare(a.date) : W.sort === 'cat' ? a.cat.localeCompare(b.cat) * -W.dir : a.date.localeCompare(b.date) * W.dir || a.id.localeCompare(b.id) * W.dir);
  const cats = [...new Set(all.map(x => x.cat))].sort();
  const f90 = all.filter(x => x.phase !== 'earlier'), high = f90.filter(x => x.severity === 'high');
  const press = d.watch.press;
  const th = (k, l, cls = '') => `<th class="sort ${cls} ${W.sort === k ? 'on' : ''}" data-k="${k}">${l}${W.sort === k ? (W.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  $('#page').innerHTML = `
  <div class="ph"><div><h1>Predecessor watch</h1><div class="sub">Every executive order Gov. Kemp has signed in 2026 and every announcement since September, scored for how far it reaches into the new term. Source: gov.georgia.gov, read nightly.</div></div>
    <div class="act"><button class="btn" id="csv">Download CSV</button><button class="btn" onclick="window.print()">Print</button></div></div>
  <div class="kpis">
    <div class="kpi"><div class="l">Orders in 2026</div><div class="v">${fmtN(all.length)}</div><div class="d">Jan 1 – Nov 6</div></div>
    <div class="kpi amber"><div class="l">Final 90 days + post-election</div><div class="v">${fmtN(f90.length)}</div><div class="d">Aug 5 onward</div></div>
    <div class="kpi red"><div class="l">High priority</div><div class="v">${high.length}</div><div class="d">Judicial, PSC, fuel-tax emergency</div></div>
    <div class="kpi"><div class="l">Since Nov 3</div><div class="v">${all.filter(x => x.phase === 'post-election').length}</div><div class="d">7 water-council seats, 1 flood emergency</div></div>
    <div class="kpi blue"><div class="l">Judges & prosecutors, 2026</div><div class="v">${all.filter(x => x.cat === 'Judicial / prosecutorial').length}</div><div class="d">${f90.filter(x => x.cat === 'Judicial / prosecutorial').length} in the final stretch</div></div>
  </div>
  <div class="brief"><h2>What this means <span class="src">Chief of Staff reading</span></h2>
    <p>The volume is ordinary for a Georgia governor in his last year: most of the ${fmtN(f90.length)} final-stretch orders are regional water-planning council and licensing-board seats that carry little policy weight. Three things are not ordinary. <b>First,</b> ${all.filter(x => x.cat === 'Judicial / prosecutorial').length} judicial and prosecutorial appointments this year, ${f90.filter(x => x.cat === 'Judicial / prosecutorial').length} of them since August, including two Court of Appeals seats; these outlast the term and should be catalogued now for the Judicial Nominating Commission reset. <b>Second,</b> the September 3 appointment of Stan Wise to the District 5 Public Service Commission seat, whose term expires December 31: that seat is live the day the new governor takes office. <b>Third,</b> the motor-fuel tax suspension (EO 09.28.26.01, amended and extended through November 30) forgoes roughly $215 million a month; whether Kemp extends it into December is the single largest unresolved revenue question before the budget is filed. Watch also the October 20 reconstitution of the State-wide Water Management Plan and the May delegations to the Georgia Transportation Efficiency Authority: both are structural and reversible by order.</p></div>
  <div class="tabs"><button class="${W.phase === 'final90' ? 'on' : ''}" data-ph="final90">Final 90 days + after (${f90.length})</button><button class="${W.phase === 'post' ? 'on' : ''}" data-ph="post">Since the election (${all.filter(x => x.phase === 'post-election').length})</button><button class="${W.phase === 'all' ? 'on' : ''}" data-ph="all">All 2026 (${all.length})</button></div>
  <div class="bar"><input type="search" id="q" placeholder="Search title, order number, body" value="${esc(W.q)}"><select id="sev"><option value="">All priorities</option><option value="high" ${W.sev === 'high' ? 'selected' : ''}>High</option><option value="med" ${W.sev === 'med' ? 'selected' : ''}>Medium</option><option value="low" ${W.sev === 'low' ? 'selected' : ''}>Low</option></select><select id="cat"><option value="">All types</option>${cats.map(c => `<option ${W.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select><span class="small mute">${fmtN(rows.length)} orders</span></div>
  <div class="card"><div class="tw"><table><thead><tr>${th('date', 'Date')}<th>Order</th><th>Action</th>${th('cat', 'Type')}${th('sev', 'Priority')}<th>Why it matters</th><th></th></tr></thead><tbody>
    ${rows.map(x => `<tr id="eo-${x.id.replace(/\./g, '-')}" ${focus === x.id ? 'style="background:var(--amber-bg)"' : ''}><td class="mono small nowrap">${dLong(x.date)}</td><td class="mono small">${x.id}</td><td>${esc(x.title)}</td><td class="small">${esc(x.cat)}</td><td>${sevPill(x.severity)}</td><td class="small mute">${esc(x.why)}</td><td><a href="${x.url}" target="_blank" rel="noopener" class="small">PDF</a></td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="hd"><h2>Announcements, Sept – Nov 2026</h2><span class="src">gov.georgia.gov press releases</span></div>
      <ul class="list" style="padding:4px 16px">${press.filter(p => p.date >= '2026-09-01').map(p => `<li><span class="d">${dShort(p.date)}</span><div><div class="t"><a href="${p.href}" target="_blank" rel="noopener">${esc(p.title)}</a></div><div class="m">${esc(p.cat)}</div></div><span></span></li>`).join('')}</ul></div>
    <div class="card"><div class="hd"><h2>Open proceedings the new governor inherits</h2></div><div class="bd">
      <ul class="list">
        <li><span class="d">Nov 5</span><div><div class="t">State of emergency: severe flooding (EO 11.05.26.01)</div><div class="m">Active; GEMA/HS coordination announced with the transition.</div></div>${sevPill('med')}</li>
        <li><span class="d">Sep 28</span><div><div class="t">State of emergency: petroleum supply; fuel-tax suspension through Nov 30</div><div class="m">Third suspension of 2026. Extension decision rests with Kemp; cost ≈ $215M/month.</div></div>${sevPill('high')}</li>
        <li><span class="d">Sep 24</span><div><div class="t">Suspension of Newton County Commission chair; temporary replacement named Oct 23</div><div class="m">Indictment review commission appointed Sep 4.</div></div>${sevPill('med')}</li>
        <li><span class="d">Aug 17</span><div><div class="t">Dublin City Board of Education suspended; nominating committee created</div><div class="m">Temporary members appointed Sep 2.</div></div>${sevPill('med')}</li>
        <li><span class="d">Aug 10</span><div><div class="t">Burke County sheriff suspended; review commission (Jul 31)</div><div class="m">Pending.</div></div>${sevPill('med')}</li>
        <li><span class="d">Sep 3</span><div><div class="t">PSC District 5: Stan Wise appointed to term expiring Dec 31, 2026</div><div class="m">Seat status on Jan 11 depends on the November election certification for District 5.</div></div>${sevPill('high')}</li>
      </ul></div></div>
  </div>`;
  $$('.tabs button').forEach(b => b.addEventListener('click', () => { W.phase = b.dataset.ph; W.q = ''; history.replaceState(null, '', location.pathname); render(); }));
  $$('th.sort').forEach(h => h.addEventListener('click', () => { const k = h.dataset.k; if (W.sort === k) W.dir *= -1; else { W.sort = k; W.dir = k === 'date' ? -1 : 1; } render(); }));
  const q = $('#q'); let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { W.q = q.value.trim(); const pos = q.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }, 200); });
  $('#sev').addEventListener('change', e => { W.sev = e.target.value; render(); }); $('#cat').addEventListener('change', e => { W.cat = e.target.value; render(); });
  $('#csv').addEventListener('click', () => csv(rows.map(x => [x.date, x.id, x.title, x.cat, x.severity, x.why, x.url]), ['Date', 'Order', 'Action', 'Type', 'Priority', 'Why it matters', 'Source'], 'chapter_predecessor_watch.csv'));
  if (focus) { const el = document.getElementById('eo-' + focus.replace(/\./g, '-')); if (el) el.scrollIntoView({ block: 'center' }); }
}
