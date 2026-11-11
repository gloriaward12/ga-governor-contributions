#!/usr/bin/env python3
"""Build public/finance/ngp.json from the NGP VAN exports (run locally; the exports never enter the repo).

usage: python3 -I scripts/build_ngp.py <ContributionReport.xlsx> <events.csv> [commission cand-100663.json]

Output carries no emails, phone numbers or street addresses: donors are name, city, state, ZIP, employer,
occupation and giving history, and only donors at $250+ lifetime, event attendees or host candidates are listed.
"""
import sys, re, json, datetime as dt
import pandas as pd, numpy as np

args = [a for a in sys.argv[1:]]
PBG = None
if '--pbg' in args: i = args.index('--pbg'); PBG = args[i + 1]; del args[i:i + 2]
PBG_FILED = None
if '--pbg-filed' in args: i = args.index('--pbg-filed'); PBG_FILED = args[i + 1]; del args[i:i + 2]
PBG_CODES = None
if '--pbg-codes' in args: i = args.index('--pbg-codes'); PBG_CODES = args[i + 1]; del args[i:i + 2]
PBG_PART = None
if '--pbg-participants' in args: i = args.index('--pbg-participants'); PBG_PART = args[i + 1]; del args[i:i + 2]
PBG_GUESTS = None
if '--pbg-guests' in args: i = args.index('--pbg-guests'); PBG_GUESTS = args[i + 1]; del args[i:i + 2]
PBG_ATTR = None
if '--pbg-attributions' in args: i = args.index('--pbg-attributions'); PBG_ATTR = args[i + 1]; del args[i:i + 2]
GUESTS = pd.read_pickle(PBG_GUESTS) if PBG_GUESTS else None
if GUESTS is not None:
    GUESTS['p'] = pd.to_numeric(GUESTS['Purchase Price'], errors='coerce').fillna(0)
ATTR = pd.read_pickle(PBG_ATTR) if PBG_ATTR else None
CODE_NAMES = {}
if PBG_CODES:
    _c = pd.read_pickle(PBG_CODES) if PBG_CODES.endswith('.pkl') else pd.read_csv(PBG_CODES, sep='\t', encoding='utf-16', dtype=str)
    for _, r in _c.iterrows():
        if isinstance(r.get('Description'), str) and r['Description'].strip(): CODE_NAMES[str(r['Name']).strip()] = r['Description'].strip()
PART = None
if PBG_PART:
    PART = pd.read_pickle(PBG_PART) if PBG_PART.endswith('.pkl') else pd.read_csv(PBG_PART, sep='\t', encoding='utf-16', dtype=str)
    PART['Event Date'] = pd.to_datetime(PART['Event Date'], errors='coerce')
SRC, EVF = args[0], args[1]
COMM = args[2] if len(args) > 2 else None
OUT = 'public/finance/ngp.json'
EPOCH = dt.date(2025, 1, 1)
day = lambda d: (d.date() - EPOCH).days if pd.notna(d) else None
LIMIT = 8400
def nk(name):
    name = str(name or '')
    if ',' in name: last, first = name.split(',', 1)
    else: last, first = name, ''
    norm = lambda x: re.sub(r'[^a-z]', '', x.lower())
    return norm(last) + '|' + norm(first)[:5]

def load_export(path):
    d = pd.read_pickle(path) if path.endswith('.pkl') else pd.read_excel(path)
    d = d[pd.to_numeric(d['Contribution ID'], errors='coerce').notna()].copy()
    for c in ['Source Code', 'Designation', 'Contribution Type', 'Payment Method', 'Period', 'Home State/Province', 'Home City', 'Employer', 'Occupation', 'Contact Name']:
        if c not in d: d[c] = ''
        d[c] = d[c].fillna('').astype(str).str.strip().replace({'nan': ''})
    d['Amount'] = pd.to_numeric(d['Amount'], errors='coerce').fillna(0)
    d['adj'] = pd.to_numeric(d['Total Adjusted Amount'], errors='coerce').fillna(0) if 'Total Adjusted Amount' in d else 0.0
    if 'Remaining Amount' in d and 'Total Adjusted Amount' not in d: d['adj'] = (pd.to_numeric(d['Amount'], errors='coerce').fillna(0) - pd.to_numeric(d['Remaining Amount'], errors='coerce').fillna(0)).clip(lower=0)
    d['net'] = d['Amount'] - d['adj']
    d['Date Received'] = pd.to_datetime(d['Date Received'], errors='coerce')
    d = d[d['Date Received'] >= '2025-01-01'].copy()
    d['day'] = d['Date Received'].map(day)
    d['month'] = d['Date Received'].dt.strftime('%Y-%m')
    return d
d = load_export(SRC)
pb = load_export(PBG) if PBG else None
mon = d[d['Contribution Type'] == 'Monetary Contribution'].copy()
pbmon = pb[pb['Contribution Type'] == 'Monetary Contribution'].copy() if pb is not None else None

# ---- channel classification -------------------------------------------------------------------
ev = pd.read_csv(EVF)
ev['Date'] = pd.to_datetime(ev['Date'])
ev['Source Code'] = ev['Source Code'].fillna('').astype(str).str.strip().replace({'nan': ''})
EVENT_CODES = set(ev['Source Code']) - {''}
EVENT_RX = re.compile(r'^(\d{8}|\d{4}_\d{4}|[A-Z]{2,4}\d{6,8}|\d{6}[A-Za-z])')
# programs that behave like events for recognition: their own page, their own donor list
PROGRAMS = {'MillionMen': ('Men for Keisha (Million Men)', 'Men for Keisha'), 'KLB_WomenCount': ('Women for Keisha (online page)', 'Women for Keisha')}
EVENT_CODES |= set(PROGRAMS)

def channel(code):
    c = code if isinstance(code, str) else ''
    l = c.lower()
    if c == '' or c == 'Placeholder': return 'Uncoded online'
    if c in EVENT_CODES or EVENT_RX.match(c): return 'Events'
    if 'calltime' in l or 'call time' in l or 'major donor' in l: return 'Call time / major donor'
    if 'bundler' in l: return 'Bundler links'
    if l in ('check', 'cash', 'unsol check', 'in-kind', 'klb_loan', 'klb pac'): return 'Checks and transfers'
    if l.startswith('klb') or l.startswith('ab_express') or l in ('oath_26',): return 'Campaign digital'
    return 'Partner and joint pages'
mon['channel'] = mon['Source Code'].map(channel)

# recurring: 3+ gifts of the same amount roughly a month apart
rec = set()
for vid, g in mon.groupby('VANID'):
    if len(g) < 3: continue
    for amt, gg in g.groupby('Amount'):
        if len(gg) < 3: continue
        dd = np.sort(gg['day'].values); gaps = np.diff(dd)
        if ((gaps >= 26) & (gaps <= 35)).sum() >= 2: rec.add(vid); break

# ---- per donor ----------------------------------------------------------------------------------
first_gift = mon.groupby('VANID')['day'].min()
mon['first_time'] = mon['day'] == mon['VANID'].map(first_gift)

agg = mon.groupby('VANID').agg(name=('Contact Name', 'first'), city=('Home City', 'first'), state=('Home State/Province', 'first'),
                               zip=('Home Zip/Postal', 'first'), emp=('Employer', 'first'), occ=('Occupation', 'first'),
                               total=('net', 'sum'), n=('net', 'size'), first=('day', 'min'), last=('day', 'max'), mx=('net', 'max'))
per = mon.pivot_table(index='VANID', columns='Period', values='net', aggfunc='sum', fill_value=0)
agg['pri'] = per.get('Primary', 0); agg['gen'] = per.get('General', 0)
evg = mon[mon['channel'] == 'Events'].groupby('VANID')['Source Code'].agg(lambda s: sorted(set(s)))
agg['events'] = evg
chan = mon.groupby(['VANID', 'channel'])['net'].sum().unstack(fill_value=0)
agg['topChannel'] = chan.idxmax(axis=1)
agg['recurring'] = agg.index.isin(rec)

# ---- events ---------------------------------------------------------------------------------------
def host_from(title, code):
    t = str(title or '')
    m = re.search(r'(?:hosted by|with|featuring)\s+(.+?)(?:\s+(?:in support|in |at |for |to |&amp;|—|-)\s|$)', t, re.I)
    if m:
        h = m.group(1).strip(' .,');
        if 3 <= len(h) <= 60 and not re.search(r'keisha|bottoms|governor', h, re.I): return h
    c = str(code or '')
    c = re.sub(r'^\d{8}_?|^\d{4}_\d{4}|^[A-Z]{2,4}\d{4,8}|^\d{6,8}', '', c)
    c = re.sub(r'^(ATL|NYC|DC|MVY|GA|SF|LA|SV)_?', '', c).replace('_', ' ').strip()
    c = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', c)
    return c if 2 <= len(c) <= 40 else ''

import os
MANUAL = json.load(open('scripts/hosts_manual.json')) if os.path.exists('scripts/hosts_manual.json') else {}
bycode = mon[mon['channel'] == 'Events'].groupby('Source Code')
stats = bycode.agg(n=('net', 'size'), amt=('net', 'sum'), donors=('VANID', 'nunique'), firstTime=('first_time', 'sum'),
                   mx=('net', 'max'), firstDay=('day', 'min'), lastDay=('day', 'max'),
                   ga=('Home State/Province', lambda s: float((s == 'GA').mean())))
events = []
seen = set()
for _, r in ev.iterrows():
    code = r['Source Code']; s = stats.loc[code] if code in stats.index else None
    if code and code in seen:
        e0 = next(e for e in events if e['code'] == code and e['listed'])
        e0['name'] += ' / ' + str(r['Event']).strip(); e0['invited'] += int(r['Invited'] or 0); e0['confirmed'] += int(r['Confirmed'] or 0); e0['completed'] += int(r['Completed'] or 0)
        continue
    seen.add(code)
    events.append(dict(date=day(r['Date']), name=str(r['Event']).strip(), location='' if pd.isna(r['Location']) else str(r['Location']).strip(),
                       type='' if pd.isna(r['Type']) else str(r['Type']), code=code, host=host_from(r['Event'], code), listed=True,
                       invited=int(r['Invited'] or 0), confirmed=int(r['Confirmed'] or 0), completed=int(r['Completed'] or 0),
                       n=int(s['n']) if s is not None else 0, amt=round(float(s['amt']), 2) if s is not None else 0,
                       donors=int(s['donors']) if s is not None else 0, firstTime=int(s['firstTime']) if s is not None else 0,
                       max=round(float(s['mx']), 2) if s is not None else 0, ga=round(float(s['ga']), 3) if s is not None else None,
                       firstDay=int(s['firstDay']) if s is not None else None, lastDay=int(s['lastDay']) if s is not None else None))
# listed events with no source code: adopt the code-only code dated the same day whose code carries the host's surname or the venue
for e in events:
    if e['code'] or not e['date']: continue
    toks = [t.lower() for t in re.findall(r"[A-Za-z]{3,}", (e['host'] or '') + ' ' + e['name']) if t.lower() not in ('reception', 'with', 'support', 'keisha', 'lance', 'bottoms', 'september', 'october', 'november', 'event', 'fundraiser', 'home', 'the')]
    for code, s in stats.iterrows():
        if code in seen or not any(t in code.lower() for t in toks): continue
        m8 = re.match(r'^(\d{4})(\d{2})(\d{2})', code)
        if not m8: continue
        cd = day(dt.datetime(int(m8.group(1)), int(m8.group(2)), int(m8.group(3))))
        if abs(cd - e['date']) <= 3:
            e.update(code=code, n=int(s['n']), amt=round(float(s['amt']), 2), donors=int(s['donors']), firstTime=int(s['firstTime']), max=round(float(s['mx']), 2), ga=round(float(s['ga']), 3), firstDay=int(s['firstDay']), lastDay=int(s['lastDay']))
            seen.add(code); break
for code, s in stats.iterrows():
    if code in seen: continue
    if code in PROGRAMS:
        events.append(dict(date=int(s['firstDay']), name=PROGRAMS[code][0], location='', type='Program', code=code, host=PROGRAMS[code][1], listed=False, invited=0, confirmed=0, completed=0,
                           n=int(s['n']), amt=round(float(s['amt']), 2), donors=int(s['donors']), firstTime=int(s['firstTime']), max=round(float(s['mx']), 2), ga=round(float(s['ga']), 3), firstDay=int(s['firstDay']), lastDay=int(s['lastDay'])))
        seen.add(code)
        continue
    m = re.match(r'^(\d{4})(\d{2})(\d{2})', code) or None
    dte = None
    try:
        if re.match(r'^\d{8}_', code): dte = dt.datetime.strptime(code[:8], '%Y%m%d')
        elif re.match(r'^[A-Z]{2,4}\d{6}[A-Za-z]', code): dte = dt.datetime.strptime(re.search(r'\d{6}', code).group(0), '%m%d%y')
        elif re.match(r'^[A-Z]{2,4}\d{8}', code): dte = dt.datetime.strptime(re.search(r'\d{8}', code).group(0), '%m%d%Y')
        elif re.match(r'^\d{8}[A-Za-z]', code): dte = dt.datetime.strptime(code[:8], '%m%d%Y')
    except Exception: dte = None
    events.append(dict(date=day(dte) if dte is not None else int(s['lastDay']), name=code.replace('_', ' '), location='', type='', code=code,
                       host=host_from('', code), listed=False, invited=0, confirmed=0, completed=0,
                       n=int(s['n']), amt=round(float(s['amt']), 2), donors=int(s['donors']), firstTime=int(s['firstTime']),
                       max=round(float(s['mx']), 2), ga=round(float(s['ga']), 3), firstDay=int(s['firstDay']), lastDay=int(s['lastDay'])))

# events that exist only in the Battleground books (their own fundraisers): add them with the Battleground gifts as the room
if pbmon is not None and len(pbmon):
    pbev = pbmon[pbmon['Source Code'].map(lambda c: bool(EVENT_RX.match(str(c))) or str(c) in EVENT_CODES)]
    for code, g in pbev.groupby('Source Code'):
        if code in seen: continue
        dte = None
        try:
            if re.match(r'^[A-Z]{2,4}\d{6}[A-Za-z]', code): dte = dt.datetime.strptime(re.search(r'\d{6}', code).group(0), '%m%d%y')
            elif re.match(r'^\d{8}', code): dte = dt.datetime.strptime(code[:8], '%Y%m%d')
            elif re.match(r'^\d{6}[A-Za-z]', code): dte = dt.datetime.strptime(code[:6], '%m%d%y')
        except Exception: dte = None
        nm = CODE_NAMES.get(code)
        attendees = []
        if PART is not None and dte is not None:
            same_day = PART[PART['Event Date'].dt.date == dte.date()]
            if len(same_day):
                if not nm:
                    top = same_day.groupby('Event Name').size().sort_values(ascending=False)
                    GEN = {'fund', 'event', 'her', 'west', 'coast', 'park', 'city', 'main', 'the', 'and'}
                    toks_ = [t.lower() for t in re.findall(r'[A-Z][a-z]{2,}', code) if t.lower() not in GEN]
                    scored = sorted(((sum(1 for t in toks_ if t in n_.lower()), top[n_], n_) for n_ in top.index), reverse=True)
                    nm = scored[0][2] if scored and scored[0][0] > 0 else (top.index[0] if len(top) == 1 else None)
                if nm:
                    rows_ = same_day[same_day['Event Name'] == nm] if nm in set(same_day['Event Name']) else same_day
                    gave_v = set(g['VANID'].astype(str))
                    attendees = [dict(name=r_['Contact Name'], gave=str(r_['VANID']) in gave_v) for _, r_ in rows_.iterrows()]
        tickets = []
        if GUESTS is not None and nm and nm in set(GUESTS['Event Name']):
            for _, t_ in GUESTS[GUESTS['Event Name'] == nm].sort_values('p', ascending=False).iterrows():
                tickets.append(dict(name=t_['Contact Name'], level=str(t_['Ticket Level']), price=round(float(t_['p']), 2), guest=(t_['Guest Full Name'] if isinstance(t_['Guest Full Name'], str) else '')))
        events.append(dict(date=day(dte) if dte is not None else int(g['day'].max()), name=(nm or code.replace('_', ' ')), location='', type='Battleground event', tickets=tickets, hostTickets=sorted({t_['name'] for t_ in tickets if t_['level'].lower().startswith('host')}), code=code, host=host_from('', code), listed=False,
                           invited=0, confirmed=len(attendees), completed=0, n=0, amt=0.0, donors=0, firstTime=0, max=0.0, ga=None, firstDay=int(g['day'].min()), lastDay=int(g['day'].max()), pbgOnly=True, attendees=attendees))
        seen.add(code)
for e in events:
    if e['code'] in CODE_NAMES and not e.get('pbgOnly') and CODE_NAMES[e['code']].lower() not in e['name'].lower(): e['codeDesc'] = CODE_NAMES[e['code']]
for e in events:
    if e['code'] in MANUAL:
        e['host'] = MANUAL[e['code']].get('host', e['host']); e['hostNames'] = MANUAL[e['code']].get('hostNames', [])
        if MANUAL[e['code']].get('name'): e['name'] = MANUAL[e['code']]['name']
# host candidates: donors whose surname appears in the host string; prefer attendees of that event
by_last = {}
for vid, r in agg.iterrows():
    ln = str(r['name']).split(',')[0].strip().lower()
    by_last.setdefault(ln, []).append(vid)
for e in events:
    cands = []
    toks = [t.lower() for t in re.findall(r"[A-Za-z][A-Za-z'\-]{2,}", e['host'] or '')]
    attendees = set(bycode.groups.get(e['code'], [])) if e['code'] in bycode.groups else set()
    att_v = set(mon.loc[list(attendees), 'VANID']) if attendees else set()
    for t in toks:
        for vid in by_last.get(t, []):
            r = agg.loc[vid]
            if vid in att_v or r['total'] >= 1000:
                cands.append(dict(vanid=int(vid), name=r['name'], gave=round(float(r['total']), 2), atEvent=bool(vid in att_v)))
    cands.sort(key=lambda c: (-c['atEvent'], -c['gave']))
    if e.get('hostNames'):   # names confirmed by the finance team outrank surname guesses
        exact = []
        for hn in e['hostNames']:
            hit = agg[agg['name'].str.lower() == hn.lower()]
            for vid, r in hit.iterrows(): exact.append(dict(vanid=int(vid), name=r['name'], gave=round(float(r['total']), 2), atEvent=bool(vid in att_v), confirmed=True))
            if not len(hit) and pbmon is not None:
                pr = pb_by_name.get(hn.lower())
                if pr is not None: exact.append(dict(vanid=0, name=pr['name'], gave=round(float(pr['total']), 2), atEvent=False, confirmed=True, battleground=True))
        cands = exact + [c for c in cands if c['name'].lower() not in {x['name'].lower() for x in exact}]
    e['hostCandidates'] = cands[:6]
# ---- Battleground (leadership committee) --------------------------------------------------------
pbg = None; pb_by_vid = {}; pb_by_name = {}; best_by_name = {}
if pbmon is not None and len(pbmon):
    pbmon = pbmon[~pbmon['Contact Name'].str.lower().isin(['keisha for governor', 'keisha for governor inc'])].copy()   # transfers from the campaign are not donors
    pbmon['channel'] = pbmon['Source Code'].map(channel)
    for c_ in ['Home City', 'Home Zip/Postal', 'Employer', 'Occupation']:
        if c_ not in pbmon: pbmon[c_] = ''
    pbmon['Home Zip/Postal'] = pbmon['Home Zip/Postal'].fillna('').astype(str).str[:5]
    pg = pbmon.groupby('VANID').agg(name=('Contact Name', 'first'), state=('Home State/Province', 'first'), city=('Home City', 'first'), zip=('Home Zip/Postal', 'first'), emp=('Employer', 'first'), occ=('Occupation', 'first'), total=('net', 'sum'), n=('net', 'size'), first=('day', 'min'), last=('day', 'max'), mx=('net', 'max'))
    for vid, r in pg.iterrows():
        pb_by_vid[int(vid)] = r; pb_by_name[(str(r['name']).lower(), str(r['state']))] = r
        pb_by_name[str(r['name']).lower()] = r   # name-only fallback (best campaign record only)
        mcouple = re.match(r'^(.+?),\s*(.+?)\s+(?:and|&)\s+(.+)$', str(r['name']).strip(), re.I)   # "Williams, Lynn and Sheryl": a couple record counts for both names
        if mcouple:
            for first in (mcouple.group(2), mcouple.group(3)):
                k_ = f"{mcouple.group(1)}, {first}".lower().strip()
                if k_ not in pb_by_name: pb_by_name[k_] = r
        if str(r.get('zip', '')): pb_by_name[(str(r['name']).lower(), 'zip:' + str(r['zip']))] = r
    # the two committees are separate VAN databases (no VANID overlap), so credit a Battleground gift to the campaign's
    # highest-giving record of that exact name, not to every namesake
    best_by_name = {}
    for vid, r in agg.sort_values('total', ascending=False).iterrows():
        best_by_name.setdefault(str(r['name']).lower(), int(vid))
    pcodes = pbmon.groupby(['Source Code', 'channel']).agg(n=('net', 'size'), amt=('net', 'sum'), donors=('VANID', 'nunique')).reset_index().sort_values('amt', ascending=False)
    pmonths = {m: dict(n=int(len(g)), amt=round(float(g['net'].sum()), 2), donors=int(g['VANID'].nunique())) for m, g in pbmon.groupby('month')}
    ptot = pg['total']
    pbg = dict(asof=int(pbmon['day'].max()), rows=int(len(pbmon)), total=round(float(pbmon['net'].sum()), 2), donors=int(pbmon['VANID'].nunique()),
               inkind=round(float(pb.loc[pb['Contribution Type'] == 'In-kind Contribution', 'Amount'].sum()), 2),
               codes=[dict(code=r['Source Code'] or '(blank)', channel=r['channel'], n=int(r['n']), amt=round(float(r['amt']), 2), donors=int(r['donors'])) for _, r in pcodes.iterrows()],
               months=pmonths,
               tiers=[dict(label=l, donors=int(m.sum()), amt=round(float(ptot[m].sum()), 2)) for l, m in [('Under $1,000', ptot < 1000), ('$1,000 to $9,999', (ptot >= 1000) & (ptot < 10000)), ('$10,000 to $49,999', (ptot >= 10000) & (ptot < 50000)), ('$50,000 and up', ptot >= 50000)]],
               top=[dict(name=r['name'], state=r['state'], city=r.get('city', ''), emp=r.get('emp', ''), occ=r.get('occ', ''), total=round(float(r['total']), 2), n=int(r['n']), last=int(r['last'])) for _, r in pg.sort_values('total', ascending=False).head(300).iterrows()])
    # Battleground donors not in the campaign list at all
    camp_names = {(str(n).lower(), str(st)) for n, st in zip(agg['name'], agg['state'])}
    camp_lower = {str(n).lower() for n in agg['name']}
    pbg['onlyThere'] = [dict(name=r['name'], state=r['state'], city=r.get('city', ''), emp=r.get('emp', ''), total=round(float(r['total']), 2), n=int(r['n']), last=int(r['last'])) for _, r in pg.sort_values('total', ascending=False).iterrows() if int(_) not in agg.index and str(r['name']).lower() not in camp_lower][:500]

# ---- compliance guard -----------------------------------------------------------------------------
ORG_RX = re.compile(r'\b(LLC|L\.L\.C|Inc|Incorporated|PAC|Corp|Corporation|Company|Co\.|Associates|Group|Partners|Partnership|Committee|Fund|Trust|Foundation|Holdings|Enterprises|Services|Solutions|Church|Association|Union|Local \d+|LLP|PC|PLLC)\b', re.I)
def is_org(name): return bool(ORG_RX.search(str(name))) or (',' not in str(name))
agg['org'] = agg['name'].map(is_org)
PERIODS = [c for c in per.columns]
def plabel(p): return {'Primary': 'Primary', 'General': 'General', 'Run-off Primary': 'Primary runoff', 'Run-off General': 'General runoff'}.get(p, p)
PLIMIT = {'Primary': 8400, 'General': 8400, 'Run-off Primary': 4800, 'Run-off General': 4800}
over = []
for vid, r in agg.iterrows():
    if r['org']: continue
    for p_ in PERIODS:
        lim = PLIMIT.get(p_); amt = float(per.loc[vid, p_]) if vid in per.index else 0
        if lim and amt > lim + 0.5:
            over.append(dict(v=int(vid), name=r['name'], city=r['city'], state=r['state'], period=plabel(p_), gave=round(amt, 2), limit=lim, excess=round(amt - lim, 2), last=int(r['last'])))
over.sort(key=lambda x: -x['excess'])
# household: same surname + ZIP, individuals, combined over limit in a period (a warning, not a violation; spouses have separate limits unless funds are joint)
hh = {}
for vid, r in agg.iterrows():
    if r['org']: continue
    ln = str(r['name']).split(',')[0].strip().lower(); z = str(r['zip'])[:5]
    if not ln or not z or z == 'nan': continue
    hh.setdefault((ln, z), []).append(vid)
household = []
for (ln, z), vids in hh.items():
    if len(vids) < 2: continue
    for p_ in PERIODS:
        lim = PLIMIT.get(p_)
        if not lim: continue
        tot = float(sum(per.loc[v, p_] for v in vids if v in per.index))
        if tot >= lim * len(vids) - 0.5:   # every member at the limit: the household has nowhere left to give the campaign
            household.append(dict(household=f"{agg.loc[vids[0], 'name'].split(',')[0]} ({z})", members=[dict(v=int(v), name=agg.loc[v, 'name'], gave=round(float(per.loc[v, p_]) if v in per.index else 0, 2)) for v in vids], period=plabel(p_), gave=round(tot, 2), limit=lim, n=len(vids)))
_seen_h = set(); household = [h for h in household if not ((h['household'], h['period']) in _seen_h or _seen_h.add((h['household'], h['period'])))]
household.sort(key=lambda x: -x['gave'])
missing = []
for vid, r in agg.iterrows():
    if r['org'] or r['total'] <= 100: continue
    emp, occ = str(r['emp'] or '').strip(), str(r['occ'] or '').strip()
    no_emp_ok = occ.lower() in ('not employed', 'retired', 'homemaker', 'student', 'unemployed', 'self-employed', 'self employed', 'none')
    bad_e = (emp == '' or emp.lower() in ('nan', 'none', 'n/a', 'na', 'unknown', 'information requested')) and not no_emp_ok
    bad_o = occ == '' or occ.lower() in ('nan', 'n/a', 'na', 'unknown', 'information requested')
    if bad_e or bad_o:
        missing.append(dict(v=int(vid), name=r['name'], city=r['city'], state=r['state'], total=round(float(r['total']), 2), n=int(r['n']), last=int(r['last']), missing=('employer and occupation' if bad_e and bad_o else 'employer' if bad_e else 'occupation'), emp=emp if not bad_e else '', occ=occ if not bad_o else ''))
missing.sort(key=lambda x: -x['total'])
# possible duplicate records: same normalized name + ZIP under different VANIDs
dups = []
seen_nk = {}
for vid, r in agg.iterrows():
    k = (nk(r['name']), str(r['zip'])[:5])
    seen_nk.setdefault(k, []).append(vid)
for k, vids in seen_nk.items():
    if len(vids) > 1 and k[1] not in ('', 'nan'):
        dups.append(dict(name=agg.loc[vids[0], 'name'], zip=k[1], records=[dict(v=int(v), gave=round(float(agg.loc[v, 'total']), 2), n=int(agg.loc[v, 'n'])) for v in vids], total=round(float(sum(agg.loc[v, 'total'] for v in vids)), 2)))
dups.sort(key=lambda x: -x['total'])
refunded = mon[mon['adj'] > 0].groupby('VANID').agg(name=('Contact Name', 'first'), amt=('adj', 'sum'), n=('adj', 'size'), last=('day', 'max')).sort_values('amt', ascending=False)
compliance = dict(limits=PLIMIT, overLimit=over, household=household[:300], missingInfo=missing, duplicates=dups[:500],
                  refunds=[dict(v=int(v), name=r['name'], amt=round(float(r['amt']), 2), n=int(r['n']), last=int(r['last'])) for v, r in refunded.head(500).iterrows()],
                  counts=dict(overLimit=len(over), household=len(household), missingInfo=len(missing), missingAmt=round(float(sum(m['total'] for m in missing)), 2), duplicates=len(dups), refunds=int(len(refunded)), refundAmt=round(float(refunded['amt'].sum()), 2), uncoded=round(float(mon.loc[mon['channel'] == 'Uncoded online', 'net'].sum()), 2), uncodedN=int((mon['channel'] == 'Uncoded online').sum())))
json.dump(compliance, open('public/finance/compliance.json', 'w'), separators=(',', ':'), default=str)
print('compliance', compliance['counts'])

# ---- Battleground as filed with the Commission (until its NGP export arrives) ------------------
pbg_filed = {}
if PBG_FILED:
    K = json.load(open(PBG_FILED)); dd, dt_ = K['dict'], K['det']
    con, ret = dd['ttype'].index('Contribution'), dd['ttype'].index('Return Contribution'); xfer = dd['ctype'].index('Candidate / Candidate Committee')
    for i in range(len(dt_['tid'])):
        t = dt_['ttype'][i]
        if t not in (con, ret) or dt_['ctype'][i] == xfer: continue
        key = (nk(dd['name'][dt_['name'][i]]), dd['state'][dt_['state'][i]] or '')
        o = pbg_filed.setdefault(key, dict(total=0.0, n=0, last=-1))
        o['total'] += dt_['cents'][i] / 100
        if t == con: o['n'] += 1; o['last'] = max(o['last'], dt_['day'][i])
def filed_for(name, state):
    o = pbg_filed.get((nk(name), str(state or ''))); return round(o['total'], 2) if o else 0.0
def pbg_for(name, state):
    nm = str(name).lower()
    if nm in pb_by_name: return round(float(pb_by_name[nm]['total']), 2)
    if (nm, str(state or '')) in pb_by_name: return round(float(pb_by_name[(nm, str(state or ''))]['total']), 2)
    return filed_for(name, state)

lifetime = agg['total']
for e in events:
    g = bycode.get_group(e['code']) if e['code'] in bycode.groups else None
    e['gifts'] = []
    if g is not None:
        for _, r in g.sort_values('net', ascending=False).iterrows():
            e['gifts'].append(dict(v=int(r['VANID']), name=r['Contact Name'], city=r['Home City'], state=r['Home State/Province'], emp=r['Employer'], occ=r['Occupation'],
                                   amt=round(float(r['net']), 2), day=int(r['day']), ft=bool(r['first_time']), life=round(float(lifetime.get(r['VANID'], 0)), 2),
                                   pbg=pbg_for(r['Contact Name'], r['Home State/Province'])))
    seen_v = set(); e['pbgAmt'] = 0.0; e['pbgDonors'] = 0
    for g in e['gifts']:
        if g['v'] in seen_v: continue
        seen_v.add(g['v'])
        if g['pbg'] > 0: e['pbgAmt'] += g['pbg']; e['pbgDonors'] += 1
    e['pbgAmt'] = round(e['pbgAmt'], 2)
    e['pbgGifts'] = []
    if pbmon is not None and len(pbmon):
        pg_ = pbmon[pbmon['Source Code'] == e['code']]
        for _, r in pg_.sort_values('net', ascending=False).iterrows():
            e['pbgGifts'].append(dict(name=r['Contact Name'], amt=round(float(r['net']), 2), day=int(r['day'])))
    e['pbgCodeAmt'] = round(float(sum(g['amt'] for g in e['pbgGifts'])), 2)
    seen_v = set(); e['roomCamp'] = 0.0; e['hostLevel'] = 0
    tier = max(2500, e['max'] * 0.5)
    for g in e['gifts']:
        if g['amt'] >= tier: e['hostLevel'] += 1
        if g['v'] in seen_v: continue
        seen_v.add(g['v']); e['roomCamp'] += g['life']
    e['roomCamp'] = round(e['roomCamp'], 2); e['roomTotal'] = round(e['roomCamp'] + e['pbgAmt'] + e.get('pbgCodeAmt', 0), 2)
events.sort(key=lambda e: (e['date'] or 0))

# ---- hosts rollup ---------------------------------------------------------------------------------
hosts = {}
for e in events:
    h = e['host'] or '(no host named)'
    o = hosts.setdefault(h, dict(host=h, events=0, raised=0, donors=0, firstTime=0, codes=[], gave=None, gaveName=None))
    o['events'] += 1; o['raised'] += e['amt']; o['donors'] += e['donors']; o['firstTime'] += e['firstTime']; o['codes'].append(e['code'])
    best = next((c for c in e['hostCandidates'] if c['atEvent']), None)
    if best and o['gave'] is None: o['gave'] = best['gave']; o['gaveName'] = best['name']
hosts = sorted(hosts.values(), key=lambda h: -h['raised'])

# ---- channels, source codes, months -----------------------------------------------------------
codes = mon.groupby(['Source Code', 'channel']).agg(n=('net', 'size'), amt=('net', 'sum'), donors=('VANID', 'nunique'), first=('day', 'min'), last=('day', 'max')).reset_index()
codes = [dict(code=r['Source Code'] or '(blank)', channel=r['channel'], n=int(r['n']), amt=round(float(r['amt']), 2), donors=int(r['donors']), first=int(r['first']), last=int(r['last'])) for _, r in codes.sort_values('amt', ascending=False).iterrows()]
channels = mon.groupby('channel').agg(n=('net', 'size'), amt=('net', 'sum'), donors=('VANID', 'nunique'), firstTime=('first_time', 'sum')).reset_index()
channels = [dict(channel=r['channel'], n=int(r['n']), amt=round(float(r['amt']), 2), donors=int(r['donors']), firstTime=int(r['firstTime'])) for _, r in channels.sort_values('amt', ascending=False).iterrows()]
months = {}
for m, g in mon.groupby('month'):
    months[m] = dict(n=int(len(g)), amt=round(float(g['net'].sum()), 2), donors=int(g['VANID'].nunique()), newDonors=int(g['first_time'].sum()),
                     byChannel={k: round(float(v), 2) for k, v in g.groupby('channel')['net'].sum().items()})

# ---- tiers ----------------------------------------------------------------------------------------
tot = agg['total']
tiers = [('Under $100', tot < 100), ('$100 to $999', (tot >= 100) & (tot < 1000)), ('$1,000 to $8,399', (tot >= 1000) & (tot < LIMIT)), ('$8,400 and up', tot >= LIMIT)]
tiers = [dict(label=l, donors=int(m.sum()), amt=round(float(tot[m].sum()), 2)) for l, m in tiers]

# ---- reconciliation against the Commission filing ------------------------------------------------
recon = None
allm = d[d['Contribution Type'] != 'Refund of Expenditure'].groupby('month')['net'].sum()
if COMM:
    K = json.load(open(COMM))
    cm = {}
    for k, v in K['meta'].get('monthly', {}).items():
        idx = int(k); y, mth = divmod(idx, 12); cm[f'{y}-{mth + 1:02d}'] = v
    recon = dict(commission=dict(gross=K['meta']['gross'], net=K['meta']['net'], inkind=K['meta']['inkind'], unitemized=K['meta']['unitemized'], itemized=K['meta']['itemized'], lastDay=K['meta']['lastDay'], donors=K['meta']['donors']),
                 ngp=dict(gross=round(float(mon['Amount'].sum()), 2), refunds=round(float(mon['adj'].sum()), 2), net=round(float(mon['net'].sum()), 2),
                          inkind=round(float(d.loc[d['Contribution Type'] == 'In-kind Contribution', 'Amount'].sum()), 2), donors=int(mon['VANID'].nunique()),
                          under100=round(float(tot[tot <= 100].sum()), 2), over100=round(float(tot[tot > 100].sum()), 2), lastDay=int(mon['day'].max())),
                 months=[dict(month=m, ngp=months.get(m, {}).get('amt', 0), ngpAll=round(float(allm.get(m, 0)), 2), commission=round(float(cm.get(m, 0)), 2)) for m in sorted(set(months) | set(cm))])

def lead_for(vid, r):
    kz = (str(r['name']).lower(), 'zip:' + str(r['zip'])[:5])
    if kz in pb_by_name: return pb_by_name[kz]['total']
    k = (str(r['name']).lower(), str(r['state']))
    if k in pb_by_name: return pb_by_name[k]['total']
    nm = str(r['name']).lower()
    if nm in pb_by_name and best_by_name.get(nm) == vid: return pb_by_name[nm]['total']
    return 0.0
# ---- donors list ----------------------------------------------------------------------------------
host_vids = {c['vanid'] for e in events for c in e['hostCandidates']}
lead_vids = set(pb_by_vid) | {best_by_name[n] for n in best_by_name if n in pb_by_name}
keep = agg[(agg['total'] >= 250) | agg['events'].notna() | agg.index.isin(host_vids) | agg.index.isin(lead_vids)]
donors = []
for vid, r in keep.iterrows():
    donors.append(dict(v=int(vid), name=r['name'], city=r['city'], state=r['state'], zip=str(r['zip']) if pd.notna(r['zip']) else '', emp=r['emp'], occ=r['occ'],
                       total=round(float(r['total']), 2), n=int(r['n']), first=int(r['first']), last=int(r['last']), max=round(float(r['mx']), 2),
                       pri=round(float(r['pri']), 2), gen=round(float(r['gen']), 2), events=r['events'] if isinstance(r['events'], list) else [],
                       ch=r['topChannel'], rec=bool(r['recurring']),
                       lead=round(float(lead_for(int(vid), r)), 2),
                       pbgFiled=filed_for(r['name'], r['state'])))

attributions = []
if ATTR is not None and len(ATTR):
    ATTR['amt'] = pd.to_numeric(ATTR['Attribution Amount'], errors='coerce').fillna(0)
    for (nm_, code_), g_ in ATTR.groupby(['Contact Name', 'Source Code']):
        attributions.append(dict(name=nm_, code=code_, amt=round(float(g_['amt'].sum()), 2), n=int(len(g_)), committee='Project Battleground Georgia'))
out = dict(attributions=attributions, generated=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'), asof=int(mon['day'].max()), rows=int(len(mon)), total=round(float(mon['net'].sum()), 2),
           donors=int(mon['VANID'].nunique()), recurring=int(len(rec)), recurringAmt=round(float(mon[mon['VANID'].isin(rec)]['net'].sum()), 2),
           tiers=tiers, channels=channels, codes=codes, months=months, events=events, hosts=hosts, recon=recon, pbg=pbg, pbgFiled=bool(pbg_filed), list=donors)
json.dump(out, open(OUT, 'w'), separators=(',', ':'), default=str)
print('events', len(events), 'hosts', len(hosts), 'donors listed', len(donors), 'bytes', len(open(OUT).read()))
