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
SRC, EVF = args[0], args[1]
COMM = args[2] if len(args) > 2 else None
OUT = 'public/finance/ngp.json'
EPOCH = dt.date(2025, 1, 1)
day = lambda d: (d.date() - EPOCH).days if pd.notna(d) else None
LIMIT = 8400

def load_export(path):
    d = pd.read_pickle(path) if path.endswith('.pkl') else pd.read_excel(path)
    d = d[pd.to_numeric(d['Contribution ID'], errors='coerce').notna()].copy()
    for c in ['Source Code', 'Designation', 'Contribution Type', 'Payment Method', 'Period', 'Home State/Province', 'Home City', 'Employer', 'Occupation', 'Contact Name']:
        if c not in d: d[c] = ''
        d[c] = d[c].fillna('').astype(str).str.strip().replace({'nan': ''})
    d['Amount'] = pd.to_numeric(d['Amount'], errors='coerce').fillna(0)
    d['adj'] = pd.to_numeric(d.get('Total Adjusted Amount', 0), errors='coerce').fillna(0)
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
for code, s in stats.iterrows():
    if code in seen: continue
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
    e['hostCandidates'] = cands[:6]
lifetime = agg['total']
for e in events:
    g = bycode.get_group(e['code']) if e['code'] in bycode.groups else None
    e['gifts'] = []
    if g is not None:
        for _, r in g.sort_values('net', ascending=False).iterrows():
            e['gifts'].append(dict(v=int(r['VANID']), name=r['Contact Name'], city=r['Home City'], state=r['Home State/Province'], emp=r['Employer'], occ=r['Occupation'],
                                   amt=round(float(r['net']), 2), day=int(r['day']), ft=bool(r['first_time']), life=round(float(lifetime.get(r['VANID'], 0)), 2)))
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

# ---- Battleground (leadership committee) --------------------------------------------------------
pbg = None; pb_by_vid = {}; pb_by_name = {}
if pbmon is not None and len(pbmon):
    pbmon['channel'] = pbmon['Source Code'].map(channel)
    pg = pbmon.groupby('VANID').agg(name=('Contact Name', 'first'), state=('Home State/Province', 'first'), total=('net', 'sum'), n=('net', 'size'), first=('day', 'min'), last=('day', 'max'), mx=('net', 'max'))
    for vid, r in pg.iterrows():
        pb_by_vid[int(vid)] = r; pb_by_name[(str(r['name']).lower(), str(r['state']))] = r
    pcodes = pbmon.groupby(['Source Code', 'channel']).agg(n=('net', 'size'), amt=('net', 'sum'), donors=('VANID', 'nunique')).reset_index().sort_values('amt', ascending=False)
    pmonths = {m: dict(n=int(len(g)), amt=round(float(g['net'].sum()), 2), donors=int(g['VANID'].nunique())) for m, g in pbmon.groupby('month')}
    ptot = pg['total']
    pbg = dict(asof=int(pbmon['day'].max()), rows=int(len(pbmon)), total=round(float(pbmon['net'].sum()), 2), donors=int(pbmon['VANID'].nunique()),
               inkind=round(float(pb.loc[pb['Contribution Type'] == 'In-kind Contribution', 'Amount'].sum()), 2),
               codes=[dict(code=r['Source Code'] or '(blank)', channel=r['channel'], n=int(r['n']), amt=round(float(r['amt']), 2), donors=int(r['donors'])) for _, r in pcodes.iterrows()],
               months=pmonths,
               tiers=[dict(label=l, donors=int(m.sum()), amt=round(float(ptot[m].sum()), 2)) for l, m in [('Under $1,000', ptot < 1000), ('$1,000 to $9,999', (ptot >= 1000) & (ptot < 10000)), ('$10,000 to $49,999', (ptot >= 10000) & (ptot < 50000)), ('$50,000 and up', ptot >= 50000)]],
               top=[dict(name=r['name'], state=r['state'], total=round(float(r['total']), 2), n=int(r['n']), last=int(r['last'])) for _, r in pg.sort_values('total', ascending=False).head(300).iterrows()])
    # Battleground donors not in the campaign list at all
    camp_names = {(str(n).lower(), str(st)) for n, st in zip(agg['name'], agg['state'])}
    pbg['onlyThere'] = [dict(name=r['name'], state=r['state'], total=round(float(r['total']), 2), n=int(r['n']), last=int(r['last'])) for _, r in pg.sort_values('total', ascending=False).iterrows() if int(_) not in agg.index and (str(r['name']).lower(), str(r['state'])) not in camp_names][:500]

# ---- donors list ----------------------------------------------------------------------------------
host_vids = {c['vanid'] for e in events for c in e['hostCandidates']}
lead_vids = set(pb_by_vid)
keep = agg[(agg['total'] >= 250) | agg['events'].notna() | agg.index.isin(host_vids) | agg.index.isin(lead_vids)]
donors = []
for vid, r in keep.iterrows():
    donors.append(dict(v=int(vid), name=r['name'], city=r['city'], state=r['state'], zip=str(r['zip']) if pd.notna(r['zip']) else '', emp=r['emp'], occ=r['occ'],
                       total=round(float(r['total']), 2), n=int(r['n']), first=int(r['first']), last=int(r['last']), max=round(float(r['mx']), 2),
                       pri=round(float(r['pri']), 2), gen=round(float(r['gen']), 2), events=r['events'] if isinstance(r['events'], list) else [],
                       ch=r['topChannel'], rec=bool(r['recurring']),
                       lead=round(float((pb_by_vid.get(int(vid)) if int(vid) in pb_by_vid else pb_by_name.get((str(r['name']).lower(), str(r['state'])), {'total': 0}))['total']), 2)))

out = dict(generated=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'), asof=int(mon['day'].max()), rows=int(len(mon)), total=round(float(mon['net'].sum()), 2),
           donors=int(mon['VANID'].nunique()), recurring=int(len(rec)), recurringAmt=round(float(mon[mon['VANID'].isin(rec)]['net'].sum()), 2),
           tiers=tiers, channels=channels, codes=codes, months=months, events=events, hosts=hosts, recon=recon, pbg=pbg, list=donors)
json.dump(out, open(OUT, 'w'), separators=(',', ':'), default=str)
print('events', len(events), 'hosts', len(hosts), 'donors listed', len(donors), 'bytes', len(open(OUT).read()))
