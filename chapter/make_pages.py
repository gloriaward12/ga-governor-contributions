#!/usr/bin/env python3
"""Emit one HTML page per module from a shared skeleton."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
PAGES = [('index', 'ops', 'Operations'), ('watch', 'watch', 'Predecessor watch'), ('inventory', 'inventory', 'Inventory'), ('appointments', 'appointments', 'Appointments'),
         ('budget', 'budget', 'Budget sprint'), ('advisors', 'advisors', 'Advisors'), ('intake', 'intake', 'Intake'), ('guide', 'guide', 'Guide & roadmap')]
TPL = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>{title} · Chapter</title><link rel="stylesheet" href="app.css?v={v}"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='4' fill='%230B2545'/%3E%3Ctext x='16' y='22' font-family='IBM Plex Sans,Arial' font-size='18' font-weight='600' fill='%23fff' text-anchor='middle'%3EC%3C/text%3E%3C/svg%3E"></head>
<body><div class="shell"><nav id="nav" class="nav"></nav><div class="main"><header id="top" class="top"></header><main id="page" class="page"><div class="note">Loading…</div></main></div></div>
<script src="app.js?v={v}"></script><script src="pages/{pid}.js?v={v}"></script>
<script>loadData().then(() => {{ if (shell('{pid}', '{title}')) render(); }}).catch(e => {{ document.getElementById('page').innerHTML = '<div class="banner red">Could not load Chapter’s data: ' + esc(e.message) + '</div>'; }});</script>
</body></html>"""
import time
v = str(int(time.time()))[-6:]
for fname, pid, title in PAGES:
    open(os.path.join(HERE, fname + '.html'), 'w').write(TPL.format(title=title, pid=pid, v=v))
print('pages written', v)
