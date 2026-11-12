/* Operations: the command view. Every number here is computed from the data files. */
function render() {
  const d = DATA, o = d.ops, w = d.watch.watch, b = d.budget, tr = d.transition;
  const f90 = w.filter(x => x.phase !== 'earlier'), post = w.filter(x => x.phase === 'post-election');
  const high = f90.filter(x => x.severity === 'high');
  const byCat = {}; f90.forEach(x => byCat[x.cat] = (byCat[x.cat] || 0) + 1);
  const freshBoards = [...d.inventory.boards].sort((a, b2) => b2.fresh24 - a.fresh24).slice(0, 6);
  const next = b.calendar.filter(c => c.date >= AS_OF).slice(0, 5);
  const brief = `
    <p><b>Where things stand.</b> It is day ${o.transition_day} of the transition, ${o.days_to_inauguration} days to the January 11 inauguration and ${o.days_to_budget} days until the amended FY2027 and FY2028 budgets are due to the General Assembly. Georgia’s Promise has a COO (Jon Keen) and ten co-chairs; it has not yet named a chief of staff, an OPB director, policy leads or any agency head. The budget the Governor-elect must file is being drafted now, on the Kemp baseline, by career staff at OPB.</p>
    <p><b>What the outgoing administration is doing.</b> Gov. Kemp has signed ${fmtN(o.eo_total_2026)} executive orders in 2026, ${fmtN(o.eo_final90)} of them in the final 90 days before the election and ${o.eo_post_election} since. ${high.length} of the final-stretch orders carry long tails past January: ${high.filter(x => x.cat === 'Judicial / prosecutorial').length} judges and prosecutors, the District 5 Public Service Commission seat, and the motor-fuel tax suspension that runs through November 30 and forgoes roughly $215 million a month. The announced post-election actions are three judicial appointments (Nov 6) and the Stone Mountain Memorial Association CEO (Nov 9, effective Jan 1). Kemp has pledged cooperation and no lame-duck session is expected.</p>
    <p><b>The money.</b> FY2027 is appropriated at ${fmtB(b.fy27_state_funds)} in state funds; AFY2026 stands at ${fmtB(b.afy26_state_funds)} after ${fmtB(b.undesignated_surplus_afy26)} of undesignated surplus was carried in. The Revenue Shortfall Reserve closed FY2025 at ${fmtB(b.rsr_fy25)}. Collections are running +${b.ytd.chg}% through September ($${b.ytd.net}B), but the fuel-tax suspension and the ${fmtB(b.kemp_asks[0].amount)} recurring income-tax cut Kemp requested shape the floor the new administration inherits. The revenue estimate is the one number the Governor sets alone; the legislature cannot appropriate above it.</p>
    <p><b>Seats.</b> Chapter tracks ${fmtN(o.board_rows)} gubernatorial board and commission appointments across ${fmtN(o.boards_total)} bodies since 2019; ${fmtN(o.fresh_seats)} of those seats were filled or refilled in the last 24 months and will still be occupied on inauguration day.</p>`;
  $('#page').innerHTML = `
  <div class="ph"><div><h1>Operations</h1><div class="sub">Governor-elect Bottoms · Georgia’s Promise transition · public record through ${dLong(AS_OF)}</div></div>
    <div class="act"><button class="btn" onclick="window.print()">Print brief</button><a class="btn primary" href="budget.html">Open budget sprint</a></div></div>
  <div class="kpis">
    <div class="kpi red"><div class="l">Days to inauguration</div><div class="v">${o.days_to_inauguration}</div><div class="d">Monday, January 11, 2027 · General Assembly convenes</div></div>
    <div class="kpi amber"><div class="l">Days to budget filing</div><div class="v">${o.days_to_budget}</div><div class="d">AFY2027 + FY2028 due within five days of convening</div></div>
    <div class="kpi"><div class="l">Kemp orders, final 90 days + after</div><div class="v">${fmtN(o.eo_final90)}</div><div class="d">${high.length} high-priority · ${o.eo_post_election} since the election</div></div>
    <div class="kpi"><div class="l">Board seats filled in last 24 mo.</div><div class="v">${fmtN(o.fresh_seats)}</div><div class="d">across ${fmtN(o.boards_total)} boards, commissions and authorities</div></div>
    <div class="kpi blue"><div class="l">FY2027 state funds</div><div class="v">${fmtB(b.fy27_state_funds)}</div><div class="d">Revenue +${b.ytd.chg}% YTD · reserve ${fmtB(b.rsr_fy25)}</div></div>
    <div class="kpi green"><div class="l">Transition leadership named</div><div class="v">${1 + tr.cochairs.length}</div><div class="d">COO + ${tr.cochairs.length} co-chairs · ${tr.open.length} senior slots open</div></div>
  </div>
  <div class="brief"><h2>Briefing for the Chief of Staff <span class="src">Generated from the public record · ${dLong(AS_OF)}</span></h2>${brief}</div>
  <div class="grid g21">
    <div class="card"><div class="hd"><h2>Predecessor actions needing a decision</h2><a class="small" href="watch.html">All ${fmtN(f90.length)} →</a></div>
      <ul class="list" style="padding:4px 16px">${high.slice(0, 9).map(x => `<li><span class="d">${dShort(x.date)}</span><div><div class="t"><a href="watch.html#eo=${encodeURIComponent(x.id)}">${esc(x.title)}</a></div><div class="m">${esc(x.why)}</div></div>${sevPill(x.severity)}</li>`).join('')}</ul></div>
    <div class="grid" style="gap:16px">
      <div class="card"><div class="hd"><h2>Decision clock</h2><span class="src">Statute + announced dates</span></div><div class="bd"><ul class="timeline">${next.map((c, i) => `<li class="${i === 0 ? 'now' : ''}"><div class="d">${dLong(c.date)} · ${daysBetween(AS_OF, c.date)}d</div><div>${esc(c.what)}</div></li>`).join('')}</ul></div></div>
      <div class="card"><div class="hd"><h2>Final-90-day orders by type</h2></div><div class="bd bars">${Object.entries(byCat).sort((a, b2) => b2[1] - a[1]).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><div class="trk"><div class="fill ${k.startsWith('Judicial') || k === 'Emergency' ? 'red' : k === 'Appointment' || k === 'Reappointment' ? '' : 'mute'}" style="width:${v / f90.length * 100}%"></div></div><span class="num mono small">${v}</span></div>`).join('')}</div></div>
    </div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="hd"><h2>Since the election</h2><span class="src">gov.georgia.gov</span></div>
      <ul class="list" style="padding:4px 16px">${[...post.map(x => ({ date: x.date, t: 'EO ' + x.id + ' · ' + x.title, m: x.cat, h: 'watch.html#eo=' + encodeURIComponent(x.id) })), ...o.press_since_election.map(p => ({ date: p.date, t: p.title, m: p.cat + ' · press release', h: p.href, ext: 1 }))].sort((a, b2) => b2.date.localeCompare(a.date)).map(x => `<li><span class="d">${dShort(x.date)}</span><div><div class="t"><a href="${x.h}" ${x.ext ? 'target="_blank" rel="noopener"' : ''}>${esc(x.t)}</a></div><div class="m">${esc(x.m)}</div></div><span></span></li>`).join('')}</ul></div>
    <div class="card"><div class="hd"><h2>Boards with the most recently filled seats</h2><a class="small" href="inventory.html">Inventory →</a></div>
      <div class="tw"><table><thead><tr><th>Board</th><th class="num">Seats filled, 24 mo.</th><th class="num">Since 2019</th><th>Last action</th></tr></thead><tbody>${freshBoards.map(x => `<tr class="click" onclick="location.href='inventory.html#board=${encodeURIComponent(x.board)}'"><td>${esc(x.board)}</td><td class="num">${x.fresh24}</td><td class="num">${x.appointments}</td><td class="mono small">${dLong(x.last)}</td></tr>`).join('')}</tbody></table></div></div>
  </div>
  <div class="grid g3" style="margin-top:16px">
    <div class="card"><div class="hd"><h2>Georgia’s Promise</h2><a class="small" href="appointments.html#team">Team →</a></div><div class="bd"><dl class="kv"><dt>COO</dt><dd>${esc(tr.coo.name)}</dd><dt>Co-chairs</dt><dd>${tr.cochairs.length} named Nov 6</dd><dt>Honorary</dt><dd>${tr.honorary.length}</dd><dt>Still open</dt><dd>${tr.open.join(' · ')}</dd><dt>Outgoing</dt><dd>${esc(tr.kemp)}</dd></dl></div></div>
    <div class="card"><div class="hd"><h2>Stated priorities</h2><span class="src">Nov 6 press conference</span></div><div class="bd"><ol style="margin-left:18px;font-size:13px;line-height:1.7">${tr.priorities.map(p => `<li>${esc(p)}</li>`).join('')}</ol></div></div>
    <div class="card"><div class="hd"><h2>What Chapter watches automatically</h2></div><div class="bd note">Executive orders and press releases at gov.georgia.gov; DOR monthly revenue; board and commission appointment releases; the Commission’s campaign-finance filings (donor screens against state vendors, lobbyists and appointees run in Governor Pulse). Feeds refresh nightly; everything carries its source line.</div></div>
  </div>`;
}
