#!/usr/bin/env python3
"""Download every episode that still has a driveId in episodes.json to <outdir>/<id>.m4a.

    python3 scripts/fetch_drive.py <outdir>

Use this when Drive for desktop isn't available; then run sync_audio.py on <outdir>.
Files must be shared "Anyone with the link".
"""
import json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
os.makedirs(out, exist_ok=True)
eps = json.load(open(os.path.join(ROOT, "episodes.json"), encoding="utf-8"))["episodes"]
for e in eps:
    if not e.get("driveId"):
        continue
    dst = os.path.join(out, e["id"] + ".m4a")
    if os.path.exists(dst) and os.path.getsize(dst) > 1_000_000:
        print("have ", e["id"]); continue
    url = "https://drive.usercontent.google.com/download?id=%s&export=download&confirm=t" % e["driveId"]
    with urllib.request.urlopen(url, timeout=300) as r:
        ctype = r.headers.get("Content-Type", "")
        if not ctype.startswith(("audio/", "video/", "application/octet-stream")):
            print("FAIL ", e["id"], "got", ctype, "(not shared publicly?)"); continue
        with open(dst + ".part", "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b: break
                f.write(b)
    os.replace(dst + ".part", dst)
    print("got  ", e["id"], "%.1f MB" % (os.path.getsize(dst) / 1e6))
