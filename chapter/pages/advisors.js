/* Advisors: tasking, deliverable verification and scorecards for outside firms. Register is empty until engagements exist. */
function render() {
  const o = DATA.ops;
  $('#page').innerHTML = `
  <div class="ph"><div><h1>Advisors</h1><div class="sub">Outside firms, pointed at the right question and held to the transition’s own numbers. Chapter writes the tasking from what it already knows, checks every deliverable against its data, catches duplicated work, and scores firms on quality, timeliness, scope and cost.</div></div></div>
  <div class="banner">No outside engagement has been recorded yet. This module activates when the first firm is tasked; the structure below is what each engagement will carry.</div>
  <div class="grid g2">
    <div class="card"><div class="hd"><h2>Build a tasking memo</h2><span class="src">Uses Chapter’s data as the starting brief</span></div><div class="bd">
      <div class="field"><label>Engagement</label><select id="eng"><option>— new engagement —</option></select></div>
      <div class="field"><label>Question for the firm</label><textarea id="q" placeholder="e.g. Size the state share of full Medicaid expansion for FY2028 under three enrollment scenarios, using DCH’s current Pathways data."></textarea></div>
      <div class="field"><label>Due</label><input type="date" id="due" value="2026-12-12"></div>
      <button class="btn primary" id="gen">Generate memo</button></div></div>
    <div class="card"><div class="hd"><h2>Memo</h2><button class="btn sm" id="copy">Copy</button></div><div class="bd"><pre id="memo" class="small" style="white-space:pre-wrap;font-family:var(--sans);color:var(--ink-2);min-height:200px">Fill in the question and generate. The memo opens with the facts Chapter already holds so the firm does not bill to re-derive them.</pre></div></div>
  </div>
  <div class="grid g3" style="margin-top:16px">
    <div class="card"><div class="hd"><h2>Engagement register</h2></div><div class="bd empty">Firm · scope · lead · fee basis · hours to date · milestones</div></div>
    <div class="card"><div class="hd"><h2>Deliverable verification</h2></div><div class="bd empty">Each deliverable is checked against Chapter’s figures; variances are listed with the source on each side.</div></div>
    <div class="card"><div class="hd"><h2>Scorecard</h2></div><div class="bd empty">Quality · timeliness · scope discipline · cost, scored per deliverable; duplication across firms flagged.</div></div>
  </div>`;
  $('#gen').addEventListener('click', () => {
    const b = DATA.budget, q = $('#q').value.trim() || '[question]', due = $('#due').value;
    $('#memo').textContent = `TASKING MEMO — Georgia’s Promise transition\nDate: ${dLong(AS_OF)}   Due: ${dLong(due)}   Requested by: Chief of Staff\n\nQuestion\n${q}\n\nWhat the transition already holds (do not re-derive; cite if you depart from it)\n• FY2027 state funds appropriated: ${fmtB(b.fy27_state_funds)}; AFY2026: ${fmtB(b.afy26_state_funds)} incl. ${fmtB(b.undesignated_surplus_afy26)} undesignated surplus (Governor’s Budget Report).\n• Revenue Shortfall Reserve, 6/30/2025: ${fmtB(b.rsr_fy25)}.\n• FY2027 net collections through Sep 30: $${b.ytd.net}B, +${b.ytd.chg}% (DOR).\n• Motor fuel tax suspended ${dShort(b.fuel.suspended_from)}–${dShort(b.fuel.through)} (EO 09.28.26.01 as amended); ≈${fmtB(b.motor_fuel_fy27 / 12)}/month.\n• Budget due to the General Assembly ${dLong(BUDGET_DUE)}; inauguration ${dLong(INAUG)}.\n• Outgoing administration: ${o.eo_total_2026} executive orders in 2026, ${o.eo_final90} since Aug 5.\n\nDeliverable\nA sourced memo of no more than six pages plus a workbook. Every figure carries a primary source (OPB, DOR, DCH, legis.ga.gov, open.ga.gov). State assumptions explicitly. Flag any number that differs from the facts above and say why.\n\nScope discipline\nAnswer the question asked. Do not expand into adjacent studies without written approval from the Chief of Staff. Report hours weekly against the milestone plan.\n\nConfidentiality\nWork product belongs to the transition. Submit through the engagement’s upload link only.`;
    toast('Memo generated');
  });
  $('#copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#memo').textContent); toast('Copied'); } catch (e) { toast('Clipboard blocked'); } });
}
