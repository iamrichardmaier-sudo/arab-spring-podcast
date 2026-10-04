#!/usr/bin/env python3
"""Inline scriptable/src/player.html into scriptable/AS-Player.js (the TEMPLATE line).

Edit the HTML, then run: python3 scripts/build_player.py
AS-Player.js stays a single self-contained file you paste into Scriptable.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(ROOT, "scriptable", "src", "player.html"), encoding="utf-8").read()
js_path = os.path.join(ROOT, "scriptable", "AS-Player.js")
js = open(js_path, encoding="utf-8").read()
line = "const TEMPLATE = " + json.dumps(html, ensure_ascii=True) + ";"
new, n = re.subn(r"^const TEMPLATE = .*;$", lambda m: line, js, count=1, flags=re.M)
if n != 1:
    sys.exit("TEMPLATE line not found in AS-Player.js")
open(js_path, "w", encoding="utf-8").write(new)
print("AS-Player.js rebuilt (%d KB)" % (len(new) // 1024))
