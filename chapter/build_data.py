#!/usr/bin/env python3
"""Build Chapter's data files from public sources already on disk.
Sources: gov.georgia.gov executive orders (2026) and press releases; gov.georgia.gov board/commission
appointment releases 2019-2026; the Governor's Budget Report AFY2026/FY2027; DOR revenue releases;
transition facts from Nov 6-12, 2026 press coverage.  Nothing here is scenario data.
"""
import json, re, collections, datetime, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'data'); os.makedirs(OUT, exist_ok=True)
TODAY = datetime.date(2026, 11, 12)
INAUG = datetime.date(2027, 1, 11)          # 2nd Monday of January 2027; General Assembly convenes
BUDGET_DUE = datetime.date(2027, 1, 16)     # within five days of convening (O.C.G.A. 45-12-75)
ELECTION = datetime.date(2026, 11, 3)

# ---------------------------------------------------------------- executive orders
eo = json.load(open(os.path.join(HERE, '..', 'eo_2026.json')))
def sev(r):
    t = r['title'].lower(); c = r['cat']
    if c == 'Judicial / prosecutorial': return 'high', 'Lifetime-style tenure: judges and DAs appointed now serve past the new term.'
    if 'public service commission' in t: return 'high', 'PSC seat controls utility rate cases; term runs past inauguration.'
    if c == 'Emergency' and ('fuel' in t or 'petroleum' in t): return 'high', 'Fuel-tax suspension forgoes about $215M a month (FY27 motor fuel funds of $2.61B ÷ 12); expires Nov 30 unless extended.'
    if c == 'Emergency': return 'med', 'Emergency powers and spending authority carry into the new administration.'
    if c in ('Appointment', 'Reappointment'):
        if any(k in t for k in ['board of regents', 'economic development', 'transportation', 'natural resources', 'community health', 'education', 'technical college', 'corrections', 'juvenile', 'retirement', 'pension', 'ports', 'world congress', 'lottery', 'housing']): return 'med', 'Policy board: terms typically 4-7 years; seat is unavailable to the new governor until expiry.'
        return 'low', 'Advisory or licensing body; limited policy leverage.'
    if c == 'Suspension / review': return 'med', 'Local-official suspension or review commission: inherits an open proceeding.'
    if c == 'Property': return 'low', 'Property disposition: check for encumbrances on sites the new administration may need.'
    if 'bond' in t: return 'med', 'Debt authorization binds future budgets.'
    if 'water management' in t or 'gtea' in t or 'transportation efficiency' in t: return 'med', 'Structural delegation of authority; reversible by EO but sticky in practice.'
    return 'low', ''
watch = []
for r in eo:
    s, why = sev(r)
    d = datetime.date.fromisoformat(r['date'])
    watch.append(dict(id=r['no'], date=r['date'], title=r['title'], cat=r['cat'], severity=s, why=why, url=r['href'], source='gov.georgia.gov · Executive Order ' + r['no'], phase='post-election' if d >= ELECTION else ('final-90' if (ELECTION - d).days <= 90 else 'earlier')))
watch.sort(key=lambda w: (w['date'], w['id']), reverse=True)

# ---------------------------------------------------------------- press releases
press = json.load(open(os.path.join(HERE, '..', 'press_2026.json')))
plist = press['list']
def pcat(t):
    t = t.lower()
    if 'appoint' in t or 'agency head' in t or 'leadership' in t or 'ceo' in t or 'commissioner' in t: return 'Personnel'
    if 'tax revenue' in t: return 'Revenue'
    if 'gas tax' in t or 'diesel' in t or 'tax relief' in t or 'rebate' in t: return 'Fiscal action'
    if 'emergency' in t or 'hurricane' in t: return 'Emergency'
    if 'jobs' in t or 'invest' in t or 'hq' in t or 'footprint' in t or 'business' in t or 'economic' in t or 'tourism' in t: return 'Economic development'
    if 'grant' in t or 'bond' in t or 'transportation projects' in t: return 'Funding'
    return 'Other'
for p in plist: p['cat'] = pcat(p['title']); p['source'] = 'gov.georgia.gov · press release'

# ---------------------------------------------------------------- boards & commissions inventory
appts = json.load(open('/home/claude/boards/appointments.json'))
boards = collections.defaultdict(lambda: dict(rows=0, reapp=0, names=[], last='', first='9999', urls=set()))
for a in appts:
    b = boards[a['board']]; b['rows'] += 1; b['reapp'] += 1 if a.get('reappointed') else 0
    b['names'].append(dict(name=a['name'], date=a['date'], re=bool(a.get('reappointed')), bio=(a.get('bio') or '')[:140]))
    b['last'] = max(b['last'], a['date']); b['first'] = min(b['first'], a['date']); b['urls'].add(a['url'])
inv = []
for name, b in boards.items():
    names = sorted(b['names'], key=lambda x: x['date'], reverse=True)
    # a seat appointed in the last 24 months is 'fresh': the appointee will almost certainly still be sitting on Jan 11
    fresh = sum(1 for n in names if n['date'] >= '2024-11-12')
    inv.append(dict(board=name, appointments=b['rows'], reappointments=b['reapp'], distinct=len({n['name'] for n in names}), last=b['last'], first=b['first'], fresh24=fresh, recent=names[:12], releases=len(b['urls'])))
inv.sort(key=lambda x: (-x['appointments'], x['board']))

# ---------------------------------------------------------------- agency leadership (from press releases on file; verify each before relying on it)
leaders = [
  dict(agency='Governor’s Office of Planning and Budget', title='Executive Director', holder='Richard Dunn', basis='Governor’s Budget Report AFY2026/FY2027 cover', appointer='Governor', priority='Day 1', note='Controls the January budget document. The single highest-leverage early decision.'),
  dict(agency='Department of Revenue', title='State Revenue Commissioner', holder='David Burge', basis='DOR release, Nov 2 2026', appointer='Governor', priority='Day 1', note='Administers the revenue estimate inputs, refunds and the fuel-tax suspension.'),
  dict(agency='Georgia Emergency Management and Homeland Security Agency', title='Director', holder='Josh Lamb', basis='Governor’s release, Oct 8 2026', appointer='Governor', priority='Day 1', note='Open flooding emergency (EO 11.05.26.01) and Helene recovery funds.'),
  dict(agency='Georgia Bureau of Investigation', title='Director', holder='Chris Hosey', basis='Governor’s release, Jul 22 2026', appointer='Governor', priority='First 30 days', note=''),
  dict(agency='Department of Community Supervision', title='Commissioner', holder='Scott Maurer (since Oct 1 2026)', basis='Governor’s release, Jul 1 2026', appointer='Governor, with board', priority='First 90 days', note='Named in the last 100 days of the outgoing term.'),
  dict(agency='Georgia Vocational Rehabilitation Agency', title='Executive Director', holder='Dr. Kirk Shook (since Jul 2026)', basis='Governor’s release, Jul 9 2026', appointer='GVRA Board on governor’s nomination', priority='First 90 days', note=''),
  dict(agency='Nonpublic Postsecondary Education Commission', title='Executive Director', holder='Magda “Maggie” Rivers (since Jul 2026)', basis='Governor’s release, Jul 9 2026', appointer='Governor', priority='Later', note=''),
  dict(agency='Stone Mountain Memorial Association', title='CEO', holder='Chris Sanders (effective Jan 1 2027; Bill Stephens retires Dec 31)', basis='Governor’s release, Nov 9 2026', appointer='SMMA Board', priority='Watch', note='Board vote six days after the election; CEO starts ten days before inauguration.'),
  dict(agency='Public Service Commission, District 5', title='Commissioner', holder='Stan Wise (appointed Sept 2026; term expires Dec 31 2026)', basis='Governor’s release, Aug 21 2026; EO 09.03.26.01', appointer='Governor fills vacancy; elected seat', priority='Watch', note='Term ends Dec 31, 2026: the seat is live on Day 1 pending the election outcome for the District 5 seat.'),
]
for L in leaders: L['confidence'] = 'High' if 'release' in L['basis'] or 'Budget Report' in L['basis'] else 'Medium'

# ---------------------------------------------------------------- transition (Georgia's Promise)
transition = dict(
  name="Georgia's Promise", announced='2026-11-06', inauguration=INAUG.isoformat(), budget_due=BUDGET_DUE.isoformat(),
  coo=dict(name='Jon Keen', bio='Military veteran; former City of Atlanta chief operating officer'),
  cochairs=[
    dict(name='Arthur M. Blank', bio='Chairman, AMB Group; co-founder, The Home Depot'),
    dict(name='Rosalind “Roz” Brewer', bio='Former CEO, Walgreens Boots Alliance; former interim president, Spelman College'),
    dict(name='Jason Carter', bio='Former state senator; chair, Carter Center board of trustees'),
    dict(name='Carmen Chubb', bio='President, Columbia Residential; chief of staff to Mayor Bottoms'),
    dict(name='Richard Cox Jr.', bio='SVP Customer Service, Delta Air Lines; former Atlanta COO'),
    dict(name='Jane Kidd', bio='Former state representative; former state Democratic Party chair'),
    dict(name='Michelle Nunn', bio='President and CEO, CARE USA'),
    dict(name='Vicki R. Palmer', bio='President, The Palmer Group; led the 2018 mayoral transition'),
    dict(name='Tyler Perry', bio='Founder, Tyler Perry Studios'),
    dict(name='Rashad Taylor', bio='Former state representative; senior advisor to Mayor Bottoms'),
  ],
  honorary=['Harold Jones II (Senate Minority Leader)', 'Carolyn Hugley (House Democratic Leader)', 'Peter Hubbard (Public Service Commissioner)', 'Calvin Smyre', 'Thurbert Baker', 'Roy Barnes', 'David Burgess', 'Terry Coleman', 'Cathy Cox', 'Wyche Fowler', 'Joe Frank Harris', 'Pierre Howard', 'Alicia Johnson', 'Sam Nunn', 'Jon Ossoff', 'Tim Ryles', 'Mark Taylor', 'Michael Thurmond', 'Raphael Warnock', 'Andrew Young'],
  priorities=['Affordability and the cost of living', 'Access to affordable health care, including full Medicaid expansion', 'Public schools, teachers and students', 'Data centers (expert consultation announced)', 'North Georgia flooding response with the Kemp administration'],
  open=['Chief of Staff', 'OPB Director', 'Policy leads (not yet named)', 'Senior transition staff (not yet named)', 'Agency heads (none announced)'],
  kemp='Gov. Kemp pledged full cooperation (Nov 4). No lame-duck special session expected.',
  sources=['FOX 5 Atlanta, Nov 6 2026', 'WABE, Nov 10 2026', 'Atlanta News First, Nov 10 2026', 'Let’s Address Georgia, Nov 10 2026'],
)

# ---------------------------------------------------------------- budget
budget = dict(
  source='Governor’s Budget Report, Amended FY2026 and FY2027 (OPB); DOR monthly revenue releases',
  fy27_state_funds=38_499_917_737, afy26_state_funds=42_268_170_020, fy26_original=37_761_687_325,
  fy27_general_fund_receipts=36_610_442_817, afy26_general_fund_receipts=36_770_132_749,
  undesignated_surplus_afy26=3_282_761_227, midyear_k12=372_197_321,
  rsr_fy25=5_582_959_810, rsr_fy24=5_466_259_838, rsr_cap_note='Statutory cap 15% of prior-year net revenue; governor may release amounts above 4%.',
  lottery_fy27=1_738_815_158, motor_fuel_fy27=2_612_194_500, tobacco_fy27=148_578_162,
  kemp_asks=[dict(item='Final 20 bp income-tax cut (2022 law)', amount=770_000_000, kind='recurring'), dict(item='One-time tax rebate', amount=1_000_000_000, kind='one-time'), dict(item='Homeowner Tax Relief Grant ($18,000 homestead reduction, AFY26)', amount=None, kind='one-time')],
  revenue=[dict(month='Jul 2026', net=2.57, chg=3.1), dict(month='Aug 2026', net=2.50, chg=3.5), dict(month='Sep 2026', net=3.34, chg=2.3)],
  ytd=dict(through='Sep 30 2026', net=8.41, chg=2.9, prior=8.17),
  fuel=dict(suspended_from='2026-09-28', through='2026-11-30', gas_cents=33.3, diesel_cents=37.3, note='Motor fuel excise tax suspended by EO 09.28.26.01, amended 10.06.26.01, extended 10.24.26.01. Prior suspension Mar 20 – Jun 3 2026 cut June net revenue 6.8%.'),
  fy26_actual=dict(net=33.75, chg=0.4),
  calendar=[
    dict(date='2026-11-12', what='Transition day 9. OPB is finalizing agency budget instructions on the Kemp baseline.'),
    dict(date='2026-11-30', what='Fuel-tax suspension expires unless Gov. Kemp extends it again.'),
    dict(date='2026-12-15', what='Working target: Governor-elect names OPB Director and budget landing team; State Economist briefing on the revenue estimate.'),
    dict(date='2026-12-31', what='FY2026 election-cycle campaign reports close; PSC District 5 term expires; Stone Mountain CEO transition.'),
    dict(date='2027-01-11', what='Inauguration; General Assembly convenes (second Monday).'),
    dict(date='2027-01-16', what='Governor’s AFY2027 and FY2028 budget due to the General Assembly (within five days of convening).'),
    dict(date='2027-04', what='Sine die (40 legislative days). Campaign fundraising blackout for statewide officials ends.'),
  ],
)

# ---------------------------------------------------------------- operations summary
days_to = (INAUG - TODAY).days
post = [w for w in watch if w['phase'] == 'post-election']
f90 = [w for w in watch if w['phase'] in ('post-election', 'final-90')]
ops = dict(
  as_of=TODAY.isoformat(), days_to_inauguration=days_to, days_to_budget=(BUDGET_DUE - TODAY).days, transition_day=(TODAY - ELECTION).days,
  eo_total_2026=len(watch), eo_post_election=len(post), eo_final90=len(f90), eo_high_final90=sum(1 for w in f90 if w['severity'] == 'high'),
  press_since_election=[p for p in plist if p['date'] >= ELECTION.isoformat()],
  boards_total=len(inv), board_rows=len(appts), fresh_seats=sum(b['fresh24'] for b in inv),
  cat_counts_final90=collections.Counter(w['cat'] for w in f90),
)

json.dump(dict(watch=watch, press=plist, bodies=press['bodies']), open(os.path.join(OUT, 'watch.json'), 'w'))
json.dump(dict(boards=inv, leaders=leaders), open(os.path.join(OUT, 'inventory.json'), 'w'))
json.dump(transition, open(os.path.join(OUT, 'transition.json'), 'w'))
json.dump(budget, open(os.path.join(OUT, 'budget.json'), 'w'))
json.dump(ops, open(os.path.join(OUT, 'ops.json'), 'w'))
print('watch', len(watch), 'post-election', len(post), 'final90', len(f90), 'high', ops['eo_high_final90'])
print('boards', len(inv), 'fresh seats', ops['fresh_seats'], 'days to inaug', days_to)
