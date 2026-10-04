// AL-RABI' — Arab Spring audio player (Scriptable, iPhone)
// Paste into a new Scriptable script named exactly:  AS-Player
// Shares progress with the flashcard script (AS-Cards) through one JSON file.

const BASE = "https://iamrichardmaier-sudo.github.io/arab-spring-podcast/"; // <- change if your Pages URL differs
const STATE_FILE = "arab-spring-progress.json";

// ---------- storage (iCloud Drive if Scriptable has it, else on-device) ----------
let fm = FileManager.iCloud();
try { fm.documentsDirectory(); } catch (e) { fm = FileManager.local(); }
const dir = fm.documentsDirectory();
const P = (n) => fm.joinPath(dir, n);

async function readJSON(name, fallback) {
  const p = P(name);
  try {
    if (fm.fileExists(p)) {
      try { if (fm.isFileStoredIniCloud(p) && !fm.isFileDownloaded(p)) await fm.downloadFileFromiCloud(p); } catch (e) {}
      return JSON.parse(fm.readString(p));
    }
  } catch (e) {}
  return fallback;
}
function writeJSON(name, obj) { fm.writeString(P(name), JSON.stringify(obj)); }

async function fetchCatalog() {
  try {
    const r = new Request(BASE + "episodes.json?t=" + Date.now());
    r.timeoutInterval = 10;
    const j = await r.loadJSON();
    if (j && j.episodes) { writeJSON("as-episodes-cache.json", j); return j; }
  } catch (e) {}
  return await readJSON("as-episodes-cache.json", { episodes: [] });
}

async function loadState() {
  const s = await readJSON(STATE_FILE, {});
  s.current = s.current || 0;
  s.positions = s.positions || {};
  s.finished = s.finished || [];
  return s;
}
async function saveMine(mine) {
  // re-read so we never overwrite what the cards script saved
  const all = await readJSON(STATE_FILE, {});
  all.current = mine.current; all.positions = mine.positions; all.finished = mine.finished;
  if (mine.stats) all.stats = mine.stats; // XP, streak, badges, speed (AS-Cards ignores this)
  writeJSON(STATE_FILE, all);
}

// Finds audio files in the repo's audio/ folder (named like syria-01.mp3) and attaches them to episodes.
const REPO_API = "https://api.github.com/repos/iamrichardmaier-sudo/arab-spring-podcast/contents/audio";
async function discoverAudio(eps) {
  let files = null;
  try {
    const r = new Request(REPO_API);
    r.headers = { Accept: "application/vnd.github+json" };
    r.timeoutInterval = 10;
    const j = await r.loadJSON();
    if (Array.isArray(j)) { files = j.map((f) => f.name); writeJSON("as-audio-cache.json", files); }
  } catch (e) {}
  if (!files) files = await readJSON("as-audio-cache.json", []);
  const byId = {};
  files.forEach((n) => {
    const m = n.match(/^(.+)\.(mp3|m4a|aac|wav|ogg)$/i);
    if (m) byId[m[1].toLowerCase()] = n;
  });
  eps.forEach((e) => {
    if (!e.audio && byId[e.id.toLowerCase()]) e.audio = "audio/" + encodeURIComponent(byId[e.id.toLowerCase()]);
  });
  return eps;
}

// ---------- widget ----------
// Small / medium / large home-screen widget plus lock-screen (accessory) widgets. Tap opens the player.
const MOD_COLORS = { master: "#e8a45c", tunisia: "#e4574e", egypt: "#d9b44a", libya: "#4fae6e", syria: "#c0504d", yemen: "#b07d4f", bahrain: "#d1495b", other: "#7c8cd6", kurds: "#f2c14e", nonstate: "#8e6bbf", external: "#4a90c8", media: "#3fb2b0", aftermath: "#9aa5b1" };
const C_INK = new Color("#f5efe6"), C_MUTE = new Color("#8fa3b8"), C_EMBER = new Color("#e8a45c");
function dayStr(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function widgetStats(st) {
  const t = st.stats || {}, xp = t.xp || 0, y = new Date(); y.setDate(y.getDate() - 1);
  const alive = t.lastDay === dayStr(new Date()) || t.lastDay === dayStr(y);
  return { xp, level: Math.floor(Math.sqrt(xp / 150)) + 1, streak: alive ? (t.streak || 0) : 0, hot: t.lastDay === dayStr(new Date()) };
}
function ringImage(frac, color, size, label, sub) {
  const dc = new DrawContext(); dc.size = new Size(size, size); dc.opaque = false; dc.respectScreenScale = true;
  const lw = Math.round(size * 0.1), r = size / 2 - lw / 2 - 1, c = size / 2;
  dc.setStrokeColor(new Color("#ffffff", 0.12)); dc.setLineWidth(lw);
  dc.strokeEllipse(new Rect(c - r, c - r, r * 2, r * 2));
  if (frac > 0) {
    const p = new Path(), steps = Math.max(2, Math.round(120 * frac)), pts = [];
    for (let i = 0; i <= steps; i++) { const a = -Math.PI / 2 + (Math.PI * 2 * frac * i) / steps; pts.push(new Point(c + r * Math.cos(a), c + r * Math.sin(a))); }
    p.addLines(pts); dc.addPath(p); dc.setStrokeColor(color); dc.setLineWidth(lw); dc.strokePath();
    // round caps
    dc.setFillColor(color);
    [pts[0], pts[pts.length - 1]].forEach((q) => dc.fillEllipse(new Rect(q.x - lw / 2, q.y - lw / 2, lw, lw)));
  }
  dc.setTextAlignedCenter();
  if (label) { dc.setFont(Font.boldRoundedSystemFont(size * 0.24)); dc.setTextColor(C_INK); dc.drawTextInRect(label, new Rect(0, c - size * (sub ? 0.2 : 0.15), size, size * 0.32)); }
  if (sub) { dc.setFont(Font.semiboldSystemFont(size * 0.1)); dc.setTextColor(C_MUTE); dc.drawTextInRect(sub, new Rect(0, c + size * 0.1, size, size * 0.16)); }
  return dc.getImage();
}
function txt(stack, s, font, color, lines) { const t = stack.addText(s); t.font = font; t.textColor = color; if (lines) t.lineLimit = lines; t.minimumScaleFactor = 0.75; return t; }
function statChip(stack, s, color) {
  const b = stack.addStack(); b.backgroundColor = new Color("#ffffff", 0.08); b.cornerRadius = 9; b.setPadding(4, 8, 4, 8);
  txt(b, s, Font.boldRoundedSystemFont(11), color || C_INK, 1);
}
async function buildWidget(cat, st) {
  const fam = config.widgetFamily || "medium";
  const eps = cat.episodes;
  const ep = eps[Math.min(st.current, Math.max(eps.length - 1, 0))];
  const ws = widgetStats(st);
  const color = new Color(ep ? MOD_COLORS[ep.module] || "#e8a45c" : "#e8a45c");
  const pos = ep ? st.positions[ep.id] || 0 : 0;
  const done = ep && st.finished.indexOf(ep.id) > -1;
  // Episode length is not in episodes.json; use the last seen duration if the player stored it, else ~20 min.
  const durs = (st.stats && st.stats.durations) || {};
  const len = ep ? durs[ep.id] || 1200 : 1200;
  const frac = done ? 1 : Math.min(1, pos / len);
  const pct = Math.round(frac * 100) + "%";
  const total = eps.length || 1, nDone = st.finished.length;
  const w = new ListWidget();
  w.url = URLScheme.forRunningScript();
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  if (fam === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const img = w.addImage(ringImage(frac, Color.white(), 64, pct)); img.centerAlignImage();
    return w;
  }
  if (fam === "accessoryRectangular" || fam === "accessoryInline") {
    txt(w, "🎙 " + (ep ? ep.title : "Al-Rabiʿ"), Font.semiboldSystemFont(13), Color.white(), 2);
    txt(w, (done ? "Finished" : pct + " · " + Math.floor(pos / 60) + " min in") + "  🔥" + ws.streak, Font.systemFont(11), Color.white(), 1);
    return w;
  }

  const g = new LinearGradient();
  g.colors = [new Color(MOD_COLORS[ep ? ep.module : "master"] || "#e8a45c", 0.35), new Color("#0d1b2a"), new Color("#1a1108")];
  g.locations = [0, 0.55, 1]; g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1);
  w.backgroundGradient = g;
  w.setPadding(14, 14, 14, 14);

  const head = w.addStack(); head.centerAlignContent();
  txt(head, "AL-RABIʿ", Font.heavySystemFont(11), C_EMBER, 1);
  head.addSpacer();
  txt(head, (ws.hot ? "🔥" : "🪵") + " " + ws.streak, Font.boldRoundedSystemFont(11), ws.hot ? new Color("#ffb35c") : C_MUTE, 1);
  w.addSpacer(fam === "small" ? 6 : 8);

  if (!ep) { txt(w, "Open the player once to load episodes.", Font.mediumSystemFont(13), C_INK, 3); return w; }
  const modLabel = ep.moduleName.replace(/ \(.*\)/, "").toUpperCase() + " · EP " + ep.n;
  const resume = done ? "Finished ✓" : pos > 5 ? "Resume · " + Math.floor(pos / 60) + " min in" : "Tap to start";

  if (fam === "small") {
    const row = w.addStack(); row.centerAlignContent();
    row.addImage(ringImage(frac, color, 46, pct)).imageSize = new Size(46, 46);
    row.addSpacer(8);
    const col = row.addStack(); col.layoutVertically();
    txt(col, "LVL " + ws.level, Font.heavyRoundedSystemFont(14), C_INK, 1);
    txt(col, ws.xp.toLocaleString() + " XP", Font.semiboldSystemFont(10), C_MUTE, 1);
    w.addSpacer(8);
    txt(w, modLabel, Font.boldSystemFont(9), color, 1);
    txt(w, ep.title, Font.boldSystemFont(14), C_INK, 2);
    w.addSpacer();
    txt(w, resume, Font.mediumSystemFont(10), C_MUTE, 1);
    return w;
  }

  const body = w.addStack(); body.centerAlignContent();
  const ring = body.addImage(ringImage(frac, color, 84, pct, done ? "DONE" : "PLAYED")); ring.imageSize = new Size(84, 84);
  body.addSpacer(12);
  const col = body.addStack(); col.layoutVertically();
  txt(col, modLabel, Font.boldSystemFont(10), color, 1);
  col.addSpacer(2);
  txt(col, ep.title, Font.boldSystemFont(16), C_INK, 2);
  col.addSpacer(3);
  txt(col, resume, Font.mediumSystemFont(11), C_MUTE, 1);
  w.addSpacer(10);
  const chips = w.addStack(); chips.spacing = 6;
  statChip(chips, "★ " + ws.xp.toLocaleString() + " XP", C_EMBER);
  statChip(chips, "LVL " + ws.level);
  statChip(chips, "✓ " + nDone + "/" + total, new Color("#7fd6a8"));

  if (fam === "large" || fam === "extraLarge") {
    w.addSpacer(12);
    // next playable episode
    let nx = null;
    for (let i = st.current + 1; i < eps.length; i++) if (eps[i].audio || eps[i].driveId) { nx = eps[i]; break; }
    if (nx) {
      const n = w.addStack(); n.layoutVertically(); n.backgroundColor = new Color("#ffffff", 0.06); n.cornerRadius = 12; n.setPadding(8, 10, 8, 10);
      txt(n, "UP NEXT · " + nx.moduleName.replace(/ \(.*\)/, "").toUpperCase() + " EP " + nx.n, Font.boldSystemFont(9), C_MUTE, 1);
      txt(n, nx.title, Font.semiboldSystemFont(13), C_INK, 1);
      w.addSpacer(10);
    }
    txt(w, "JOURNEY", Font.heavySystemFont(9), C_MUTE, 1);
    w.addSpacer(5);
    const mods = [];
    eps.forEach((e) => { let m = mods.find((x) => x.id === e.module); if (!m) { m = { id: e.module, name: e.moduleName.replace(/ \(.*\)/, ""), n: 0, d: 0 }; mods.push(m); } m.n++; if (st.finished.indexOf(e.id) > -1) m.d++; });
    const grid = w.addStack(); grid.spacing = 10;
    [mods.slice(0, Math.ceil(mods.length / 2)), mods.slice(Math.ceil(mods.length / 2))].forEach((part) => {
      const c = grid.addStack(); c.layoutVertically(); c.spacing = 4;
      part.forEach((m) => {
        const r = c.addStack(); r.centerAlignContent();
        const nm = txt(r, m.name, Font.semiboldSystemFont(9), m.d === m.n ? new Color("#7fd6a8") : C_INK, 1);
        r.addSpacer();
        const barW = 46, dc = new DrawContext(); dc.size = new Size(barW, 5); dc.opaque = false; dc.respectScreenScale = true;
        const bg = new Path(); bg.addRoundedRect(new Rect(0, 0, barW, 5), 2.5, 2.5); dc.addPath(bg); dc.setFillColor(new Color("#ffffff", 0.12)); dc.fillPath();
        if (m.d) { const fg = new Path(); fg.addRoundedRect(new Rect(0, 0, Math.max(5, barW * m.d / m.n), 5), 2.5, 2.5); dc.addPath(fg); dc.setFillColor(new Color(MOD_COLORS[m.id] || "#e8a45c")); dc.fillPath(); }
        r.addImage(dc.getImage()).imageSize = new Size(barW, 5);
      });
    });
  }
  return w;
}

// ---------- player page ----------
const TEMPLATE = "<!doctype html><html><head><meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no\">\n<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Amiri:wght@700&display=swap\" rel=\"stylesheet\">\n<style>\n:root{--bg:#0b1622;--bg2:#1a1108;--ink:#f5efe6;--mute:#8fa3b8;--dim:#5d7186;--ember:#e8a45c;--ember2:#c8651b;--card:rgba(255,255,255,.055);--card2:rgba(255,255,255,.09);--line:rgba(255,255,255,.09);--ok:#3fb27f;--accent:#e8a45c}\n*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}\nhtml,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;overflow:hidden}\nbody{background:radial-gradient(120% 60% at 50% -10%,color-mix(in srgb,var(--accent) 28%,transparent),transparent 60%),linear-gradient(175deg,var(--bg),var(--bg2));transition:background .6s}\n.app{display:flex;flex-direction:column;height:100vh;height:100dvh;max-width:480px;margin:0 auto;padding:calc(env(safe-area-inset-top) + 8px) 16px 0}\n/* header */\n.hd{display:flex;align-items:center;gap:10px;flex:none;padding:2px 2px 10px}\n.brand{flex:1;min-width:0}\n.brand b{display:block;font-size:15px;letter-spacing:.2em;color:var(--ember);font-weight:800}\n.brand span{font-family:Amiri,serif;font-size:15px;color:var(--mute)}\n.pill{display:flex;align-items:center;gap:5px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 10px;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}\n.pill.fire{color:#ffb35c}.pill.fire.cold{color:var(--dim)}\n.lvl{position:relative;width:38px;height:38px;flex:none}\n.lvl svg{position:absolute;inset:0;transform:rotate(-90deg)}\n.lvl b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800}\n/* scroll body */\n.main{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;margin:0 -16px;padding:0 16px calc(env(safe-area-inset-bottom) + 90px)}\n.main::-webkit-scrollbar{display:none}\n/* hero */\n.hero{position:relative;border-radius:26px;padding:18px 18px 16px;background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 30%,#0f1c2a),#101a26 70%);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);box-shadow:0 18px 40px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);overflow:hidden}\n.hero:before{content:\"\";position:absolute;right:-40px;top:-40px;width:180px;height:180px;opacity:.12;background:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Cpath d='M40 4l8 14 16-2-2 16 14 8-14 8 2 16-16-2-8 14-8-14-16 2 2-16-14-8 14-8-2-16 16 2z' fill='none' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E\") center/contain no-repeat;animation:spin 60s linear infinite}\n@keyframes spin{to{transform:rotate(360deg)}}\n.tag{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}\n.tag i{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent)}\n.ttl{font-size:22px;font-weight:800;line-height:1.2;margin:8px 0 2px;letter-spacing:-.01em;min-height:2.4em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n.sub{font-size:12px;color:var(--mute);min-height:16px}\n.sub.warn{color:#f3b37a}\n.disc{position:relative;width:200px;height:200px;margin:14px auto 6px}\n.disc svg.ring{position:absolute;inset:0;transform:rotate(-90deg)}\n.pp{position:absolute;inset:26px;border-radius:50%;border:0;background:radial-gradient(circle at 35% 30%,#ffd29c,var(--ember) 45%,var(--ember2));color:#2a1406;display:flex;align-items:center;justify-content:center;box-shadow:0 14px 34px rgba(200,101,27,.5),inset 0 -6px 14px rgba(0,0,0,.18);transition:transform .15s}\n.pp:active{transform:scale(.95)}\n.pp svg{width:42%;height:42%;fill:currentColor}\n.pp.dis{filter:grayscale(1) brightness(.6)}\n.eq{position:absolute;bottom:40px;left:50%;transform:translateX(-50%);display:flex;gap:3px;height:14px;align-items:flex-end;opacity:0;transition:opacity .3s}\n.playing .eq{opacity:.75}\n.eq i{width:3px;background:#2a1406;border-radius:2px;animation:eq 1s ease-in-out infinite}\n.eq i:nth-child(2){animation-delay:-.4s}.eq i:nth-child(3){animation-delay:-.7s}.eq i:nth-child(4){animation-delay:-.2s}\n@keyframes eq{0%,100%{height:3px}50%{height:14px}}\n.pct{text-align:center;font-size:11px;color:var(--mute);font-weight:600;letter-spacing:.08em}\ninput[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:30px;background:transparent;margin:0}\ninput[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,var(--accent) var(--p,0%),rgba(255,255,255,.14) var(--p,0%))}\ninput[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;margin-top:-7px;box-shadow:0 2px 8px rgba(0,0,0,.4)}\n.times{display:flex;justify-content:space-between;font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums;margin-top:-4px}\n.ctl{display:flex;align-items:center;justify-content:space-between;margin:10px 0 2px}\nbutton{font-family:inherit;border:0;color:var(--ink);background:none;padding:0;display:flex;align-items:center;justify-content:center;cursor:pointer}\n.ib{width:48px;height:48px;border-radius:50%}\n.ib svg{width:26px;height:26px;fill:currentColor}\n.ib:active,.sk:active,.chip:active{background:var(--card2)}\n.sk{width:58px;height:58px;border-radius:50%;background:var(--card);border:1px solid var(--line);position:relative}\n.sk svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:2}\n.sk b{position:absolute;font-size:10px;font-weight:800}\n/* speed */\n.spd{margin-top:14px;background:rgba(0,0,0,.18);border:1px solid var(--line);border-radius:18px;padding:10px 14px 12px}\n.spd .row{display:flex;align-items:center;justify-content:space-between}\n.spd label{font-size:11px;font-weight:700;letter-spacing:.12em;color:var(--mute);text-transform:uppercase}\n.spd .val{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--accent)}\n.spd .val small{font-size:12px;color:var(--mute);font-weight:600;margin-left:6px}\n.chips{display:flex;gap:6px;margin-top:4px}\n.chip{flex:1;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:7px 0;font-size:12px;font-weight:700;color:var(--mute)}\n.chip.on{background:var(--accent);color:#22140a;border-color:transparent}\n.acts{display:flex;gap:8px;margin-top:12px}\n.act{flex:1;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:11px 0;font-size:13px;font-weight:700;gap:6px}\n.act svg{width:16px;height:16px;fill:currentColor}\n/* tabs */\n.tabs{display:flex;gap:6px;margin:20px 0 10px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px}\n.tab{flex:1;padding:9px 0;border-radius:10px;font-size:13px;font-weight:700;color:var(--mute)}\n.tab.on{background:var(--card2);color:var(--ink)}\n/* journey */\n.mod{margin-bottom:14px;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden}\n.mh{display:flex;align-items:center;justify-content:flex-start;gap:12px;padding:12px 14px;width:100%;text-align:left}\n.mi{width:38px;height:38px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;font-size:18px;background:color-mix(in srgb,var(--c) 22%,transparent);border:1px solid color-mix(in srgb,var(--c) 50%,transparent)}\n.mod.done .mi{background:var(--c);}\n.mn{flex:1;min-width:0}\n.mn b{display:block;font-size:15px}\n.bar{height:5px;border-radius:3px;background:rgba(255,255,255,.1);margin-top:6px;overflow:hidden}\n.bar i{display:block;height:100%;border-radius:3px;background:var(--c);transition:width .5s}\n.mc{font-size:12px;color:var(--mute);font-weight:700;font-variant-numeric:tabular-nums}\n.chev{width:18px;height:18px;fill:var(--mute);transition:transform .25s}\n.mod.open .chev{transform:rotate(90deg)}\n.eps{display:none;padding:0 10px 10px}\n.mod.open .eps{display:block}\n.ep{display:flex;gap:12px;align-items:center;justify-content:flex-start;padding:10px 8px;border-radius:12px;width:100%;text-align:left}\n.ep:active{background:var(--card2)}\n.ep.cur{background:color-mix(in srgb,var(--accent) 16%,transparent)}\n.num{width:30px;height:30px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;background:rgba(255,255,255,.08);position:relative}\n.num svg{position:absolute;inset:-3px;transform:rotate(-90deg)}\n.ep.done .num{background:var(--ok);color:#fff}\n.ep.na{opacity:.45}\n.et{font-size:14px;font-weight:600;line-height:1.25}\n.es{font-size:11px;color:var(--mute);margin-top:2px}\n.ep.cur .es{color:var(--accent)}\n/* stats */\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}\n.stat{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px}\n.stat b{display:block;font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}\n.stat span{font-size:11px;color:var(--mute);font-weight:700;letter-spacing:.08em;text-transform:uppercase}\n.week{display:flex;gap:6px;align-items:flex-end;height:70px;margin-top:10px}\n.week div{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}\n.week i{display:block;width:100%;border-radius:6px;background:var(--accent);min-height:3px;opacity:.85}\n.week small{font-size:10px;color:var(--mute);font-weight:700}\n.h3{font-size:12px;font-weight:800;letter-spacing:.12em;color:var(--mute);text-transform:uppercase;margin:18px 2px 10px}\n.badges{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}\n.bdg{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}\n.bdg div{width:58px;height:58px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:26px;background:var(--card);border:1px solid var(--line);filter:grayscale(1);opacity:.35}\n.bdg.on div{filter:none;opacity:1;background:linear-gradient(145deg,color-mix(in srgb,var(--c,var(--ember)) 45%,transparent),rgba(255,255,255,.04));border-color:color-mix(in srgb,var(--c,var(--ember)) 60%,transparent);box-shadow:0 6px 18px color-mix(in srgb,var(--c,var(--ember)) 30%,transparent)}\n.bdg span{font-size:10px;font-weight:700;color:var(--mute);line-height:1.2}\n.bdg.on span{color:var(--ink)}\n/* mini player */\n.mini{position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 10px);max-width:456px;margin:0 auto;display:flex;align-items:center;gap:10px;padding:8px 8px 8px 14px;border-radius:18px;background:rgba(20,30,42,.86);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid var(--line);box-shadow:0 10px 30px rgba(0,0,0,.5);transform:translateY(140%);transition:transform .3s}\n.mini.show{transform:none}\n.mini .t{flex:1;min-width:0}\n.mini .t b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.mini .t span{font-size:11px;color:var(--mute)}\n.mini .bar{margin-top:5px}\n.mini .pp2{width:42px;height:42px;border-radius:50%;background:var(--accent);color:#22140a}\n.mini .pp2 svg{width:20px;height:20px;fill:currentColor}\n/* overlays */\n.toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 12px);transform:translate(-50%,-160%);background:rgba(20,30,42,.95);border:1px solid color-mix(in srgb,var(--accent) 60%,transparent);border-radius:999px;padding:9px 16px;font-size:13px;font-weight:700;display:flex;gap:8px;align-items:center;transition:transform .35s cubic-bezier(.2,1.4,.4,1);z-index:30;white-space:nowrap;box-shadow:0 10px 30px rgba(0,0,0,.5)}\n.toast.show{transform:translate(-50%,0)}\n.toast b{color:var(--accent)}\n.ov{position:fixed;inset:0;z-index:20;display:flex;align-items:flex-end;justify-content:center;background:rgba(5,10,16,.6);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;pointer-events:none;transition:opacity .25s}\n.ov.show{opacity:1;pointer-events:auto}\n.sheet{width:100%;max-width:480px;margin:0 12px calc(env(safe-area-inset-bottom) + 12px);background:#132030;border:1px solid var(--line);border-radius:26px;padding:22px 20px 18px;text-align:center;transform:translateY(30px);transition:transform .3s}\n.ov.show .sheet{transform:none}\n.sheet .big{font-size:52px;line-height:1}\n.sheet h2{margin:10px 0 4px;font-size:20px}\n.sheet p{margin:0;color:var(--mute);font-size:14px;line-height:1.4}\n.sheet .cd{font-size:13px;color:var(--accent);font-weight:700;margin-top:10px}\n.btns{display:flex;gap:10px;margin-top:16px}\n.btn{flex:1;padding:14px 0;border-radius:14px;font-size:15px;font-weight:800;background:var(--card2)}\n.btn.pri{background:linear-gradient(135deg,var(--ember),var(--ember2));color:#22140a}\ncanvas#fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:40}\n</style></head><body>\n<canvas id=\"fx\"></canvas>\n<div class=\"app\">\n  <div class=\"hd\">\n    <div class=\"brand\"><b>AL-RABI&#703;</b><span dir=\"rtl\">&#1575;&#1604;&#1585;&#1576;&#1610;&#1593; &#1575;&#1604;&#1593;&#1585;&#1576;&#1610;</span></div>\n    <div class=\"pill fire\" id=\"streak\">&#128293; 0</div>\n    <div class=\"pill\" id=\"xp\">&#9733; 0</div>\n    <div class=\"lvl\"><svg viewBox=\"0 0 38 38\"><circle cx=\"19\" cy=\"19\" r=\"16\" fill=\"none\" stroke=\"rgba(255,255,255,.12)\" stroke-width=\"3\"/><circle id=\"lvlRing\" cx=\"19\" cy=\"19\" r=\"16\" fill=\"none\" stroke=\"var(--ember)\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-dasharray=\"100.5\" stroke-dashoffset=\"100.5\"/></svg><b id=\"lvl\">1</b></div>\n  </div>\n  <div class=\"main\" id=\"main\">\n    <div class=\"hero\" id=\"hero\">\n      <div class=\"tag\" id=\"tag\"><i></i><span id=\"mod\"></span></div>\n      <div class=\"ttl\" id=\"ttl\"></div>\n      <div class=\"sub\" id=\"sub\"></div>\n      <div class=\"disc\">\n        <svg class=\"ring\" viewBox=\"0 0 200 200\"><circle cx=\"100\" cy=\"100\" r=\"92\" fill=\"none\" stroke=\"rgba(255,255,255,.08)\" stroke-width=\"8\"/><circle id=\"ring\" cx=\"100\" cy=\"100\" r=\"92\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"8\" stroke-linecap=\"round\" stroke-dasharray=\"578\" stroke-dashoffset=\"578\" style=\"transition:stroke-dashoffset .4s;filter:drop-shadow(0 0 6px var(--accent))\"/></svg>\n        <button class=\"pp\" id=\"pp\" aria-label=\"Play\"><svg viewBox=\"0 0 24 24\" id=\"ppi\"></svg></button>\n        <div class=\"eq\"><i></i><i></i><i></i><i></i></div>\n      </div>\n      <div class=\"pct\" id=\"pct\">0% LISTENED</div>\n      <input type=\"range\" id=\"seek\" min=\"0\" max=\"1000\" value=\"0\">\n      <div class=\"times\"><span id=\"cur\">0:00</span><span id=\"left\">-0:00</span></div>\n      <div class=\"ctl\">\n        <button class=\"ib\" id=\"prev\" aria-label=\"Previous episode\"><svg viewBox=\"0 0 24 24\"><path d=\"M6 6h2v12H6zM20 6v12L9.5 12z\"/></svg></button>\n        <button class=\"sk\" id=\"b15\" aria-label=\"Back 15 seconds\"><svg viewBox=\"0 0 24 24\"><path d=\"M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4\"/></svg><b>15</b></button>\n        <button class=\"sk\" id=\"f30\" aria-label=\"Forward 30 seconds\"><svg viewBox=\"0 0 24 24\"><path d=\"M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4\"/></svg><b>30</b></button>\n        <button class=\"ib\" id=\"next\" aria-label=\"Next episode\"><svg viewBox=\"0 0 24 24\"><path d=\"M16 6h2v12h-2zM4 6v12l10.5-6z\"/></svg></button>\n      </div>\n      <div class=\"spd\">\n        <div class=\"row\"><label for=\"rate\">Speed</label><div class=\"val\"><span id=\"rv\">1.00&times;</span><small id=\"rsave\"></small></div></div>\n        <input type=\"range\" id=\"rate\" min=\"0.75\" max=\"2.5\" step=\"0.05\" value=\"1\">\n        <div class=\"chips\" id=\"chips\"></div>\n      </div>\n      <div class=\"acts\">\n        <button class=\"act\" id=\"mark\"><svg viewBox=\"0 0 24 24\"><path d=\"M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z\"/></svg><span>Mark finished</span></button>\n        <button class=\"act\" id=\"restart\"><svg viewBox=\"0 0 24 24\"><path d=\"M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z\"/></svg><span>Restart</span></button>\n      </div>\n    </div>\n    <div class=\"tabs\"><button class=\"tab on\" data-t=\"journey\">Journey</button><button class=\"tab\" data-t=\"stats\">Stats &amp; badges</button></div>\n    <div id=\"journey\"></div>\n    <div id=\"stats\" style=\"display:none\"></div>\n  </div>\n</div>\n<div class=\"mini\" id=\"mini\"><div class=\"t\"><b id=\"mt\"></b><span id=\"ms\"></span><div class=\"bar\"><i id=\"mbar\" style=\"width:0;background:var(--accent)\"></i></div></div><button class=\"pp2\" id=\"mpp\" aria-label=\"Play or pause\"><svg viewBox=\"0 0 24 24\" id=\"mppi\"></svg></button></div>\n<div class=\"toast\" id=\"toast\"></div>\n<div class=\"ov\" id=\"ov\"><div class=\"sheet\" id=\"sheet\"></div></div>\n<script>\nvar DATA=${data};\nvar BASE=DATA.base||\"\",eps=DATA.episodes||[],S=DATA.state||{};\nS.current=S.current||0;S.positions=S.positions||{};S.finished=S.finished||[];\nvar T=S.stats=S.stats||{};T.xp=T.xp||0;T.speed=T.speed||1;T.streak=T.streak||0;T.best=T.best||0;T.lastDay=T.lastDay||\"\";T.days=T.days||{};T.badges=T.badges||[];T.listened=T.listened||0;\nwindow.AS_STATE=S;\nvar A=new Audio();A.preload=\"metadata\";\nvar PLAY='<path d=\"M8 5v14l11-7z\"/>',PAUSE='<path d=\"M6 5h4v14H6zM14 5h4v14h-4z\"/>';\nvar MODS={master:[\"#e8a45c\",\"\ud83c\udf0d\"],tunisia:[\"#e4574e\",\"\ud83c\udf3c\"],egypt:[\"#d9b44a\",\"\ud83d\udd3a\"],libya:[\"#4fae6e\",\"\u2694\ufe0f\"],syria:[\"#c0504d\",\"\ud83d\udd4c\"],yemen:[\"#b07d4f\",\"\u26f0\ufe0f\"],bahrain:[\"#d1495b\",\"\ud83d\udc8e\"],other:[\"#7c8cd6\",\"\ud83e\udded\"],kurds:[\"#f2c14e\",\"\u2600\ufe0f\"],nonstate:[\"#8e6bbf\",\"\ud83d\udea9\"],external:[\"#4a90c8\",\"\ud83c\udf10\"],media:[\"#3fb2b0\",\"\ud83d\udce1\"],aftermath:[\"#9aa5b1\",\"\ud83d\udd4a\ufe0f\"]};\nfunction mc(m){return (MODS[m]||[\"#e8a45c\",\"\u2605\"])[0]}\nfunction mi(m){return (MODS[m]||[\"#e8a45c\",\"\u2605\"])[1]}\nfunction $(i){return document.getElementById(i)}\nfunction esc(s){return String(s||\"\").replace(/[&<>\"]/g,function(c){return{\"&\":\"&amp;\",\"<\":\"&lt;\",\">\":\"&gt;\",'\"':\"&quot;\"}[c]})}\nfunction fmt(t){t=Math.max(0,Math.floor(t||0));var h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return (h?h+\":\"+(m<10?\"0\":\"\"):\"\")+m+\":\"+(s<10?\"0\":\"\")+s}\nfunction srcList(e){var l=[];if(e.audio)l.push(/^https?:/.test(e.audio)?e.audio:BASE+e.audio);if(e.driveId){l.push(\"https://drive.usercontent.google.com/download?id=\"+e.driveId+\"&export=download&confirm=t\")}return l}\nfunction has(e){return srcList(e).length>0}\nfunction isDone(id){return S.finished.indexOf(id)>-1}\nfunction today(d){d=d||new Date();return d.getFullYear()+\"-\"+(\"0\"+(d.getMonth()+1)).slice(-2)+\"-\"+(\"0\"+d.getDate()).slice(-2)}\nfunction level(xp){return Math.floor(Math.sqrt(xp/150))+1}\nfunction lvlXp(l){return 150*(l-1)*(l-1)}\nvar MODLIST=[];eps.forEach(function(e){if(MODLIST.indexOf(e.module)<0)MODLIST.push(e.module)});\nfunction modName(m){for(var i=0;i<eps.length;i++)if(eps[i].module===m)return eps[i].moduleName;return m}\nfunction modEps(m){return eps.filter(function(e){return e.module===m})}\nfunction modDone(m){var l=modEps(m);return l.length&&l.every(function(e){return isDone(e.id)})}\n\n/* ---------- badges ---------- */\nvar BADGES=[\n {id:\"first\",ic:\"\ud83d\udd25\",n:\"First spark\",d:\"Finish your first episode\",t:function(){return S.finished.length>=1}},\n {id:\"five\",ic:\"\ud83d\udcda\",n:\"Scholar\",d:\"Finish 5 episodes\",t:function(){return S.finished.length>=5}},\n {id:\"twenty\",ic:\"\ud83c\udf93\",n:\"Historian\",d:\"Finish 20 episodes\",t:function(){return S.finished.length>=20}},\n {id:\"s3\",ic:\"\u26a1\",n:\"3-day streak\",d:\"Listen 3 days in a row\",t:function(){return T.best>=3}},\n {id:\"s7\",ic:\"\ud83c\udf19\",n:\"Week of fire\",d:\"Listen 7 days in a row\",t:function(){return T.best>=7}},\n {id:\"fast\",ic:\"\ud83d\ude80\",n:\"Speed listener\",d:\"Finish an episode at 1.5\u00d7 or faster\",t:function(){return !!T.fastFinish}},\n {id:\"hours\",ic:\"\u23f3\",n:\"Ten hours\",d:\"Listen to 10 hours of audio\",t:function(){return T.listened>=36000}},\n {id:\"all\",ic:\"\ud83c\udfc6\",n:\"Revolutionary\",d:\"Finish every episode\",t:function(){return eps.length&&S.finished.length>=eps.length}}\n];\nMODLIST.forEach(function(m){BADGES.push({id:\"mod-\"+m,ic:mi(m),n:modName(m).replace(/ \\(.*\\)/,\"\"),d:\"Finish the \"+modName(m)+\" module\",c:mc(m),t:function(){return modDone(m)}})});\nfunction checkBadges(){var got=[];BADGES.forEach(function(b){if(T.badges.indexOf(b.id)<0&&b.t()){T.badges.push(b.id);got.push(b)}});return got}\n\n/* ---------- XP / streak ---------- */\nfunction addXP(n,why){if(n<=0)return;var before=level(T.xp);T.xp+=n;if(why)toast(\"+\"+n+\" XP\",\"\u2009\"+why);if(level(T.xp)>before){setTimeout(function(){toast(\"\u2b50 Level \"+level(T.xp),\"reached!\");confetti(80)},why?1800:0)}renderHUD()}\nvar xpCarry=0;\nfunction credit(sec){ // content-seconds actually played\n  T.listened+=sec;var d=today();T.days[d]=(T.days[d]||0)+sec;\n  xpCarry+=sec;if(xpCarry>=6){var n=Math.floor(xpCarry/6);xpCarry-=n*6;T.xp+=n;renderHUD()} // 10 XP per minute\n  if(T.lastDay!==d&&T.days[d]>=120){ // 2 min counts as a listening day\n    var y=new Date();y.setDate(y.getDate()-1);\n    T.streak=(T.lastDay===today(y))?T.streak+1:1;T.lastDay=d;T.best=Math.max(T.best,T.streak);\n    toast(\"\ud83d\udd25 \"+T.streak+\"-day streak\",T.streak>1?\"keep it going!\":\"started\");renderHUD();celebrate(checkBadges());\n  }\n  // keep only 60 days of history\n  var ks=Object.keys(T.days);if(ks.length>60){ks.sort();delete T.days[ks[0]]}\n}\nfunction streakAlive(){if(!T.lastDay)return false;var y=new Date();y.setDate(y.getDate()-1);return T.lastDay===today()||T.lastDay===today(y)}\n\n/* ---------- player ---------- */\nvar tryIdx=0,wantPlay=false,lastT=null,lastSave=0,upTimer=null;\nfunction cur(){return eps[S.current]}\nfunction setRate(r,quiet){r=Math.round(Math.max(.75,Math.min(2.5,r))*20)/20;T.speed=r;A.playbackRate=r;try{A.defaultPlaybackRate=r}catch(e){}\n  $(\"rate\").value=r;$(\"rate\").style.setProperty(\"--p\",((r-.75)/1.75*100)+\"%\");$(\"rv\").innerHTML=r.toFixed(2)+\"&times;\";\n  [].forEach.call(document.querySelectorAll(\".chip\"),function(c){c.classList.toggle(\"on\",Math.abs(+c.dataset.r-r)<.001)});updTimes()}\nfunction load(i,play){\n  if(!eps.length)return;i=Math.max(0,Math.min(i,eps.length-1));clearUp();\n  S.current=i;var e=eps[i],c=mc(e.module);\n  document.documentElement.style.setProperty(\"--accent\",c);\n  $(\"mod\").textContent=e.moduleName.replace(/ \\(.*\\)/,\"\")+\" \u00b7 Episode \"+e.n;$(\"ttl\").textContent=e.title;\n  $(\"mt\").textContent=e.title;$(\"ms\").textContent=e.moduleName.replace(/ \\(.*\\)/,\"\")+\" \u00b7 Ep \"+e.n;\n  A.pause();tryIdx=0;wantPlay=!!play;lastT=null;\n  var l=srcList(e);\n  if(!l.length){A.removeAttribute(\"src\");A.load();sub(\"This episode isn\u2019t uploaded yet. It will appear here after the next audio sync.\",true);$(\"pp\").classList.add(\"dis\");setIcon(false);showProg(0,0);renderJourney();meta();return}\n  $(\"pp\").classList.remove(\"dis\");\n  sub(isDone(e.id)?\"Finished \u2713 \u2014 listen again any time\":(S.positions[e.id]>5?\"Resuming at \"+fmt(S.positions[e.id]):\"Ready to play\"));\n  A.src=l[0];setRate(T.speed,true);showProg(S.positions[e.id]||0,0);\n  if(play)playNow();\n  renderJourney();meta();\n}\nfunction playNow(){var p=A.play();if(p&&p.catch)p.catch(function(){setIcon(false)})}\nfunction sub(t,warn){$(\"sub\").textContent=t;$(\"sub\").classList.toggle(\"warn\",!!warn)}\nA.onloadedmetadata=function(){var e=cur();if(!e)return;if(isFinite(A.duration)){T.durations=T.durations||{};T.durations[e.id]=Math.round(A.duration)}var p=S.positions[e.id]||0;if(p>0&&p<A.duration-5)A.currentTime=p;setRate(T.speed,true);updTimes();if(wantPlay)playNow()};\nfunction setIcon(p){$(\"ppi\").innerHTML=p?PAUSE:PLAY;$(\"mppi\").innerHTML=p?PAUSE:PLAY;$(\"hero\").classList.toggle(\"playing\",p);$(\"pp\").setAttribute(\"aria-label\",p?\"Pause\":\"Play\")}\nfunction showProg(t,d){var f=d?Math.min(1,t/d):0;$(\"ring\").style.strokeDashoffset=578*(1-f);$(\"seek\").value=f*1000;$(\"seek\").style.setProperty(\"--p\",f*100+\"%\");$(\"pct\").textContent=Math.floor(f*100)+\"% LISTENED\";$(\"mbar\").style.width=f*100+\"%\";$(\"cur\").textContent=fmt(t);$(\"left\").textContent=d?\"-\"+fmt((d-t)/(T.speed||1)):\"--:--\"}\nfunction updTimes(){if(A.duration)showProg(A.currentTime,A.duration)}\nfunction save(){var e=cur();if(e&&A.duration&&isFinite(A.currentTime)&&!isDone(e.id))S.positions[e.id]=Math.floor(A.currentTime)}\nfunction finish(auto){var e=cur();if(!e||isDone(e.id))return;S.finished.push(e.id);S.positions[e.id]=0;if(T.speed>=1.5&&auto)T.fastFinish=1;\n  var bonus=100,m=e.module;addXP(bonus,\"Episode complete\");\n  if(modDone(m))setTimeout(function(){addXP(250,modName(m).replace(/ \\(.*\\)/,\"\")+\" module complete\")},1500);\n  confetti(120);setTimeout(function(){celebrate(checkBadges())},900);renderJourney();renderStats()}\nA.ontimeupdate=function(){\n  if(!A.duration)return;var t=A.currentTime;\n  if(lastT!==null&&!A.paused){var dt=t-lastT;if(dt>0&&dt<4)credit(dt)}lastT=t;\n  updTimes();var now=Date.now();if(now-lastSave>3000){lastSave=now;save();renderEsOnly()}\n  if(t/A.duration>=.95)finish(true);\n};\nA.onseeking=function(){lastT=null};\nA.onplay=function(){setIcon(true);$(\"mini\").classList.toggle(\"show\",miniWanted());sub(isDone(cur().id)?\"Finished \u2713\":\"Playing\")};\nA.onpause=function(){setIcon(false);save();lastT=null;if(!A.ended)sub(\"Paused at \"+fmt(A.currentTime))};\nA.onwaiting=function(){sub(\"Buffering\u2026\")};A.onplaying=function(){sub(isDone(cur().id)?\"Finished \u2713\":\"Playing\")};\nA.onended=function(){finish(true);save();upNext()};\nA.onerror=function(){var e=cur(),l=e?srcList(e):[];if(!A.getAttribute(\"src\"))return;\n  if(tryIdx+1<l.length){tryIdx++;sub(\"Trying backup source\u2026\",true);A.src=l[tryIdx];if(wantPlay)playNow();return}\n  sub(\"Couldn\u2019t load this audio. Check your connection and try again.\",true);setIcon(false)};\n\n/* ---------- up next ---------- */\nfunction nextPlayable(from){for(var i=from+1;i<eps.length;i++)if(has(eps[i]))return i;return -1}\nfunction clearUp(){if(upTimer){clearInterval(upTimer);upTimer=null}closeOv()}\nfunction upNext(){var n=nextPlayable(S.current);\n  if(n<0){sheet('<div class=\"big\">\ud83c\udfc1</div><h2>You\u2019re all caught up</h2><p>New episodes appear here as they\u2019re uploaded.</p><div class=\"btns\"><button class=\"btn pri\" onclick=\"closeOv()\">Nice</button></div>');return}\n  var e=eps[n],k=6;\n  sheet('<div class=\"big\">'+mi(e.module)+'</div><p>Up next \u00b7 '+esc(e.moduleName.replace(/ \\(.*\\)/,\"\"))+' Ep '+e.n+'</p><h2>'+esc(e.title)+'</h2><div class=\"cd\" id=\"cd\">Playing in '+k+'\u2026</div><div class=\"btns\"><button class=\"btn\" id=\"ucancel\">Not now</button><button class=\"btn pri\" id=\"ugo\">Play now</button></div>');\n  $(\"ucancel\").onclick=function(){clearUp()};$(\"ugo\").onclick=function(){clearUp();load(n,true)};\n  upTimer=setInterval(function(){k--;var c=$(\"cd\");if(c)c.textContent=\"Playing in \"+k+\"\u2026\";if(k<=0){clearUp();load(n,true)}},1000)}\nfunction sheet(h){$(\"sheet\").innerHTML=h;$(\"ov\").classList.add(\"show\")}\nfunction closeOv(){$(\"ov\").classList.remove(\"show\")}\n$(\"ov\").onclick=function(ev){if(ev.target===$(\"ov\"))clearUp()};\nvar bq=[];\nfunction celebrate(list){list.forEach(function(b){bq.push(b)});if(!$(\"ov\").classList.contains(\"show\"))nextBadge()}\nfunction nextBadge(){var b=bq.shift();if(!b)return;confetti(160);addXP(50);\n  sheet('<div class=\"big\">'+b.ic+'</div><h2>Badge unlocked</h2><p><b style=\"color:var(--ink)\">'+esc(b.n)+'</b><br>'+esc(b.d)+'</p><p style=\"margin-top:8px;color:var(--accent);font-weight:700\">+50 XP</p><div class=\"btns\"><button class=\"btn pri\" id=\"bok\">Awesome</button></div>');\n  $(\"bok\").onclick=function(){closeOv();setTimeout(nextBadge,300)};renderStats()}\n\n/* ---------- toast + confetti ---------- */\nvar tq=[],tbusy=false;\nfunction toast(a,b){tq.push([a,b]);if(!tbusy)ntoast()}\nfunction ntoast(){var x=tq.shift();if(!x){tbusy=false;return}tbusy=true;$(\"toast\").innerHTML=\"<b>\"+esc(x[0])+\"</b><span>\"+esc(x[1]||\"\")+\"</span>\";$(\"toast\").classList.add(\"show\");setTimeout(function(){$(\"toast\").classList.remove(\"show\");setTimeout(ntoast,350)},1700)}\nvar fx=$(\"fx\"),cx=fx.getContext(\"2d\"),parts=[],raf=0;\nfunction confetti(n){var W=fx.width=innerWidth*devicePixelRatio,H=fx.height=innerHeight*devicePixelRatio;var cols=[\"#e8a45c\",\"#ffd29c\",\"#3fb27f\",\"#e4574e\",\"#4a90c8\",\"#f2c14e\",getComputedStyle(document.documentElement).getPropertyValue(\"--accent\")];\n  for(var i=0;i<n;i++)parts.push({x:W/2+(Math.random()-.5)*W*.3,y:H*.35,vx:(Math.random()-.5)*18*devicePixelRatio,vy:(-Math.random()*16-6)*devicePixelRatio,r:Math.random()*6+4,c:cols[i%cols.length],a:Math.random()*6,va:(Math.random()-.5)*.4,life:0});\n  if(!raf)raf=requestAnimationFrame(tick)}\nfunction tick(){var W=fx.width,H=fx.height;cx.clearRect(0,0,W,H);parts=parts.filter(function(p){return p.y<H+40&&p.life<240});\n  parts.forEach(function(p){p.life++;p.vy+=.45*devicePixelRatio;p.vx*=.985;p.x+=p.vx;p.y+=p.vy;p.a+=p.va;cx.save();cx.translate(p.x,p.y);cx.rotate(p.a);cx.fillStyle=p.c;cx.fillRect(-p.r,-p.r/2,p.r*2*devicePixelRatio/1.5,p.r*devicePixelRatio/1.5);cx.restore()});\n  raf=parts.length?requestAnimationFrame(tick):0;if(!raf)cx.clearRect(0,0,W,H)}\n\n/* ---------- render ---------- */\nfunction renderHUD(){var L=level(T.xp),a=lvlXp(L),b=lvlXp(L+1);$(\"lvl\").textContent=L;$(\"lvlRing\").style.strokeDashoffset=100.5*(1-(T.xp-a)/(b-a));\n  $(\"xp\").innerHTML=\"&#9733; \"+T.xp.toLocaleString();var alive=streakAlive();$(\"streak\").innerHTML=\"&#128293; \"+(alive?T.streak:0);$(\"streak\").classList.toggle(\"cold\",!alive||T.lastDay!==today())}\nvar openMods={};\nfunction epStatus(e,i){if(!has(e))return \"Coming soon\";if(isDone(e.id))return \"Finished\";var p=S.positions[e.id];if(i===S.current)return A.paused?(p>5?\"Paused \u00b7 \"+fmt(p):\"Up now\"):\"Now playing\";return p>5?\"Resume at \"+fmt(p):\"Ready\"}\nfunction renderJourney(){var h=\"\",ce=cur();\n  if(ce&&openMods[ce.module]===undefined)openMods[ce.module]=true;\n  MODLIST.forEach(function(m){var l=modEps(m),d=l.filter(function(e){return isDone(e.id)}).length,c=mc(m);\n    h+='<div class=\"mod'+(openMods[m]?' open':'')+(d===l.length?' done':'')+'\" style=\"--c:'+c+'\" data-m=\"'+m+'\"><button class=\"mh\"><div class=\"mi\">'+(d===l.length?'\u2713':mi(m))+'</div><div class=\"mn\"><b>'+esc(modName(m).replace(/ \\(.*\\)/,\"\"))+'</b><div class=\"bar\"><i style=\"width:'+(d/l.length*100)+'%\"></i></div></div><span class=\"mc\">'+d+'/'+l.length+'</span><svg class=\"chev\" viewBox=\"0 0 24 24\"><path d=\"M9 6l6 6-6 6\"/></svg></button><div class=\"eps\">';\n    l.forEach(function(e){var i=eps.indexOf(e),dn=isDone(e.id),p=S.positions[e.id]||0;\n      h+='<button class=\"ep'+(i===S.current?' cur':'')+(dn?' done':'')+(has(e)?'':' na')+'\" data-i=\"'+i+'\"><div class=\"num\">'+(dn?'\u2713':e.n)+'</div><div><div class=\"et\">'+esc(e.title)+'</div><div class=\"es\" id=\"es'+i+'\">'+epStatus(e,i)+'</div></div></button>'});\n    h+='</div></div>'});\n  $(\"journey\").innerHTML=h;\n  [].forEach.call(document.querySelectorAll(\".mh\"),function(b){b.onclick=function(){var m=b.parentNode.dataset.m;openMods[m]=!openMods[m];b.parentNode.classList.toggle(\"open\")}});\n  [].forEach.call(document.querySelectorAll(\".ep\"),function(b){b.onclick=function(){var i=+b.dataset.i;if(i===S.current){if(has(cur()))A.paused?playNow():A.pause();return}save();load(i,has(eps[i]));$(\"main\").scrollTo({top:0,behavior:\"smooth\"})}});\n}\nfunction renderEsOnly(){var e=cur(),n=$(\"es\"+S.current);if(e&&n)n.textContent=epStatus(e,S.current)}\nfunction renderStats(){var days=[],mx=1,i,d=new Date();\n  for(i=6;i>=0;i--){var x=new Date();x.setDate(d.getDate()-i);var s=T.days[today(x)]||0;mx=Math.max(mx,s);days.push([[\"S\",\"M\",\"T\",\"W\",\"T\",\"F\",\"S\"][x.getDay()],s])}\n  var h='<div class=\"grid\"><div class=\"stat\"><b>'+S.finished.length+'<small style=\"font-size:14px;color:var(--mute)\">/'+eps.length+'</small></b><span>Episodes done</span></div><div class=\"stat\"><b>'+(T.listened/3600).toFixed(1)+'h</b><span>Listened</span></div><div class=\"stat\"><b>'+T.streak+'</b><span>Day streak \u00b7 best '+T.best+'</span></div><div class=\"stat\"><b>'+level(T.xp)+'</b><span>Level \u00b7 '+(lvlXp(level(T.xp)+1)-T.xp)+' XP to next</span></div></div>';\n  h+='<div class=\"h3\">This week</div><div class=\"stat\"><div class=\"week\">'+days.map(function(x){return '<div><i style=\"height:'+Math.max(4,x[1]/mx*56)+'px;opacity:'+(x[1]?.9:.2)+'\"></i><small>'+x[0]+'</small></div>'}).join(\"\")+'</div></div>';\n  h+='<div class=\"h3\">Badges \u00b7 '+T.badges.length+'/'+BADGES.length+'</div><div class=\"badges\">'+BADGES.map(function(b){return '<div class=\"bdg'+(T.badges.indexOf(b.id)>-1?' on':'')+'\" style=\"'+(b.c?'--c:'+b.c:'')+'\"><div>'+b.ic+'</div><span>'+esc(b.n)+'</span></div>'}).join(\"\")+'</div>';\n  $(\"stats\").innerHTML=h}\nfunction miniWanted(){return $(\"main\").scrollTop>$(\"hero\").offsetHeight-40&&!!A.getAttribute(\"src\")}\n$(\"main\").addEventListener(\"scroll\",function(){$(\"mini\").classList.toggle(\"show\",miniWanted())},{passive:true});\nfunction meta(){try{if(!(\"mediaSession\" in navigator))return;var e=cur();navigator.mediaSession.metadata=new MediaMetadata({title:e.title,artist:\"Al-Rabi\u02bf \u00b7 \"+e.moduleName,album:\"The Arab Spring\"});\n  navigator.mediaSession.setActionHandler(\"seekbackward\",function(){skip(-15)});navigator.mediaSession.setActionHandler(\"seekforward\",function(){skip(30)});\n  navigator.mediaSession.setActionHandler(\"previoustrack\",function(){go(-1)});navigator.mediaSession.setActionHandler(\"nexttrack\",function(){go(1)})}catch(err){}}\nfunction skip(s){if(!A.duration)return;A.currentTime=Math.max(0,Math.min(A.duration-1,A.currentTime+s));updTimes()}\nfunction go(d){save();var i=S.current+d;if(d>0){var n=nextPlayable(S.current);if(n>=0)i=n}load(i,true)}\n\n/* ---------- wire up ---------- */\n$(\"pp\").onclick=$(\"mpp\").onclick=function(){if(!A.getAttribute(\"src\"))return;A.paused?playNow():A.pause()};\n$(\"b15\").onclick=function(){skip(-15)};$(\"f30\").onclick=function(){skip(30)};\n$(\"prev\").onclick=function(){go(-1)};$(\"next\").onclick=function(){go(1)};\n$(\"seek\").oninput=function(){if(A.duration){A.currentTime=$(\"seek\").value/1000*A.duration;updTimes()}};\n$(\"rate\").oninput=function(){setRate(+$(\"rate\").value)};\n[1,1.25,1.5,1.75,2].forEach(function(r){var b=document.createElement(\"button\");b.className=\"chip\";b.dataset.r=r;b.textContent=r+\"\u00d7\";b.onclick=function(){setRate(r)};$(\"chips\").appendChild(b)});\n$(\"mark\").onclick=function(){var e=cur();if(!e)return;if(isDone(e.id)){toast(\"Already finished\",\"\u2713\");return}finish(false);A.pause();upNext()};\n$(\"restart\").onclick=function(){var e=cur();if(!e)return;S.positions[e.id]=0;if(A.duration)A.currentTime=0;updTimes();sub(\"Back to the start\")};\n[].forEach.call(document.querySelectorAll(\".tab\"),function(t){t.onclick=function(){[].forEach.call(document.querySelectorAll(\".tab\"),function(x){x.classList.toggle(\"on\",x===t)});$(\"journey\").style.display=t.dataset.t===\"journey\"?\"\":\"none\";$(\"stats\").style.display=t.dataset.t===\"stats\"?\"\":\"none\";if(t.dataset.t===\"stats\")renderStats()}});\nwindow.addEventListener(\"pagehide\",save);document.addEventListener(\"visibilitychange\",function(){if(document.hidden)save()});\nsetIcon(false);renderHUD();renderStats();\nif(!eps.length){$(\"ttl\").textContent=\"No episodes yet\";sub(\"Check your internet connection and reopen.\",true)}else load(S.current,false);\ncelebrate(checkBadges());\n</script></body></html>\n";
function pageHTML(payload) {
  const data = JSON.stringify(payload).replace(/</g, "\\u003c");
  return TEMPLATE.replace("${data}", () => data);
}

async function main() {
  const cat = await fetchCatalog();
  await discoverAudio(cat.episodes);
  const st = await loadState();
  if (config.runsInWidget) {
    Script.setWidget(await buildWidget(cat, st));
    Script.complete();
    return;
  }
  const wv = new WebView();
  await wv.loadHTML(pageHTML({ base: BASE, episodes: cat.episodes, state: st }), BASE);
  let open = true, lastRaw = "";
  const shown = wv.present(true).then(() => { open = false; });
  while (open) {
    await new Promise((r) => Timer.schedule(2000, false, r));
    try {
      const raw = await wv.evaluateJavaScript("JSON.stringify(window.AS_STATE||null)", false);
      if (raw === lastRaw) continue;
      const s = JSON.parse(raw);
      if (s && s.positions) { await saveMine(s); lastRaw = raw; }
    } catch (e) {}
  }
  await shown;
  Script.complete();
}
await main();
