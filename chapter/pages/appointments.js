/* Appointments: the transition team as announced, the senior seats still open, and the working pipeline. */
const SEATS = [
  { seat: 'Chief of Staff to the Governor', auth: 'Governor', when: 'Before Dec 1', status: 'Open', note: 'Runs the building; approves the daily brief; owns Chapter’s sensitive registers.' },
  { seat: 'Executive Director, Office of Planning and Budget', auth: 'Governor (O.C.G.A. § 45-12-71)', when: 'Before Dec 15', status: 'Open', note: 'The January 16 budget is being drafted now on the Kemp baseline. Incumbent: Richard Dunn.' },
  { seat: 'Executive Counsel', auth: 'Governor', when: 'Before Dec 15', status: 'Open', note: 'Day-1 executive orders, appointments paperwork, ethics screening.' },
  { seat: 'Director of Legislative Affairs', auth: 'Governor', when: 'Before Jan 11', status: 'Open', note: 'Session convenes the day of inauguration; a Republican-controlled General Assembly.' },
  { seat: 'Communications Director / Press Secretary', auth: 'Governor', when: 'Before Jan 11', status: 'Open', note: '' },
  { seat: 'State Revenue Commissioner', auth: 'Governor (O.C.G.A. § 48-2-1)', when: 'First 30 days', status: 'Decide', note: 'Incumbent David Burge; revenue estimate inputs and the fuel-tax suspension run through DOR.' },
  { seat: 'Director, GEMA/Homeland Security', auth: 'Governor', when: 'First 30 days', status: 'Decide', note: 'Incumbent Josh Lamb; active flood emergency and Helene recovery funds.' },
  { seat: 'Commissioner, Economic Development', auth: 'Board of Economic Development (governor appoints board)', when: 'First 90 days', status: 'Decide', note: 'Audi ($4B), Pirelli ($1.2B), Siemens and other 2026 announcements in flight.' },
  { seat: 'Commissioner, Community Health', auth: 'Board of Community Health on governor’s nomination', when: 'First 90 days', status: 'Decide', note: 'Medicaid expansion is a stated priority; Pathways waiver status.' },
  { seat: 'Commissioner, Human Services', auth: 'Board of Human Services on governor’s nomination', when: 'First 90 days', status: 'Decide', note: 'SNAP payment-error exposure; cost-share begins FFY2029.' },
  { seat: 'Commissioner, Behavioral Health & Developmental Disabilities', auth: 'Board of BHDD', when: 'First 90 days', status: 'Decide', note: 'Forensic wait list.' },
  { seat: 'Executive Director, Georgia Technology Authority (State CIO)', auth: 'GTA Board', when: 'First 90 days', status: 'Decide', note: 'Data centers named as a transition priority; state technology posture.' },
  { seat: 'Public Service Commission, District 5', auth: 'Governor fills vacancy (elected seat)', when: 'Jan 1', status: 'Watch', note: 'Stan Wise’s appointed term expires Dec 31, 2026.' },
  { seat: 'Judicial Nominating Commission', auth: 'Governor', when: 'First 30 days', status: 'Decide', note: 'Kemp made 50 judicial/prosecutorial appointments in 2026; reconstitute the JNC early.' },
];
function render() {
  const d = DATA, tr = d.transition;
  const counts = { Open: SEATS.filter(s => s.status === 'Open').length, Decide: SEATS.filter(s => s.status === 'Decide').length, Watch: SEATS.filter(s => s.status === 'Watch').length };
  const stPill = s => s === 'Open' ? '<span class="pill red">Open</span>' : s === 'Decide' ? '<span class="pill amber">Decide</span>' : '<span class="pill blue">Watch</span>';
  $('#page').innerHTML = `
  <div class="ph"><div><h1>Appointments</h1><div class="sub">The transition team as announced on November 6, the senior seats still to be filled, and the working pipeline for candidates. Names in the pipeline are visible to the Chief of Staff and Personnel Director only.</div></div>
    <div class="act"><a class="btn" href="intake.html#referral">Add a referral</a><button class="btn" onclick="window.print()">Print</button></div></div>
  <div class="kpis">
    <div class="kpi green"><div class="l">Transition leadership named</div><div class="v">${1 + tr.cochairs.length}</div><div class="d">COO + ${tr.cochairs.length} co-chairs + ${tr.honorary.length} honorary</div></div>
    <div class="kpi red"><div class="l">Senior seats open</div><div class="v">${counts.Open}</div><div class="d">Chief of Staff, OPB, Counsel, Legislative, Comms</div></div>
    <div class="kpi amber"><div class="l">Keep-or-replace decisions</div><div class="v">${counts.Decide}</div><div class="d">agency heads with incumbents</div></div>
    <div class="kpi"><div class="l">Days to the OPB decision</div><div class="v">${daysBetween(AS_OF, '2026-12-15')}</div><div class="d">working target Dec 15; budget due Jan 16</div></div>
  </div>
  <div class="brief"><h2>Reading <span class="src">${dLong(AS_OF)}</span></h2>
    <p>The co-chair bench is business-heavy and Atlanta-heavy by design, and its stated job is to evaluate candidates for senior posts. The operational gap is at the top of the org chart: no chief of staff, no OPB director, no executive counsel. Of those, OPB is the clock that matters, because the document due January 16 is being assembled now by career staff on Gov. Kemp’s baseline and revenue posture. The second-order gap is the Judicial Nominating Commission: with ${d.watch.watch.filter(x => x.cat === 'Judicial / prosecutorial').length} judicial and prosecutorial seats filled by the outgoing governor this year, the new JNC will shape every vacancy from February on.</p></div>
  <div class="tabs"><button class="on" data-t="seats">Senior seats</button><button data-t="team" id="tabteam">Georgia’s Promise team</button><button data-t="pipe">Candidate pipeline</button></div>
  <div class="view on" id="v-seats"><div class="card"><div class="tw"><table><thead><tr><th>Seat</th><th>Appointing authority</th><th>Target</th><th>Status</th><th>Context</th></tr></thead><tbody>
    ${SEATS.map(s => `<tr><td><b>${esc(s.seat)}</b></td><td class="small">${esc(s.auth)}</td><td class="small nowrap">${esc(s.when)}</td><td>${stPill(s.status)}</td><td class="small mute">${esc(s.note)}</td></tr>`).join('')}
  </tbody></table></div></div><div class="note" style="margin-top:10px">Appointing authority is shown as Chapter understands the statute; counsel confirms each before an offer is made. Board-appointed heads turn over through the boards, which the governor shapes by appointment over time.</div></div>
  <div class="view" id="v-team">
    <div class="grid g3">
      <div class="card"><div class="hd"><h2>Chief Operating Officer</h2></div><div class="bd"><div class="person"><div class="av">${initials(tr.coo.name)}</div><div><div class="n">${esc(tr.coo.name)}</div><div class="b">${esc(tr.coo.bio)}</div></div></div></div></div>
      <div class="card" style="grid-column:span 2"><div class="hd"><h2>Co-chairs (${tr.cochairs.length})</h2><span class="src">Announced Nov 6, 2026</span></div><div class="bd two">${tr.cochairs.map(p => `<div class="person"><div class="av">${initials(p.name)}</div><div><div class="n">${esc(p.name)}</div><div class="b">${esc(p.bio)}</div></div></div>`).join('')}</div></div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><div class="hd"><h2>Honorary co-chairs (${tr.honorary.length})</h2></div><div class="bd small" style="columns:2;column-gap:24px;line-height:1.9">${tr.honorary.map(h => `<div>${esc(h)}</div>`).join('')}</div></div>
      <div class="card"><div class="hd"><h2>Stated priorities and open items</h2></div><div class="bd"><h3>Priorities</h3><ul style="margin:6px 0 12px 18px;font-size:13px;line-height:1.7">${tr.priorities.map(p => `<li>${esc(p)}</li>`).join('')}</ul><h3>Not yet announced</h3><ul style="margin:6px 0 0 18px;font-size:13px;line-height:1.7">${tr.open.map(p => `<li>${esc(p)}</li>`).join('')}</ul><div class="src" style="margin-top:10px">Sources: ${tr.sources.join('; ')}</div></div></div>
    </div>
  </div>
  <div class="view" id="v-pipe">
    <div class="banner">The pipeline holds referrals, résumés and vetting status for each senior seat. It fills through Intake (upload, email, referral form). It is empty until the transition loads it; nothing here is illustrative.</div>
    <div class="card"><div class="hd"><h2>Pipeline by seat</h2><a class="btn sm" href="intake.html#referral">Add a referral</a></div><div class="tw"><table><thead><tr><th>Seat</th><th class="num">Referred</th><th class="num">Screened</th><th class="num">Interviewed</th><th>Lead candidate</th><th>Vetting</th></tr></thead><tbody>
      ${SEATS.filter(s => s.status !== 'Watch').map(s => `<tr><td>${esc(s.seat)}</td><td class="num mute">0</td><td class="num mute">0</td><td class="num mute">0</td><td class="mute">—</td><td class="small mute">Giving · vendors · lobbying · boards · conflicts</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="note" style="margin-top:10px">Vetting checks run against Governor Pulse (campaign and Battleground giving, state vendor payments, lobbyist registration, existing board seats) and the public record; results attach to the candidate file and are visible to the Chief of Staff, Personnel Director and General Counsel.</div>
  </div>`;
  const show = t => { $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); ['seats', 'team', 'pipe'].forEach(k => $('#v-' + k).classList.toggle('on', k === t)); };
  $$('.tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.t)));
  if (location.hash === '#team') show('team');
}
