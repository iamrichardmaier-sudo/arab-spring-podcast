#!/usr/bin/env python3
"""Sync <episode-id>.m4a files from a local folder to GitHub Pages.

    python3 scripts/sync_audio.py "<folder with id.m4a files>" [options]

Steps:
  1. Match files named <id>.(m4a|mp3|aac|wav|ogg) against the IDs in episodes.json
     (unknown names such as "-alt" takes or "(1)" duplicates are skipped with a warning).
  2. Re-encode each to mono AAC ~56 kbps with faststart -> audio/<id>.m4a (about 8 MB / 20 min).
  3. git pull --rebase, set "audio" = "audio/<id>.m4a" and clear "driveId" for hosted
     episodes in episodes.json (nothing else is touched), commit, push.
  4. Verify each published URL: HTTP 206 on a Range request, Content-Type audio/*,
     and headless Chromium new Audio() reaching loadedmetadata with the right duration.

Options:
  --no-push       encode and update episodes.json locally, but do not commit/push/verify live
  --verify-only   skip encoding/committing; just verify every episode whose audio is hosted
  --force         re-encode even if audio/<id>.m4a is newer than the source
  --base URL      Pages base URL to verify against (default: the project's Pages URL)
  --branch NAME   branch to push to (default: main, which is what Pages serves)
  --no-browser    skip the headless Chromium check
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EPISODES = os.path.join(ROOT, "episodes.json")
AUDIO_DIR = os.path.join(ROOT, "audio")
DEFAULT_BASE = "https://iamrichardmaier-sudo.github.io/arab-spring-podcast/"
EXTS = ("m4a", "mp3", "aac", "wav", "ogg")
BITRATE = "56k"


def log(msg):
    print(msg, flush=True)


def run(cmd, check=True, capture=False, cwd=ROOT):
    r = subprocess.run(cmd, cwd=cwd, text=True,
                       stdout=subprocess.PIPE if capture else None,
                       stderr=subprocess.PIPE if capture else None)
    if check and r.returncode != 0:
        err = (r.stderr or "").strip() if capture else ""
        raise RuntimeError("command failed (%d): %s\n%s" % (r.returncode, " ".join(cmd), err))
    return r


def probe(path):
    """Return (duration_seconds, has_audio) using ffprobe."""
    net = []
    if re.match(r"^https?://", path):
        # ffprobe ignores the usual proxy/CA environment variables; pass them explicitly if set.
        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
        ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("CURL_CA_BUNDLE")
        if proxy:
            net += ["-http_proxy", proxy]
        if ca and path.startswith("https"):
            net += ["-ca_file", ca]
    r = run(["ffprobe", "-v", "error"] + net + ["-show_entries", "format=duration:stream=codec_type",
             "-of", "json", path], check=False, capture=True)
    if r.returncode != 0:
        return 0.0, False
    j = json.loads(r.stdout or "{}")
    dur = float(j.get("format", {}).get("duration") or 0)
    has_audio = any(s.get("codec_type") == "audio" for s in j.get("streams", []))
    return dur, has_audio


def load_episodes():
    with open(EPISODES, encoding="utf-8") as f:
        return json.load(f)


def save_episodes(data):
    # Same compact one-line format the file already uses; key order is preserved.
    with open(EPISODES, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")))


def find_sources(folder, ids):
    found, skipped = {}, []
    for name in sorted(os.listdir(folder)):
        path = os.path.join(folder, name)
        if not os.path.isfile(path) or name.startswith("."):
            continue
        m = re.match(r"^(.+)\.(%s)$" % "|".join(EXTS), name, re.I)
        if not m:
            continue
        stem = m.group(1).strip().lower()
        if stem not in ids:
            skipped.append(name)
            continue
        if stem in found:
            # prefer m4a over other formats if both exist
            if not found[stem].lower().endswith(".m4a"):
                found[stem] = path
            continue
        found[stem] = path
    return found, skipped


def encode(src, dst):
    tmp = dst + ".tmp.m4a"
    run(["ffmpeg", "-y", "-v", "error", "-i", src, "-vn", "-map_metadata", "-1",
         "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", BITRATE,
         "-movflags", "+faststart", tmp])
    os.replace(tmp, dst)


def git_push(branch, message, paths):
    run(["git", "add", "--"] + paths)
    if run(["git", "diff", "--cached", "--quiet"], check=False).returncode == 0:
        log("Nothing new to commit.")
        return False
    run(["git", "commit", "-m", message])
    delay = 2
    for attempt in range(5):
        r = run(["git", "push", "-u", "origin", "HEAD:" + branch], check=False, capture=True)
        if r.returncode == 0:
            log("Pushed to origin/%s." % branch)
            return True
        err = r.stderr or ""
        if "rejected" in err or "fetch first" in err or "non-fast-forward" in err:
            log("Push rejected (someone else pushed). Rebasing and retrying...")
            run(["git", "pull", "--rebase", "origin", branch])
            continue
        log("Push failed (attempt %d): %s" % (attempt + 1, err.strip().splitlines()[-1:] or ""))
        time.sleep(delay)
        delay *= 2
    raise RuntimeError("git push failed after retries")


def head_range(url):
    """Return (status, content_type, total_length) for a bytes=0-99 Range request."""
    req = urllib.request.Request(url, headers={"Range": "bytes=0-99", "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            cr = r.headers.get("Content-Range", "")
            total = int(cr.split("/")[-1]) if "/" in cr and cr.split("/")[-1].isdigit() else None
            return r.status, r.headers.get("Content-Type", ""), total
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), None
    except Exception as e:  # network error
        return 0, str(e), None


def browser_check(urls):
    """Run scripts/verify_audio.mjs; returns {url: {ok, duration, error}}."""
    script = os.path.join(ROOT, "scripts", "verify_audio.mjs")
    if not shutil.which("node"):
        return {u: {"ok": None, "error": "node not installed"} for u in urls}
    r = run(["node", script] + urls, check=False, capture=True)
    try:
        return json.loads(r.stdout)
    except Exception:
        msg = (r.stderr or r.stdout or "").strip().splitlines()[-1:] or ["no output"]
        return {u: {"ok": None, "error": "browser check failed: " + msg[0]} for u in urls}


def verify(rows, base, use_browser, wait_for_deploy):
    urls = {r["id"]: base + "audio/%s.m4a" % r["id"] for r in rows}
    # Wait for Pages to publish (new files 404 until the deploy finishes).
    if wait_for_deploy:
        deadline = time.time() + 600
        pending = set(urls)
        while pending and time.time() < deadline:
            for i in list(pending):
                st, _, total = head_range(urls[i])
                row = next(r for r in rows if r["id"] == i)
                if st == 206 and (not row.get("bytes") or total == row["bytes"]):
                    pending.discard(i)
            if pending:
                log("Waiting for GitHub Pages to publish %d file(s)..." % len(pending))
                time.sleep(20)
    for r in rows:
        st, ct, _ = head_range(urls[r["id"]])
        r["url"] = urls[r["id"]]
        r["status"] = st
        r["ctype"] = ct
    if use_browser:
        res = browser_check(list(urls.values()))
        for r in rows:
            r["browser"] = res.get(r["url"], {})
    for r in rows:
        b = r.get("browser") or {}
        if b.get("ok") is None:
            # No AAC-capable browser here: read the remote file with ffprobe instead
            # (it uses Range requests, so this checks faststart + duration over HTTP).
            dur, ok = probe(r["url"])
            r["browser"] = {"ok": ok and dur > 1, "duration": dur, "via": "ffprobe",
                            "error": "ffprobe could not read URL" if not ok else ""}
    return rows


def fmt_dur(s):
    s = int(round(s or 0))
    return "%d:%02d" % (s // 60, s % 60)


def report(rows):
    log("")
    log("%-14s %-7s %8s %7s %6s %-12s %s" % ("episode", "hosted", "size", "dur", "range", "type", "chromium"))
    all_ok = True
    for r in rows:
        b = r.get("browser") or {}
        if b.get("ok") is True:
            bstat = "OK %s%s" % (fmt_dur(b.get("duration")), " (ffprobe; browser lacks AAC)" if b.get("via") else "")
            if r.get("duration") and abs(b.get("duration", 0) - r["duration"]) > 2:
                bstat += " (MISMATCH)"
                all_ok = False
        elif not b:
            bstat = "-"
        else:
            bstat = "FAIL " + str(b.get("error", ""))[:40]
            all_ok = False
        st = r.get("status", "-")
        ct = (r.get("ctype") or "-")[:12]
        if r.get("status") is not None and (st != 206 or not str(r.get("ctype", "")).startswith("audio/")):
            all_ok = False
        size = "%.1f MB" % (r["bytes"] / 1e6) if r.get("bytes") else "-"
        log("%-14s %-7s %8s %7s %6s %-12s %s" % (r["id"], "yes" if r.get("hosted") else "no",
                                                 size, fmt_dur(r.get("duration")), st, ct, bstat))
    return all_ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", nargs="?")
    ap.add_argument("--no-push", action="store_true")
    ap.add_argument("--verify-only", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--branch", default="main")
    a = ap.parse_args()
    base = a.base if a.base.endswith("/") else a.base + "/"

    for tool in ("ffmpeg", "ffprobe", "git"):
        if not shutil.which(tool):
            sys.exit("Missing required tool: %s" % tool)

    if a.verify_only:
        data = load_episodes()
        rows = []
        for e in data["episodes"]:
            if e.get("audio", "").startswith("audio/"):
                p = os.path.join(ROOT, e["audio"])
                rows.append({"id": e["id"], "hosted": True,
                             "bytes": os.path.getsize(p) if os.path.exists(p) else None,
                             "duration": probe(p)[0] if os.path.exists(p) else None})
        if not rows:
            sys.exit("No hosted episodes in episodes.json.")
        verify(rows, base, not a.no_browser, wait_for_deploy=False)
        sys.exit(0 if report(rows) else 1)

    if not a.folder or not os.path.isdir(a.folder):
        sys.exit("Give the folder that contains the <id>.m4a files.")

    if not a.no_push:
        log("git pull --rebase ...")
        run(["git", "pull", "--rebase", "origin", a.branch])

    data = load_episodes()
    ids = {e["id"].lower(): e for e in data["episodes"]}
    found, skipped = find_sources(a.folder, ids)
    for n in skipped:
        log("WARN  skipping %r: name is not an episode ID from episodes.json" % n)
    if not found:
        sys.exit("No files named <episode-id>.m4a found in %s" % a.folder)

    os.makedirs(AUDIO_DIR, exist_ok=True)
    rows = []
    order = [e["id"] for e in data["episodes"]]
    for eid in sorted(found, key=lambda i: order.index(ids[i]["id"])):
        src = found[eid]
        real_id = ids[eid]["id"]
        dst = os.path.join(AUDIO_DIR, real_id + ".m4a")
        row = {"id": real_id, "hosted": False}
        dur_in, has_audio = probe(src)
        if not has_audio or dur_in < 60:
            log("WARN  %s: not a usable audio file (duration %.0fs) - skipped" % (os.path.basename(src), dur_in))
            rows.append(row)
            continue
        if os.path.exists(dst) and not a.force and os.path.getmtime(dst) >= os.path.getmtime(src):
            log("keep  %s (already encoded)" % real_id)
        else:
            log("enc   %s  <- %s (%.1f MB, %s)" % (real_id, os.path.basename(src),
                                                 os.path.getsize(src) / 1e6, fmt_dur(dur_in)))
            encode(src, dst)
        dur_out, ok = probe(dst)
        size = os.path.getsize(dst)
        if not ok or abs(dur_out - dur_in) > 2:
            log("WARN  %s: encoded duration %.1fs differs from source %.1fs" % (real_id, dur_out, dur_in))
        if size > 95 * 1024 * 1024:
            log("WARN  %s: %.0f MB is too close to GitHub's 100 MB file limit - skipped" % (real_id, size / 1e6))
            os.remove(dst)
            rows.append(row)
            continue
        row.update(hosted=True, bytes=size, duration=dur_out)
        e = ids[eid]
        e["audio"] = "audio/%s.m4a" % real_id
        e["driveId"] = ""
        rows.append(row)

    hosted = [r for r in rows if r["hosted"]]
    save_episodes(data)
    log("episodes.json updated (%d hosted in this run)." % len(hosted))

    if a.no_push:
        report(rows)
        log("\n--no-push: nothing committed. Review with: git status && git diff episodes.json")
        return

    pushed = git_push(a.branch, "Sync audio: %s" % ", ".join(r["id"] for r in hosted),
                      ["audio", "episodes.json"])
    verify(hosted, base, not a.no_browser, wait_for_deploy=True)
    ok = report(rows)
    if not ok:
        log("\nSome checks failed - see the table above.")
        sys.exit(1)
    log("\nAll hosted episodes verified%s." % ("" if pushed else " (no new commit was needed)"))


if __name__ == "__main__":
    main()
