/* Inventory: what the new governor inherits — agency leadership and 395 boards, commissions and authorities with 2,320 Kemp-era appointments. */
let I = { q: '', sort: 'fresh24', dir: -1, tab: 'boards' };
function render() {
  const d = DATA, boards = d.inventory.boards, L = d.inventory.leaders;
  const hash = new URLSearchParams(location.hash.slice(1)); const focus = hash.get('board'); if (location.hash === '#leaders') I.tab = 'leaders';
  let rows = boards; if (I.q) { const t = I.q.toLowerCase().split(/\s+/); rows = rows.filter(b => t.every(k => (b.board + ' ' + b.recent.map(n => n.name).join(' ')).toLowerCase().includes(k))); }
  rows = [...rows].sort((a, b) => typeof a[I.sort] === 'number' ? (a[I.sort] - b[I.sort]) * I.dir : String(a[I.sort]).localeCompare(String(b[I.sort])) * I.dir);
  const tot = boards.reduce((s, b) => s + b.appointments, 0), fresh = boards.reduce((s, b) => s + b.fresh24, 0), re = boards.reduce((s, b) => s + b.reappointments, 0);
  const th = (k, l, cls = '') => `<th class="sort ${cls} ${I.sort === k ? 'on' : ''}" data-k="${k}">${l}${I.sort === k ? (I.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  const pri = { 'Day 1': 'red', 'First 30 days': 'amber', 'First 90 days': 'blue', 'Later': 'low', 'Watch': 'amber' };
  const sel = focus ? boards.find(b => b.board === focus) : null;
  $('#page').innerHTML = `
  <div class="ph"><div><h1>Inventory</h1><div class="sub">What the administration inherits: who leads each agency today, and ${fmtN(tot)} seats on ${fmtN(boards.length)} boards, commissions and authorities filled by the outgoing governor since 2019.</div></div>
    <div class="act"><button class="btn" id="csv">Download boards CSV</button><button class="btn" onclick="window.print()">Print</button></div></div>
  <div class="kpis">
    <div class="kpi"><div class="l">Boards, commissions, authorities</div><div class="v">${fmtN(boards.length)}</div><div class="d">with at least one gubernatorial appointment since 2019</div></div>
    <div class="kpi"><div class="l">Appointments recorded</div><div class="v">${fmtN(tot)}</div><div class="d">${fmtN(re)} reappointments (${Math.round(re / tot * 100)}%)</div></div>
    <div class="kpi amber"><div class="l">Seats filled in the last 24 months</div><div class="v">${fmtN(fresh)}</div><div class="d">occupied on Jan 11 by a Kemp appointee</div></div>
    <div class="kpi red"><div class="l">Agency leaders to decide on Day 1</div><div class="v">${L.filter(x => x.priority === 'Day 1').length}</div><div class="d">OPB, Revenue, GEMA/HS</div></div>
  </div>
  <div class="brief"><h2>How to read this <span class="src">Method</span></h2>
    <p>Georgia governors fill well over a thousand seats a term, but almost none of them turn over at inauguration: statutory terms run four to seven years and reappointments are routine (${Math.round(re / tot * 100)}% of the record). A seat filled in the last 24 months will still be held by a Kemp appointee on January 11; the realistic levers are the seats whose terms expire in 2027–28, the bodies where the governor also names the chair, and the handful of agency heads the governor appoints directly. Chapter ranks boards by recently filled seats so the Personnel Director can see where the inherited bench is deepest. Term-expiry dates are the next data layer to add; they live in each enabling statute and in the Secretary of State’s board records, not in the press releases this inventory is built from.</p></div>
  <div class="tabs"><button class="${I.tab === 'boards' ? 'on' : ''}" data-t="boards">Boards & commissions</button><button class="${I.tab === 'leaders' ? 'on' : ''}" data-t="leaders">Agency leadership</button></div>
  <div class="view ${I.tab === 'boards' ? 'on' : ''}">
    ${sel ? `<div class="card" style="margin-bottom:16px"><div class="hd"><h2>${esc(sel.board)}</h2><a class="small" href="inventory.html" onclick="location.hash='';">Close</a></div><div class="bd">
      <dl class="kv"><dt>Appointments since 2019</dt><dd>${sel.appointments} (${sel.reappointments} reappointments)</dd><dt>Distinct people</dt><dd>${sel.distinct}</dd><dt>Filled in last 24 months</dt><dd>${sel.fresh24}</dd><dt>First / last action</dt><dd>${dLong(sel.first)} / ${dLong(sel.last)}</dd></dl>
      <h3 style="margin:14px 0 6px">Most recent appointees</h3><table><thead><tr><th>Name</th><th>Date</th><th>Action</th><th>Background (from the release)</th></tr></thead><tbody>${sel.recent.map(n => `<tr><td>${esc(n.name)}</td><td class="mono small nowrap">${dLong(n.date)}</td><td>${n.re ? '<span class="pill">Reappointed</span>' : '<span class="pill blue">Appointed</span>'}</td><td class="small mute">${esc(n.bio)}</td></tr>`).join('')}</tbody></table>
      <div class="note" style="margin-top:10px">Vetting: run any name through Governor Pulse → Screens to see campaign giving, state vendor payments, lobbyist registration and other board seats.</div></div></div>` : ''}
    <div class="bar"><input type="search" id="q" placeholder="Search board or appointee" value="${esc(I.q)}"><span class="small mute">${fmtN(rows.length)} bodies</span></div>
    <div class="card"><div class="tw"><table><thead><tr>${th('board', 'Board / commission / authority')}${th('fresh24', 'Filled, last 24 mo.', 'num')}${th('appointments', 'Since 2019', 'num')}${th('reappointments', 'Reappointed', 'num')}${th('distinct', 'People', 'num')}${th('last', 'Last action')}</tr></thead><tbody>
      ${rows.map(b => `<tr class="click" onclick="location.hash='board=${encodeURIComponent(b.board)}';render();window.scrollTo(0,0)"><td>${esc(b.board)}</td><td class="num"><b>${b.fresh24}</b></td><td class="num">${b.appointments}</td><td class="num">${b.reappointments}</td><td class="num">${b.distinct}</td><td class="mono small nowrap">${dLong(b.last)}</td></tr>`).join('')}
    </tbody></table></div></div>
  </div>
  <div class="view ${I.tab === 'leaders' ? 'on' : ''}">
    <div class="banner blue">Holders are taken from the governor’s own releases and the FY2027 budget document; each row carries its basis. Confirm against the agency before acting. Seats the governor fills directly are the first calls; board-appointed heads turn over through the boards.</div>
    <div class="card"><div class="tw"><table><thead><tr><th>Agency</th><th>Title</th><th>Current holder</th><th>Appointing authority</th><th>Priority</th><th>Basis</th><th>Note</th></tr></thead><tbody>
      ${L.map(l => `<tr><td><b>${esc(l.agency)}</b></td><td>${esc(l.title)}</td><td>${esc(l.holder)}</td><td class="small">${esc(l.appointer)}</td><td><span class="pill ${pri[l.priority] || ''}">${l.priority}</span></td><td class="small mute">${esc(l.basis)} · ${l.confidence} confidence</td><td class="small mute">${esc(l.note)}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="note" style="margin-top:12px">Next layer: the full roster of agency heads (about 60 executive-branch agencies and authorities) with appointing authority and term, from each agency’s enabling statute. Chapter’s intake accepts the list in any format and files it here.</div>
  </div>`;
  $$('.tabs button').forEach(b => b.addEventListener('click', () => { I.tab = b.dataset.t; history.replaceState(null, '', I.tab === 'leaders' ? '#leaders' : location.pathname); render(); }));
  $$('th.sort').forEach(h => h.addEventListener('click', () => { const k = h.dataset.k; if (I.sort === k) I.dir *= -1; else { I.sort = k; I.dir = k === 'board' ? 1 : -1; } render(); }));
  const q = $('#q'); if (q) { let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { I.q = q.value.trim(); const pos = q.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }, 200); }); }
  $('#csv').addEventListener('click', () => csv(rows.map(b => [b.board, b.fresh24, b.appointments, b.reappointments, b.distinct, b.first, b.last]), ['Board', 'Filled last 24 months', 'Appointments since 2019', 'Reappointments', 'Distinct people', 'First action', 'Last action'], 'chapter_inventory_boards.csv'));
}
