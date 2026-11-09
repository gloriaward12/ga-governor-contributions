#!/usr/bin/env python3
"""Governing-phase screens: join the donor record to state vendors, registered lobbyists and board appointees.

usage: python3 -I scripts/build_screens.py <contrib.pkl|xlsx> <pbg_filed.json> <vendor_payments.csv> <lobbyists.csv> [appointments.json]
writes public/finance/screens.json (no emails, phones or street addresses).
"""
import sys, re, json, datetime as dt
import pandas as pd, numpy as np

SRC, PBGF, VEND, LOBF = sys.argv[1:5]
BOARDS = sys.argv[5] if len(sys.argv) > 5 else None
OUT = 'public/finance/screens.json'
EPOCH = dt.date(2025, 1, 1)
day = lambda d: (d.date() - EPOCH).days if pd.notna(d) else None

SUFFIX = re.compile(r'\b(INCORPORATED|INC|LLC|L L C|LLP|LP|PLLC|PC|P C|CORPORATION|CORP|CO|COMPANY|LTD|LIMITED|THE|OF|AND|&|GROUP|HOLDINGS|ENTERPRISES|INTERNATIONAL|INTL|USA|US|AMERICA|NA|N A|DBA)\b')
def orgkey(s):
    s = str(s or '').upper().replace('&', ' AND ')
    s = re.sub(r'[^A-Z0-9 ]', ' ', s)
    s = SUFFIX.sub(' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s
def personkey(last, first):
    n = lambda x: re.sub(r'[^A-Z]', '', str(x or '').upper())
    return n(last) + '|' + n(first)[:5]
def personkey_from_contact(name):   # "Last, First M"
    name = str(name or '')
    if ',' not in name: return None
    last, first = name.split(',', 1)
    return personkey(last.strip(), first.strip().split(' ')[0])
def is_person(name): return ',' in str(name or '')

# ---- donors: campaign books (NGP) + Battleground as filed --------------------------------------------
d = pd.read_pickle(SRC) if SRC.endswith('.pkl') else pd.read_excel(SRC)
d = d[pd.to_numeric(d['Contribution ID'], errors='coerce').notna()].copy()
for c in ['Contact Name', 'Home City', 'Home State/Province', 'Employer', 'Occupation', 'Contribution Type']:
    d[c] = d[c].fillna('').astype(str).str.strip()
d['Amount'] = pd.to_numeric(d['Amount'], errors='coerce').fillna(0); d['adj'] = pd.to_numeric(d['Total Adjusted Amount'], errors='coerce').fillna(0); d['net'] = d['Amount'] - d['adj']
d['Date Received'] = pd.to_datetime(d['Date Received'], errors='coerce'); d['day'] = d['Date Received'].map(day)
mon = d[d['Contribution Type'] == 'Monetary Contribution']
don = mon.groupby('VANID').agg(name=('Contact Name', 'first'), city=('Home City', 'first'), state=('Home State/Province', 'first'), emp=('Employer', 'first'), occ=('Occupation', 'first'), total=('net', 'sum'), n=('net', 'size'), last=('day', 'max')).reset_index()
don['person'] = don['name'].map(is_person)
don['pkey'] = don['name'].map(personkey_from_contact)
don['okey'] = don['name'].map(lambda s: orgkey(s) if not is_person(s) else '')
don['ekey'] = don['emp'].map(orgkey)

K = json.load(open(PBGF)); dd, dt_ = K['dict'], K['det']
con, ret = dd['ttype'].index('Contribution'), dd['ttype'].index('Return Contribution'); xfer = dd['ctype'].index('Candidate / Candidate Committee')
pb = {}
for i in range(len(dt_['tid'])):
    t = dt_['ttype'][i]
    if t not in (con, ret) or dt_['ctype'][i] == xfer: continue
    nm = dd['name'][dt_['name'][i]]; st = dd['state'][dt_['state'][i]] or ''
    o = pb.setdefault((nm, st), dict(name=nm, state=st, city=dd['city'][dt_['city'][i]], emp=dd['emp'][dt_['emp'][i]] if 'emp' in dd else '', total=0.0, n=0, last=-1))
    o['total'] += dt_['cents'][i] / 100
    if t == con: o['n'] += 1; o['last'] = max(o['last'], dt_['day'][i])
pbg = pd.DataFrame(list(pb.values()))
pbg['person'] = pbg['name'].map(is_person); pbg['pkey'] = pbg['name'].map(personkey_from_contact); pbg['okey'] = pbg['name'].map(lambda s: orgkey(s) if not is_person(s) else ''); pbg['ekey'] = pbg['emp'].map(orgkey)

def giving_for_person(pk):
    a = don[(don['pkey'] == pk) & don['person']]; b = pbg[(pbg['pkey'] == pk) & pbg['person']] if len(pbg) else pbg
    return float(a['total'].sum()), float(b['total'].sum()), int(len(a) + len(b)), (a['name'].iloc[0] if len(a) else (b['name'].iloc[0] if len(b) else ''))
def giving_for_org(ok):
    if not ok: return 0.0, 0.0, 0.0, 0.0, 0, []
    a = don[don['okey'] == ok]; b = pbg[pbg['okey'] == ok] if len(pbg) else pbg
    ea = don[(don['ekey'] == ok) & don['person']]; eb = pbg[(pbg['ekey'] == ok) & pbg['person']] if len(pbg) else pbg
    names = list(ea.sort_values('total', ascending=False)['name'].head(8))
    return float(a['total'].sum()), float(b['total'].sum()), float(ea['total'].sum()), float(eb['total'].sum()), int(ea['VANID'].nunique() + len(eb)), names

# ---- vendors ------------------------------------------------------------------------------------------
v = pd.read_csv(VEND, dtype=str)
v['amt'] = pd.to_numeric(v['Total Payment Amount'], errors='coerce').fillna(0); v['n'] = pd.to_numeric(v['Total Payments'], errors='coerce').fillna(0)
v = v[~v['Vendor Name'].isin(['SALARIES', 'BENEFITS'])]
vend = v.groupby('Vendor Name').agg(amt=('amt', 'sum'), n=('n', 'sum'), agencies=('Organization', lambda s: sorted(set(s)))).reset_index()
fy = v.pivot_table(index='Vendor Name', columns='FiscalYear', values='amt', aggfunc='sum', fill_value=0)
vend['fy2024'] = vend['Vendor Name'].map(fy.get('2024', pd.Series(dtype=float))).fillna(0); vend['fy2025'] = vend['Vendor Name'].map(fy.get('2025', pd.Series(dtype=float))).fillna(0)
vend['person'] = vend['Vendor Name'].str.match(r"^[A-Z'\-\. ]+,[A-Z'\-\. ]+$", na=False)
vend['okey'] = vend['Vendor Name'].map(lambda s: '' if re.match(r"^[A-Z'\-\. ]+,[A-Z'\-\. ]+$", s) else orgkey(s))
vend['pkey'] = vend['Vendor Name'].map(lambda s: personkey_from_contact(s) if ',' in s else None)
okeys_don = set(don['okey']) | set(pbg['okey']); ekeys_don = set(don['ekey']) | set(pbg['ekey']); pkeys_don = set(don['pkey'].dropna()) | set(pbg['pkey'].dropna())
vendor_hits = []
vend_org = vend[~vend['person'] & (vend['okey'].str.len() >= 4)].groupby('okey').agg(names=('Vendor Name', lambda s: sorted(set(s), key=len)), amt=('amt', 'sum'), fy2024=('fy2024', 'sum'), fy2025=('fy2025', 'sum'), agencies=('agencies', lambda s: sorted(set(x for xs in s for x in xs)))).reset_index()
for _, r in vend_org.iterrows():
    ok = r['okey']
    direct = ok in okeys_don; emp = ok in ekeys_don
    if not (direct or emp): continue
    c, p, ec, ep, ne, names = giving_for_org(ok)
    if (c + p) > 0:
        kind = 'gave directly'
    elif r['amt'] >= 250000 and (ec + ep) >= 2500:
        kind = 'employees gave'
    else:
        continue
    vendor_hits.append(dict(vendor=r['names'][0], aliases=r['names'][1:5], kind=kind, paid=round(float(r['amt']), 2), fy2024=round(float(r['fy2024']), 2), fy2025=round(float(r['fy2025']), 2), agencies=r['agencies'][:6], nAgencies=len(r['agencies']), gaveCamp=round(c, 2), gavePbg=round(p, 2), employees=ne, employeeCamp=round(ec, 2), employeePbg=round(ep, 2), names=names))
pk_counts = don[don['person']].groupby('pkey').size()
for _, r in vend[vend['person']].iterrows():
    if ' OR ' in r['Vendor Name'] or all('FAMILY & CHILDREN' in a for a in r['agencies']): continue   # household benefit payments, not vendors
    if r['pkey'] in pkeys_don and r['amt'] >= 10000 and pk_counts.get(r['pkey'], 0) <= 1:
        c, p, nrec, nm = giving_for_person(r['pkey'])
        if c + p >= 200: vendor_hits.append(dict(vendor=r['Vendor Name'], aliases=[], kind='individual paid by the state', paid=round(float(r['amt']), 2), fy2024=round(float(r['fy2024']), 2), fy2025=round(float(r['fy2025']), 2), agencies=r['agencies'][:6], nAgencies=len(r['agencies']), gaveCamp=round(c, 2), gavePbg=round(p, 2), employees=0, employeeCamp=0, employeePbg=0, names=[nm]))
ORDER = {'gave directly': 0, 'individual paid by the state': 1, 'employees gave': 2}
vendor_hits.sort(key=lambda x: (ORDER[x['kind']], -(x['gaveCamp'] + x['gavePbg'] + x['employeeCamp'] + x['employeePbg'])))
print('vendors', len(vend), 'hits', len(vendor_hits))

# ---- lobbyists ------------------------------------------------------------------------------------------
l = pd.read_csv(LOBF, skiprows=1, dtype=str).fillna('')
l['pkey'] = [personkey(a, b) for a, b in zip(l['Lobbyist Last Name'], l['Lobbyist First Name'])]
l['ckey'] = l['Lobbyist on Behalf of'].map(orgkey)
l['active'] = l['Terminated On'].str.strip() == ''
lob_people = l.groupby('pkey').agg(last=('Lobbyist Last Name', 'first'), first=('Lobbyist First Name', 'first'), city=('Lobbyist City', 'first'), clients=('Lobbyist on Behalf of', lambda s: sorted(set(x for x in s if x))), active=('active', 'any')).reset_index()
lob_hits = []
for _, r in lob_people.iterrows():
    if r['pkey'] not in pkeys_don: continue
    c, p, nrec, nm = giving_for_person(r['pkey'])
    if c + p <= 0: continue
    lob_hits.append(dict(lobbyist=f"{r['last']}, {r['first']}", donorName=nm, city=r['city'], clients=r['clients'][:40], nClients=len(r['clients']), active=bool(r['active']), gaveCamp=round(c, 2), gavePbg=round(p, 2)))
lob_hits.sort(key=lambda x: -(x['gaveCamp'] + x['gavePbg']))
clients = l.groupby('ckey').agg(client=('Lobbyist on Behalf of', 'first'), lobbyists=('pkey', 'nunique'), names=('Lobbyist Last Name', lambda s: sorted(set(s))[:10])).reset_index()
client_hits = []
for _, r in clients.iterrows():
    ok = r['ckey']
    if not ok or len(ok) < 4: continue
    if ok not in okeys_don and ok not in ekeys_don: continue
    c, p, ec, ep, ne, names = giving_for_org(ok)
    if c + p + ec + ep <= 0: continue
    client_hits.append(dict(client=r['client'], lobbyists=int(r['lobbyists']), gaveCamp=round(c, 2), gavePbg=round(p, 2), employees=ne, employeeCamp=round(ec, 2), employeePbg=round(ep, 2), names=names))
client_hits.sort(key=lambda x: -(x['gaveCamp'] + x['gavePbg'] + x['employeeCamp'] + x['employeePbg']))
print('lobbyists', len(lob_people), 'who gave', len(lob_hits), 'clients', len(clients), 'client hits', len(client_hits))

# ---- boards --------------------------------------------------------------------------------------------
board_hits = []; boards_n = 0
if BOARDS:
    B = json.load(open(BOARDS)); boards_n = len(B)
    for a in B:
        nm = str(a.get('name', '')).strip()
        parts = nm.replace('Dr. ', '').replace('Judge ', '').split(' ')
        if len(parts) < 2: continue
        pk = personkey(parts[-1].rstrip(',').replace('Jr.', '').replace('Sr.', '').strip() or parts[-2], parts[0])
        if len(parts) >= 3 and parts[-1] in ('Jr.', 'Sr.', 'II', 'III', 'IV'): pk = personkey(parts[-2].rstrip(','), parts[0])
        if pk not in pkeys_don: continue
        c, p, nrec, dn = giving_for_person(pk)
        if c + p <= 0: continue
        board_hits.append(dict(name=nm, donorName=dn, board=a.get('board', ''), reappointed=bool(a.get('reappointed')), date=a.get('date', ''), bio=(a.get('bio') or '')[:160], url=a.get('url', ''), gaveCamp=round(c, 2), gavePbg=round(p, 2)))
    board_hits.sort(key=lambda x: -(x['gaveCamp'] + x['gavePbg']))
    print('appointments', boards_n, 'appointees who gave', len(board_hits))

# ---- search index: every vendor over $25K, every lobbyist and client, every appointee --------------------
vend_idx = [dict(v=r['Vendor Name'], paid=round(float(r['amt']), 2), ag=len(r['agencies'])) for _, r in vend[vend['amt'] >= 100000].iterrows()]
lob_idx = [dict(l=f"{r['last']}, {r['first']}", c=r['clients'][:12], a=bool(r['active'])) for _, r in lob_people.iterrows()]
cli_idx = [dict(c=r['client'], n=int(r['lobbyists'])) for _, r in clients.iterrows() if r['client']]
brd_idx = [dict(n=a.get('name', ''), b=a.get('board', ''), d=a.get('date', ''), r=bool(a.get('reappointed'))) for a in (json.load(open(BOARDS)) if BOARDS else [])]
pbg_idx = [dict(n=r['name'], s=r['state'], t=round(float(r['total']), 2)) for _, r in pbg.sort_values('total', ascending=False).iterrows() if r['total'] >= 100]

out = dict(generated=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'), asof=int(mon['day'].max()),
           sources=dict(vendors='Open Georgia payments, FY2024 and FY2025, state agencies and authorities (salary and benefit lines excluded)', lobbyists='Georgia Government Transparency and Campaign Finance Commission, 2026 lobbyist index (PeachFile)', boards='Governor\'s office appointment announcements, 2019 to 2026' if BOARDS else 'not loaded'),
           counts=dict(vendors=int(len(vend)), vendorHits=len(vendor_hits), lobbyists=int(len(lob_people)), lobbyistHits=len(lob_hits), clients=int(len(clients)), clientHits=len(client_hits), appointments=boards_n, boardHits=len(board_hits)),
           vendors=vendor_hits, lobbyists=lob_hits, clients=client_hits, boards=board_hits,
           index=dict(vendors=vend_idx, lobbyists=lob_idx, clients=cli_idx, boards=brd_idx, pbg=pbg_idx))
json.dump(out, open(OUT, 'w'), separators=(',', ':'), default=str)
print('bytes', len(open(OUT).read()), out['counts'])
