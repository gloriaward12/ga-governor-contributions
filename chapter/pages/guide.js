/* Guide & roadmap: how to use Chapter, what is live, what the field's best products do, and the build plan. */
function render() {
  const o = DATA.ops;
  $('#page').innerHTML = `
  <div class="ph"><div><h1>Guide & roadmap</h1><div class="sub">How to get everything out of Chapter, what is live and what is not, what the strongest products in this field do that Chapter should do, and the plan to build it out.</div></div><div class="act"><button class="btn" onclick="window.print()">Print</button></div></div>
  <div class="tabs"><button class="on" data-t="start">Start here</button><button data-t="data" id="tabdata">Data & confidence</button><button data-t="field">What the best products do</button><button data-t="plan">Build plan</button><button data-t="security">Security model</button></div>
  <div class="view on" id="v-start"><div class="grid g2">
    <div class="card"><div class="hd"><h2>The three questions Chapter answers</h2></div><div class="bd prose">
      <h3>What are we inheriting?</h3><p><a href="watch.html">Predecessor watch</a> (every 2026 order and announcement, scored) and <a href="inventory.html">Inventory</a> (agency leadership and ${fmtN(o.board_rows)} board seats).</p>
      <h3>Who should run it?</h3><p><a href="appointments.html">Appointments</a>: the transition team, the senior seats, the pipeline and the vetting that runs against Governor Pulse.</p>
      <h3>How do we pay for it?</h3><p><a href="budget.html">Budget sprint</a>: the ten weeks to January 16 on the Kemp baseline, with the revenue estimate as the lever; <a href="advisors.html">Advisors</a> to task outside firms from the same numbers.</p>
      <h3>If you remember one thing</h3><p>Type the question into the search box at the top. It answers across every module: a surname, a board, an order number, a budget term.</p></div></div>
    <div class="card"><div class="hd"><h2>First five minutes, by role</h2></div><div class="bd prose">
      <p><b>Chief of Staff.</b> Operations brief, then the high-priority rows in Predecessor watch, then the decision clock on Budget sprint.</p>
      <p><b>Governor-elect.</b> The Operations brief is written to be read in four minutes; Budget sprint’s “shape of the problem”; Appointments → senior seats.</p>
      <p><b>Policy Director.</b> Predecessor watch by type; Budget sprint; task a firm from Advisors.</p>
      <p><b>Personnel Director.</b> Inventory sorted by seats filled in the last 24 months; Appointments pipeline; Intake → referral.</p>
      <p><b>General Counsel.</b> Predecessor watch → open proceedings; Intake rules and the audit trail.</p>
      <p><b>Agency landing team.</b> Inventory, filtered to your agency’s boards and leadership.</p>
      <p class="mute small">Switch roles at top right. Role hides modules it does not need; the backend adds real accounts and the audit log.</p></div></div>
  </div></div>
  <div class="view" id="v-data"><div class="card"><div class="hd"><h2>What is live, what is derived, what is not yet here</h2></div><div class="tw"><table><thead><tr><th>Layer</th><th>Source</th><th>Status</th><th>Confidence</th></tr></thead><tbody>
    <tr><td>Executive orders, 2026 (${fmtN(o.eo_total_2026)})</td><td>gov.georgia.gov executive-order index</td><td><span class="pill green">Live</span></td><td>High: primary document linked on every row</td></tr>
    <tr><td>Priority scoring of orders</td><td>Chapter rules (type, body, tenure, fiscal reach)</td><td><span class="pill blue">Derived</span></td><td>Medium: a reading aid, reviewed by counsel</td></tr>
    <tr><td>Governor’s announcements, Jun–Nov 2026</td><td>gov.georgia.gov press releases</td><td><span class="pill green">Live</span></td><td>High</td></tr>
    <tr><td>Board & commission appointments, 2019–2026 (${fmtN(o.board_rows)} rows, ${fmtN(o.boards_total)} bodies)</td><td>Governor’s appointment releases</td><td><span class="pill green">Live</span></td><td>High for names and dates; term-expiry not yet captured</td></tr>
    <tr><td>Agency leadership</td><td>Governor’s releases; Budget Report</td><td><span class="pill amber">Partial</span></td><td>High for the nine rows shown; full roster pending</td></tr>
    <tr><td>Georgia’s Promise team and priorities</td><td>Nov 6 press conference; FOX 5, WABE, Atlanta News First</td><td><span class="pill green">Live</span></td><td>High</td></tr>
    <tr><td>Budget figures</td><td>Governor’s Budget Report AFY2026/FY2027; DOR monthly releases</td><td><span class="pill green">Live</span></td><td>High; October DOR report pending</td></tr>
    <tr><td>Fuel-tax monthly cost</td><td>FY2027 motor fuel funds ÷ 12</td><td><span class="pill blue">Derived</span></td><td>Medium: an order of magnitude, not a DOR estimate</td></tr>
    <tr><td>Calendar working targets (OPB director by Dec 15)</td><td>Chapter recommendation</td><td><span class="pill blue">Recommendation</span></td><td>—</td></tr>
    <tr><td>Candidate pipeline, interview notes, engagements</td><td>Transition’s own inputs via Intake</td><td><span class="pill">Empty</span></td><td>Fills as the team uses it; nothing illustrative is shown</td></tr>
    <tr><td>Donor / vendor / lobbyist / appointee screens</td><td>Governor Pulse (Commission filings, Open Georgia, PeachFile lobbyist index, appointment releases)</td><td><span class="pill green">Live, linked</span></td><td>High; matched by name, verify before use</td></tr>
  </tbody></table></div><div class="bd note">Chapter never shows scenario data as fact. Where an earlier prototype used sample interviews, dossiers and firm names, this version shows the empty structure and says so.</div></div></div>
  <div class="view" id="v-field"><div class="grid g2">
    <div class="card"><div class="hd"><h2>What the strongest products in this field get right</h2></div><div class="bd prose">
      <p><b>The Partnership for Public Service’s Center for Presidential Transition</b> (with BCG) set the standard for transition method: a standardized agency-review report format, a single intake for appointee applications, time targets for appointments, and archives that outlive the transition. Chapter adopts: one report format per agency, one intake, dated targets on every seat, and a record that survives inauguration.</p>
      <p><b>Palantir (Gotham/Foundry)</b> wins government work on provenance and permissioning: every fact traces to a source document, and what a user can see is decided by role and record, not by page. Chapter adopts: a source line on every row, role-scoped views, and sensitivity set at the record level.</p>
      <p><b>FiscalNote and Quorum</b> built durable businesses on alerts and briefs rather than dashboards: a weekly brief for executives, curated alerts, stakeholder databases, and exportable reporting. Chapter adopts: the Operations brief as the product, nightly feeds that generate alerts, and CSV/print on every table.</p>
      <p><b>Bloomberg Government</b> is dense, keyboard-fast and never decorative. Chapter adopts: a dense, flat interface; tabular numerics; one search that spans everything.</p>
      <p><b>McKinsey Wave / BCG transformation offices</b> run large programs as initiative charters with owners, stage gates and a weekly cadence. Chapter adopts: workstreams with owners and dates, a decision clock, and a Monday cadence for the Chief of Staff.</p></div></div>
    <div class="card"><div class="hd"><h2>What they get wrong, and Chapter’s edge</h2></div><div class="bd prose">
      <p><b>Generic.</b> National tools do not know Georgia: the 40-day session, the governor’s exclusive revenue estimate, the leadership-committee rules, the Commission’s filing calendar, the way boards actually turn over. Chapter is built on Georgia statute and Georgia data only.</p>
      <p><b>Expensive and slow to stand up.</b> Foundry-class platforms take quarters and specialists. Chapter is live on public data today and layers the transition’s own material through one intake.</p>
      <p><b>Dashboards no one reads.</b> The deliverable is a briefing a chief of staff can read in four minutes, with the evidence one click away.</p>
      <p><b>No link to money and influence.</b> None of them join the appointee list to campaign giving, state vendor payments and lobbyist registrations. Chapter does, through Governor Pulse, which is already running.</p>
      <h3>Positioning line</h3><p>Chapter is the transition’s operating record: what the state is inheriting, who should run it, and how it will be paid for, with every fact sourced and every sensitive record permissioned.</p></div></div>
  </div></div>
  <div class="view" id="v-plan"><div class="grid g2">
    <div class="card"><div class="hd"><h2>Build plan</h2></div><div class="bd prose">
      <h3>Phase 0 · now – Nov 21 (this build)</h3><p>Public-data modules live: Predecessor watch, Inventory, Budget sprint, Appointments (team + seats), Operations brief, Ask, Intake v1 (local), role views. Nightly refresh of orders, releases, DOR and appointment feeds. Private link, no accounts.</p>
      <h3>Phase 1 · by Dec 12 · accounts and the record</h3><p>Named sign-in (magic link or Google Workspace), role assignment, audit log, server-side Intake with email address and firm upload links, PDF/Word reading, candidate pipeline and interview capture stored in a permissioned database. Term-expiry layer for boards from enabling statutes. Full agency-head roster.</p>
      <h3>Phase 2 · by Jan 8 · governing</h3><p>Daily brief generated at 6:00 and released by the Chief of Staff; agency landing-team views scoped per agency; deliverable verification for outside firms; legislative tracker (bills, sponsors, committee calendars from legis.ga.gov) for the session that starts January 11.</p>
      <h3>Phase 3 · first 100 days</h3><p>Priorities & accountability (commitments → instrument → status), narrative tracking, and the Governor Pulse screens embedded for every appointment.</p></div></div>
    <div class="card"><div class="hd"><h2>What it takes</h2></div><div class="bd prose">
      <p><b>Stack.</b> Static front end (this), a small API (Node on Vercel or Supabase), Postgres with row-level security, nightly fetch jobs, object storage for documents, email intake via a transactional provider. All of it is already in use on Governor Pulse.</p>
      <p><b>Data agreements.</b> None required for Phase 0: everything is public. Phases 1–2 need the transition’s own material and, ideally, read access to OPB agency requests.</p>
      <p><b>People.</b> One builder (in place), one data/compliance reviewer (counsel), one product owner on the transition side (the Chief of Staff’s designee).</p>
      <p><b>Security.</b> See the security model tab. Nothing sensitive is stored in Phase 0 because nothing sensitive is collected.</p>
      <p><b>Commercial.</b> Priced as an engagement, not a license: a transition-phase fee for Phases 0–2 and a governance-phase retainer for the brief and the trackers. The earlier catalog’s module prices are the ceiling, not the floor.</p></div></div>
  </div></div>
  <div class="view" id="v-security"><div class="card"><div class="hd"><h2>Security model</h2></div><div class="bd prose">
    <p><b>Phase 0 (today).</b> Private, unlisted link; public data only; no personal information collected; Intake and referrals stay on the user’s device. Nothing to breach.</p>
    <p><b>Phase 1.</b> Named accounts with single sign-on; every record carries an owner role and a sensitivity level; database rows are filtered by role at the database layer, not in the page; an append-only audit log of who saw and changed what; documents encrypted at rest; exports watermarked with the user and time; firm upload links expire and accept only their engagement.</p>
    <p><b>Sensitive by default.</b> Résumés, interview notes, vetting results and referral sources are visible to the Chief of Staff, Personnel Director and General Counsel only, and never leave the document room.</p>
    <p><b>Separation.</b> Campaign-finance data (Governor Pulse) and state operating data (Chapter) stay in separate systems with separate access lists; Chapter links out to Pulse for screens rather than copying donor records in.</p>
    <p><b>Retention.</b> Transition records are archived at inauguration and handed to the Governor’s office under its own records policy.</p></div></div></div>`;
  const show = t => { $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); ['start', 'data', 'field', 'plan', 'security'].forEach(k => $('#v-' + k).classList.toggle('on', k === t)); };
  $$('.tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.t)));
  if (location.hash === '#data') show('data');
}
